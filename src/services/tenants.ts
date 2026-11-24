import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { MAX_ACTIVE_TENANTS } from "@/lib/features";
import type { DB } from "@/db/client";
import { bedAssignments, beds, invoices, payments, rooms, sessions, tenantDocuments, tenantProfiles, users } from "@/db/schema";
import { hashPassword, passwordProblem, destroyUserSessions } from "@/lib/auth-core";
import { AppError, audit, type Q } from "./common";
import { saveDocumentTx, type ValidFile } from "./documents";
import { notifyAdmins, notifyTenant } from "./notifications";
import { formatDate, todayISO } from "@/lib/dates";

export type TenantInput = {
  name: string;
  email: string;
  phone: string;
  dateOfBirth?: string | null;
  joiningDate: string;
  monthlyRentPaise: number;
  securityDepositPaise: number;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
};

export async function assignBedTx(q: Q, tenantId: string, bedId: string, startDate: string) {
  const [bed] = await q.select().from(beds).where(eq(beds.id, bedId));
  if (!bed) throw new AppError("Bed not found");
  const [room] = await q.select().from(rooms).where(eq(rooms.id, bed.roomId));
  if (room.archivedAt) throw new AppError("That room has been removed");
  const [{ n }] = await q
    .select({ n: sql<number>`count(*)` })
    .from(bedAssignments)
    .innerJoin(beds, eq(beds.id, bedAssignments.bedId))
    .where(and(eq(beds.roomId, bed.roomId), isNull(bedAssignments.endDate)));
  if (Number(n) >= room.maxOccupancy) throw new AppError(`${room.name} is already full`);
  const [taken] = await q.select().from(bedAssignments).where(and(eq(bedAssignments.bedId, bedId), isNull(bedAssignments.endDate)));
  if (taken) throw new AppError("That bed is already occupied");
  const [current] = await q.select().from(bedAssignments).where(and(eq(bedAssignments.tenantId, tenantId), isNull(bedAssignments.endDate)));
  if (current) throw new AppError("Tenant already has a bed — move them first");
  await q.insert(bedAssignments).values({ bedId, tenantId, startDate });
}

/** Everyone who has not vacated, with the bed they have now (if any) — for choosing who sleeps where. */
export async function listActiveTenantsWithBed(db: DB) {
  return db
    .select({ id: tenantProfiles.id, name: users.name, room: rooms.name, bed: beds.bedNumber })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .leftJoin(bedAssignments, and(eq(bedAssignments.tenantId, tenantProfiles.id), isNull(bedAssignments.endDate)))
    .leftJoin(beds, eq(beds.id, bedAssignments.bedId))
    .leftJoin(rooms, eq(rooms.id, beds.roomId))
    .where(ne(tenantProfiles.status, "moved_out"))
    .orderBy(users.name);
}

/**
 * Re-arranges who sleeps in which bed of ONE room. `picks` maps each bed of the room to a tenant id, or "" for an empty bed.
 * Tenants can be swapped inside the room, brought in from another room or from "no bed", or sent to "no bed" by leaving them out.
 * Beds that are not changed are left alone. All or nothing.
 */
