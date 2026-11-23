import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { RoomFields } from "@/components/room-fields";
import { Card, PageHeader } from "@/components/ui";
import { createRoomAction } from "@/actions/admin";
import { redirect } from "next/navigation";
import { ROOM_ADD_DELETE_ENABLED } from "@/lib/features";

export const metadata = { title: "Add room" };

export default function NewRoom() {
  // Switched off (see src/lib/features.ts): rooms are fixed, so send anyone who finds this address back to the floor plan.
  if (!ROOM_ADD_DELETE_ENABLED) redirect("/admin/rooms");
  return (
    <>
      <BackLink href="/admin/rooms" label="Rooms & beds" />
      <PageHeader title="Add room" description="Beds are created automatically (Bed 1, Bed 2, …)." />
      <Card className="max-w-lg p-5">
        <ActionForm action={createRoomAction} submit="Add room" redirectTo="/admin/rooms" reset={false}><RoomFields /></ActionForm>
      </Card>
    </>
  );
}
