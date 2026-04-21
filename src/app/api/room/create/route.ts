import { randomBytes } from "crypto";
import { getAdminDatabase } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function genRoomCode(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += alphabet[bytes[i]! % alphabet.length];
  }
  return s;
}

export async function POST() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return Response.json(
      { error: "Server is not configured (FIREBASE_SERVICE_ACCOUNT)" },
      { status: 503 },
    );
  }

  try {
    const db = getAdminDatabase();
    let roomCode = genRoomCode();
    for (let attempt = 0; attempt < 8; attempt++) {
      const snap = await db.ref(`rooms/${roomCode}`).get();
      if (!snap.exists()) break;
      roomCode = genRoomCode();
    }

    await db.ref(`rooms/${roomCode}`).set({
      createdAt: Date.now(),
      activeTopicId: null,
      topics: {},
      members: {},
      votes: {},
    });

    return Response.json({ roomCode });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: e instanceof Error ? e.message : "create_failed" },
      { status: 500 },
    );
  }
}