export async function arrangeRoomBeds(db: DB, actorId: string, roomId: string, picks: Record<string, string>, date: string) {
  return db.transaction(async (tx) => {
    const roomBeds = await tx.select().from(beds).where(eq(beds.roomId, roomId));
    if (!roomBeds.length) throw new AppError("Room not found");
    const bedIds = new Set(roomBeds.map((b) => b.id));
    const wanted = new Map<string, string>(); // tenant -> bed
    for (const [bedId, tenantId] of Object.entries(picks)) {
      if (!bedIds.has(bedId)) throw new AppError("That bed is not in this room");
      if (!tenantId) continue;
      if (wanted.has(tenantId)) throw new AppError("A tenant can only sleep in one bed. Pick each tenant once.");
      wanted.set(tenantId, bedId);
    }
    for (const tenantId of wanted.keys()) {
      const [p] = await tx.select({ status: tenantProfiles.status }).from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
      if (!p || p.status === "moved_out") throw new AppError("Only active tenants can be given a bed");
    }
    const open = await tx.select().from(bedAssignments).where(isNull(bedAssignments.endDate));
    const inRoomNow = open.filter((a) => bedIds.has(a.bedId));
    // 1) end the beds that change: people leaving this room's beds, and people moving into them
    const toEnd = new Set<string>();
    for (const a of inRoomNow) if (wanted.get(a.tenantId) !== a.bedId) toEnd.add(a.tenantId);
    for (const [tenantId, bedId] of wanted) if (!open.some((a) => a.tenantId === tenantId && a.bedId === bedId)) toEnd.add(tenantId);
    for (const tenantId of toEnd) {
      const [mine] = open.filter((a) => a.tenantId === tenantId);
      if (mine) {
        const [row] = await tx.select({ start: bedAssignments.startDate }).from(bedAssignments).where(eq(bedAssignments.id, mine.id));
        await tx.update(bedAssignments).set({ endDate: date < row.start ? row.start : date }).where(eq(bedAssignments.id, mine.id));
      }
    }
    // 2) give the new beds
    let moved = 0;
    for (const [tenantId, bedId] of wanted) {
      if (!toEnd.has(tenantId)) continue;
      await assignBedTx(tx, tenantId, bedId, date);
      moved++;
    }
    await audit(tx, actorId, "room.arrange_beds", "room", roomId, { moved, removed: [...toEnd].filter((t) => !wanted.has(t)).length });
    return { moved, removed: [...toEnd].filter((t) => !wanted.has(t)).length };
  });
}

/** A tenant corrects their OWN name, mobile number and date of birth. Everything else (rent, bed, email…) stays with the owner. */
export async function updateOwnProfile(db: DB, userId: string, v: { name: string; phone: string; dateOfBirth: string | null }) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select({ id: tenantProfiles.id }).from(tenantProfiles).where(eq(tenantProfiles.userId, userId));
    if (!p) throw new AppError("Tenant profile not found");
    await tx.update(users).set({ name: v.name.trim() }).where(eq(users.id, userId));
    await tx.update(tenantProfiles).set({ phone: v.phone, dateOfBirth: v.dateOfBirth }).where(eq(tenantProfiles.id, p.id));
    await audit(tx, userId, "tenant.self_update", "tenant", p.id);
  });
}

/** Tenants who are living here now (everyone who has not vacated). */
export async function activeTenantCount(q: Q) {
  const [r] = await q.select({ n: sql<number>`count(*)` }).from(tenantProfiles).where(ne(tenantProfiles.status, "moved_out"));
  return Number(r.n);
}

function assertRoomForTenant(active: number) {
  if (active >= MAX_ACTIVE_TENANTS) throw new AppError(`The PG already has ${MAX_ACTIVE_TENANTS} active tenants, so no more can be added. Vacate someone first.`);
}

export async function createTenant(db: DB, actorId: string, input: TenantInput & { password: string; bedId?: string | null; photo?: ValidFile | null; idProof?: { file: ValidFile; idType?: string | null } | null }) {
  const problem = passwordProblem(input.password);
  if (problem) throw new AppError(problem, "password");
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    assertRoomForTenant(await activeTenantCount(tx));
    const [dupe] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (dupe) throw new AppError("A user with this email already exists", "email");
    const [u] = await tx
      .insert(users)
      .values({ email, name: input.name.trim(), role: "tenant", passwordHash, mustChangePassword: true })
      .returning({ id: users.id });
    const [p] = await tx
      .insert(tenantProfiles)
      .values({
        userId: u.id,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth ?? null,
        joiningDate: input.joiningDate,
        monthlyRentPaise: input.monthlyRentPaise,
        securityDepositPaise: input.securityDepositPaise,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        notes: input.notes ?? null,
      })
      .returning({ id: tenantProfiles.id });
    if (input.bedId) await assignBedTx(tx, p.id, input.bedId, input.joiningDate);
    if (input.photo) await saveDocumentTx(tx, actorId, p.id, "photo", input.photo);
    if (input.idProof) await saveDocumentTx(tx, actorId, p.id, "id_proof", input.idProof.file, input.idProof.idType);
    await audit(tx, actorId, "tenant.create", "tenant", p.id, { email, bedId: input.bedId ?? null });
    return p.id;
  });
}

