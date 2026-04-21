import { getAdminDatabase, hasFirebaseAdminCredentials } from "@/lib/firebase/admin";
import { isValidRoomCode } from "@/lib/roomCode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** メンバーが 0 人ならルームごと削除（クライアントの退室・キック後に呼ぶ） */
export async function POST(request: Request) {
  if (!hasFirebaseAdminCredentials()) {
    return Response.json(
      { error: "Server not configured for admin" },
      { status: 503 },
    );
  }

  let roomCode: string;
  try {
    const body = (await request.json()) as { roomCode?: string };
    roomCode = typeof body.roomCode === "string" ? body.roomCode : "";
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidRoomCode(roomCode)) {
    return Response.json({ error: "Invalid roomCode" }, { status: 400 });
  }

  try {
    const db = getAdminDatabase();
    const roomSnap = await db.ref(`rooms/${roomCode}`).get();
    if (!roomSnap.exists()) {
      return Response.json({ deleted: false, reason: "no_room" });
    }

    const membersSnap = await db.ref(`rooms/${roomCode}/members`).get();
    const members = membersSnap.val() as Record<string, unknown> | null;
    const count = members && typeof members === "object" ? Object.keys(members).length : 0;

    if (count > 0) {
      return Response.json({ deleted: false, reason: "not_empty", memberCount: count });
    }

    await db.ref(`rooms/${roomCode}`).remove();
    return Response.json({ deleted: true });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: e instanceof Error ? e.message : "vacuum_failed" },
      { status: 500 },
    );
  }
}
