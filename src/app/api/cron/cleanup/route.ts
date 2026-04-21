import { getAdminDatabase } from "@/lib/firebase/admin";
import { ROOM_TTL_MS } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return Response.json(
      { error: "FIREBASE_SERVICE_ACCOUNT not configured" },
      { status: 503 },
    );
  }

  try {
    const db = getAdminDatabase();
    const snap = await db.ref("rooms").get();
    const rooms = snap.val() as
      | Record<string, { createdAt?: number } | null>
      | null;

    if (!rooms) {
      return Response.json({ deleted: 0 });
    }

    const cutoff = Date.now() - ROOM_TTL_MS;
    let deleted = 0;

    for (const [code, data] of Object.entries(rooms)) {
      const createdAt = data?.createdAt;
      if (typeof createdAt === "number" && createdAt < cutoff) {
        await db.ref(`rooms/${code}`).remove();
        deleted += 1;
      }
    }

    return Response.json({ deleted });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: e instanceof Error ? e.message : "cleanup_failed" },
      { status: 500 },
    );
  }
}