export type TenantUpdate = TenantInput & {
  status: "active" | "notice" | "moved_out";
  /** Required when status is moved_out. */
  moveOutDate?: string | null;
  /** undefined = leave the bed alone, "" / null = no bed. Ignored for vacated tenants. */
  bedId?: string | null;
  /** Optional: a new temporary password. */
  password?: string | null;
  photo?: ValidFile | null;
  idProof?: { file: ValidFile; idType?: string | null } | null;
};

export async function updateTenant(db: DB, actorId: string, tenantId: string, input: TenantUpdate) {
  const pw = input.password?.trim() ? input.password : null;
  if (pw) {
    const problem = passwordProblem(pw);
    if (problem) throw new AppError(problem, "password");
  }
  const passwordHash = pw ? await hashPassword(pw) : null;
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
    if (!p) throw new AppError("Tenant not found");
    const email = input.email.trim().toLowerCase();
    const [dupe] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (dupe && dupe.id !== p.userId) throw new AppError("A user with this email already exists", "email");
    const wasVacated = p.status === "moved_out";
    const willVacate = input.status === "moved_out";
    if (willVacate) {
      if (!input.moveOutDate) throw new AppError("Enter the vacated date", "moveOutDate");
      if (input.moveOutDate < input.joiningDate) throw new AppError("Vacated date is before the joining date", "moveOutDate");
    }
    await tx.update(users).set({ name: input.name.trim(), email }).where(eq(users.id, p.userId));
    await tx
      .update(tenantProfiles)
      .set({
        phone: input.phone,
        dateOfBirth: input.dateOfBirth ?? null,
        joiningDate: input.joiningDate,
        monthlyRentPaise: input.monthlyRentPaise,
        securityDepositPaise: input.securityDepositPaise,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        notes: input.notes ?? null,
      })
      .where(eq(tenantProfiles.id, tenantId));

    // status: active / notice / vacated
    if (wasVacated && !willVacate) {
      await revertVacateTx(tx, actorId, tenantId);
    } else if (!wasVacated && willVacate) {
      await vacateTenantTx(tx, actorId, tenantId, input.moveOutDate!);
    } else if (wasVacated && willVacate && input.moveOutDate !== p.moveOutDate) {
      // only the vacated date was corrected: move the end of their last stay with it
      await tx.update(bedAssignments).set({ endDate: input.moveOutDate }).where(and(eq(bedAssignments.tenantId, tenantId), eq(bedAssignments.endDate, p.moveOutDate!)));
      await tx.update(tenantProfiles).set({ moveOutDate: input.moveOutDate }).where(eq(tenantProfiles.id, tenantId));
    }
    if (!willVacate) {
      await tx.update(tenantProfiles).set({ status: input.status }).where(eq(tenantProfiles.id, tenantId));
      if (input.status === "notice" && p.status !== "notice") {
        await notifyTenant(tx, tenantId, { type: "status_notice", title: "You are on notice period", body: "The PG owner has marked your stay as notice period. Please contact them for details.", href: "/portal/profile" });
        await notifyAdmins(tx, { type: "status_notice", title: `${input.name.trim()} is on notice period`, body: "Marked by another admin.", href: `/admin/tenants/${tenantId}` }, actorId);
      }
      if (input.bedId !== undefined) {
        const wanted = input.bedId || null;
        const [cur] = await tx.select().from(bedAssignments).where(and(eq(bedAssignments.tenantId, tenantId), isNull(bedAssignments.endDate)));
        if ((cur?.bedId ?? null) !== wanted) {
          const today = todayISO();
          await moveTenantToBedTx(tx, actorId, tenantId, wanted, cur && today < cur.startDate ? cur.startDate : today);
        }
      }
    }
    if (passwordHash) {
      await tx.update(users).set({ passwordHash, mustChangePassword: true }).where(eq(users.id, p.userId));
      await tx.delete(sessions).where(eq(sessions.userId, p.userId));
      await audit(tx, actorId, "tenant.password_reset", "tenant", tenantId);
    }
    if (input.photo) await saveDocumentTx(tx, actorId, tenantId, "photo", input.photo);
    if (input.idProof) await saveDocumentTx(tx, actorId, tenantId, "id_proof", input.idProof.file, input.idProof.idType);
    await audit(tx, actorId, "tenant.update", "tenant", tenantId, { rent: input.monthlyRentPaise, status: input.status });
  });
}

