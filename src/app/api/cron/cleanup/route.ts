import {
  getAdminDatabase,
  hasFirebaseAdminCredentials,
} from "@/lib/firebase/admin";
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

  if (!hasFirebaseAdminCredentials()) {
    return Response.json(
      {
        error:
          "FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_BASE64 not configured",
      },
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
    let deletedExpired = 0;
    let deletedEmpty = 0;

    for (const [code, data] of Object.entries(rooms)) {
      if (!data || typeof data !== "object") continue;

      const members = (data as { members?: Record<string, unknown> }).members;
      const memberCount =
        members && typeof members === "object"
          ? Object.keys(members).length
          : 0;

      if (memberCount === 0) {
        await db.ref(`rooms/${code}`).remove();
        deletedEmpty += 1;
        continue;
      }

      const createdAt = (data as { createdAt?: number }).createdAt;
      if (typeof createdAt === "number" && createdAt < cutoff) {
        await db.ref(`rooms/${code}`).remove();
        deletedExpired += 1;
      }
    }

    return Response.json({ deletedExpired, deletedEmpty });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: e instanceof Error ? e.message : "cleanup_failed" },
      { status: 500 },
    );
  }
}
