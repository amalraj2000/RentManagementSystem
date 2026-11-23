import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { bedAssignments, beds, rooms } from "@/db/schema";
import { AppError, audit } from "./common";

export type RoomInput = { name: string; bedCount: number; hasAttachedBathroom: boolean };

function checkInput(i: RoomInput) {
  if (!i.name.trim()) throw new AppError("Enter a room name", "name");
  if (!Number.isInteger(i.bedCount) || i.bedCount < 1 || i.bedCount > 4) throw new AppError("A room can have 1 to 4 beds", "bedCount");
}

const isUniqueError = (e: unknown) => /UNIQUE/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ""));

export async function createRoom(db: DB, actorId: string, input: RoomInput) {
  checkInput(input);
  try {
    return await db.transaction(async (tx) => {
      const [room] = await tx
        .insert(rooms)
        .values({ name: input.name.trim(), maxOccupancy: input.bedCount, hasAttachedBathroom: input.hasAttachedBathroom })
        .returning({ id: rooms.id });
      await tx.insert(beds).values(Array.from({ length: input.bedCount }, (_, i) => ({ roomId: room.id, bedNumber: i + 1 })));
      await audit(tx, actorId, "room.create", "room", room.id, { name: input.name, beds: input.bedCount });
      return room.id;
    });
  } catch (e) {
    if (isUniqueError(e)) throw new AppError("A room with this name already exists", "name");
    throw e;
  }
}

/** Rename, toggle bathroom, and grow/shrink the bed count. Shrinking only removes the highest-numbered beds and only if they are vacant and never used. */
export async function updateRoom(db: DB, actorId: string, id: string, input: RoomInput) {
  checkInput(input);
  try {
    await db.transaction(async (tx) => {
      const [room] = await tx.select().from(rooms).where(and(eq(rooms.id, id), isNull(rooms.archivedAt)));
      if (!room) throw new AppError("Room not found");
      const current = await tx.select().from(beds).where(eq(beds.roomId, id)).orderBy(asc(beds.bedNumber));
      if (input.bedCount > current.length) {
        const have = new Set(current.map((b) => b.bedNumber));
        const add: { roomId: string; bedNumber: number }[] = [];
        for (let n = 1; n <= 4 && current.length + add.length < input.bedCount; n++) if (!have.has(n)) add.push({ roomId: id, bedNumber: n });
        await tx.insert(beds).values(add);
      } else if (input.bedCount < current.length) {
        const remove = current.slice(input.bedCount);
        const used = await tx.select({ bedId: bedAssignments.bedId }).from(bedAssignments).where(inArray(bedAssignments.bedId, remove.map((b) => b.id)));
        if (used.length) {
          const nums = remove.filter((b) => used.some((u) => u.bedId === b.id)).map((b) => b.bedNumber).sort();
          throw new AppError(`Bed ${nums.join(", ")} is occupied or has had a tenant. Move the tenant to another bed first (beds that were ever used can't be removed).`);
        }
        await tx.delete(beds).where(inArray(beds.id, remove.map((b) => b.id)));
      }
      await tx.update(rooms).set({ name: input.name.trim(), maxOccupancy: input.bedCount, hasAttachedBathroom: input.hasAttachedBathroom }).where(eq(rooms.id, id));
      await audit(tx, actorId, "room.update", "room", id, { name: input.name, beds: input.bedCount });
    });
  } catch (e) {
    if (isUniqueError(e)) throw new AppError("A room with this name already exists", "name");
    throw e;
  }
}

/**
 * Removes a room.
 *  - someone lives there now      -> refused (move or vacate them first)
 *  - never had a tenant           -> deleted for good
 *  - had tenants in the past      -> archived: disappears from lists, capacity and the website, but bed history is kept
 */
export async function deleteRoom(db: DB, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(and(eq(rooms.id, id), isNull(rooms.archivedAt)));
    if (!room) throw new AppError("Room not found");
    const roomBeds = await tx.select({ id: beds.id }).from(beds).where(eq(beds.roomId, id));
    const ids = roomBeds.map((b) => b.id);
    if (ids.length) {
      const [now] = await tx.select({ id: bedAssignments.id }).from(bedAssignments).where(and(inArray(bedAssignments.bedId, ids), isNull(bedAssignments.endDate))).limit(1);
      if (now) throw new AppError("Someone still lives in this room. Move or vacate them first.");
      const [ever] = await tx.select({ id: bedAssignments.id }).from(bedAssignments).where(inArray(bedAssignments.bedId, ids)).limit(1);
      if (ever) {
        const stamp = new Date().toISOString().slice(0, 10);
        await tx.update(rooms).set({ archivedAt: new Date(), name: `${room.name} (removed ${stamp})`.slice(0, 80) }).where(eq(rooms.id, id));
        await audit(tx, actorId, "room.archive", "room", id, { name: room.name });
        return { archived: true };
      }
    }
    await tx.delete(beds).where(eq(beds.roomId, id));
    await tx.delete(rooms).where(eq(rooms.id, id));
    await audit(tx, actorId, "room.delete", "room", id, { name: room.name });
    return { archived: false };
  });
}

export async function roomSummaries(db: DB) {
  const rows = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      bathroom: rooms.hasAttachedBathroom,
      capacity: rooms.maxOccupancy,
      beds: sql<number>`count(distinct ${beds.id})`,
      occupied: sql<number>`count(distinct case when ${bedAssignments.id} is not null then ${beds.id} end)`,
    })
    .from(rooms)
    .leftJoin(beds, eq(beds.roomId, rooms.id))
    .leftJoin(bedAssignments, and(eq(bedAssignments.bedId, beds.id), isNull(bedAssignments.endDate)))
    .where(isNull(rooms.archivedAt))
    .groupBy(rooms.id)
    .orderBy(asc(rooms.name));
  return rows.map((r) => ({ ...r, beds: Number(r.beds), occupied: Number(r.occupied) }));
}