export async function moveTenantToBed(db: DB, actorId: string, tenantId: string, bedId: string | null, date: string) {
  await db.transaction(async (tx) => moveTenantToBedTx(tx, actorId, tenantId, bedId, date));
}

async function moveTenantToBedTx(tx: Q, actorId: string, tenantId: string, bedId: string | null, date: string) {
  {
    const [p] = await tx.select().from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
    if (!p || p.status === "moved_out") throw new AppError("Tenant not found or has vacated");
    await tx
      .update(bedAssignments)
      .set({ endDate: date })
      .where(and(eq(bedAssignments.tenantId, tenantId), isNull(bedAssignments.endDate)));
    if (bedId) await assignBedTx(tx, tenantId, bedId, date);
    await audit(tx, actorId, bedId ? "bed.assign" : "bed.unassign", "tenant", tenantId, { bedId, date });
  }
}

/** Ends the bed assignment and marks the tenant vacated. Invoices and payments are untouched. */
export async function vacateTenant(db: DB, actorId: string, tenantId: string, date: string) {
  await db.transaction(async (tx) => vacateTenantTx(tx, actorId, tenantId, date));
}

async function vacateTenantTx(tx: Q, actorId: string, tenantId: string, date: string) {
  {
    const [p] = await tx.select().from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
    if (!p) throw new AppError("Tenant not found");
    if (p.status === "moved_out") throw new AppError("Already vacated");
    if (date < p.joiningDate) throw new AppError("Vacate date is before the joining date");
    await tx.update(bedAssignments).set({ endDate: date }).where(and(eq(bedAssignments.tenantId, tenantId), isNull(bedAssignments.endDate)));
    await tx.update(tenantProfiles).set({ status: "moved_out", moveOutDate: date }).where(eq(tenantProfiles.id, tenantId));
    await audit(tx, actorId, "tenant.move_out", "tenant", tenantId, { date });
    await notifyTenant(tx, tenantId, { type: "vacated", title: "Your stay has ended", body: `You are marked as vacated on ${formatDate(date)}. Your invoices and receipts stay available here.`, href: "/portal/rent" });
    await notifyAdmins(tx, { type: "vacated", title: "A tenant has vacated", body: `Vacate date ${formatDate(date)}.`, href: `/admin/tenants/${tenantId}` }, actorId);
  }
}

/**
 * Undoes a vacate (e.g. it was marked by mistake): the tenant is active again and billing resumes.
 * Their old bed is given back if nobody else has it now; otherwise they have no bed until you assign one.
 */
export async function revertVacate(db: DB, actorId: string, tenantId: string) {
  return db.transaction(async (tx) => revertVacateTx(tx, actorId, tenantId));
}

async function revertVacateTx(tx: Q, actorId: string, tenantId: string) {
  {
    const [p] = await tx.select().from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
    if (!p) throw new AppError("Tenant not found");
    if (p.status !== "moved_out") throw new AppError("This tenant has not vacated");
    assertRoomForTenant(await activeTenantCount(tx)); // coming back makes them active again
    await tx.update(tenantProfiles).set({ status: "active", moveOutDate: null }).where(eq(tenantProfiles.id, tenantId));
    // give the last bed back when it is still free
    const [last] = await tx.select().from(bedAssignments).where(eq(bedAssignments.tenantId, tenantId)).orderBy(desc(bedAssignments.startDate), desc(bedAssignments.createdAt)).limit(1);
    let bedBack = false;
    if (last && last.endDate && last.endDate === p.moveOutDate) {
      const [taken] = await tx.select({ id: bedAssignments.id }).from(bedAssignments).where(and(eq(bedAssignments.bedId, last.bedId), isNull(bedAssignments.endDate))).limit(1);
      if (!taken) {
        await tx.update(bedAssignments).set({ endDate: null }).where(eq(bedAssignments.id, last.id));
        bedBack = true;
      }
    }
    await audit(tx, actorId, "tenant.revert_vacate", "tenant", tenantId, { bedBack });
    await notifyTenant(tx, tenantId, { type: "status_active", title: "Your stay is active again", body: "The PG owner has reopened your stay.", href: "/portal" });
    return { bedBack };
  }
}

export async function setTenantLoginActive(db: DB, actorId: string, tenantId: string, active: boolean) {
  const [p] = await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
  if (!p) throw new AppError("Tenant not found");
  await db.update(users).set({ isActive: active }).where(eq(users.id, p.userId));
  if (!active) await destroyUserSessions(db, p.userId);
  await audit(db, actorId, active ? "tenant.login_enable" : "tenant.login_disable", "tenant", tenantId);
}

export async function resetTenantPassword(db: DB, actorId: string, tenantId: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new AppError(problem, "password");
  const [p] = await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
  if (!p) throw new AppError("Tenant not found");
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(users.id, p.userId));
  await destroyUserSessions(db, p.userId);
  await audit(db, actorId, "tenant.password_reset", "tenant", tenantId);
}

/** Hard delete only for records with no financial or bed history (e.g. created by mistake). */
export async function deleteTenant(db: DB, actorId: string, tenantId: string) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
    if (!p) throw new AppError("Tenant not found");
    const [inv] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.tenantId, tenantId)).limit(1);
    const [pay] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.tenantId, tenantId)).limit(1);
    const [asg] = await tx.select({ id: bedAssignments.id }).from(bedAssignments).where(eq(bedAssignments.tenantId, tenantId)).limit(1);
    if (inv || pay) throw new AppError("This tenant has invoices or payments. Move them out instead — history is preserved.");
    if (asg) {
      // Only a never-billed tenant: drop their bed history too.
      await tx.delete(bedAssignments).where(eq(bedAssignments.tenantId, tenantId));
    }
    await tx.delete(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
    await tx.delete(users).where(eq(users.id, p.userId));
    await audit(tx, actorId, "tenant.delete", "tenant", tenantId);
  });
}

export async function listRoomsWithBeds(q: Q) {
  const rows = await q
    .select({
      roomId: rooms.id,
      roomName: rooms.name,
      maxOccupancy: rooms.maxOccupancy,
      bathroom: rooms.hasAttachedBathroom,
      bedId: beds.id,
      bedNumber: beds.bedNumber,
      assignmentId: bedAssignments.id,
      tenantId: tenantProfiles.id,
      tenantName: users.name,
      photoId: tenantDocuments.id,
    })
    .from(rooms)
    .innerJoin(beds, eq(beds.roomId, rooms.id))
    .leftJoin(bedAssignments, and(eq(bedAssignments.bedId, beds.id), isNull(bedAssignments.endDate)))
    .leftJoin(tenantProfiles, eq(tenantProfiles.id, bedAssignments.tenantId))
    .leftJoin(users, eq(users.id, tenantProfiles.userId))
    .leftJoin(tenantDocuments, and(eq(tenantDocuments.tenantId, tenantProfiles.id), eq(tenantDocuments.kind, "photo")))
    .where(isNull(rooms.archivedAt))
    .orderBy(rooms.name, beds.bedNumber);
  const map = new Map<string, { id: string; name: string; maxOccupancy: number; bathroom: boolean; beds: { id: string; number: number; tenantId: string | null; tenantName: string | null; photoId: string | null }[] }>();
  for (const r of rows) {
    if (!map.has(r.roomId)) map.set(r.roomId, { id: r.roomId, name: r.roomName, maxOccupancy: r.maxOccupancy, bathroom: r.bathroom, beds: [] });
    map.get(r.roomId)!.beds.push({ id: r.bedId, number: r.bedNumber, tenantId: r.tenantId, tenantName: r.tenantName, photoId: r.photoId });
  }
  return [...map.values()];
}
