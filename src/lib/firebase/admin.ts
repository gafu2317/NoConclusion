import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

let adminApp: App | null = null;

type ServiceAccountJson = {
  project_id: string;
  client_email: string;
  private_key: string;
};

/** ルーム作成 API / Cron 用の資格情報が環境変数にあるか */
export function hasFirebaseAdminCredentials(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT?.trim() ||
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim(),
  );
}

function parseServiceAccountJson(): ServiceAccountJson {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (b64) {
    try {
      const text = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(text) as ServiceAccountJson;
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_BASE64 が読めない。JSON 全体を base64 したか確認して",
      );
    }
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT か FIREBASE_SERVICE_ACCOUNT_BASE64 が必要",
    );
  }

  try {
    return JSON.parse(raw) as ServiceAccountJson;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT の JSON が壊れてる (${msg})。private_key の改行は 1 行の JSON では \\n にエスケープするか、JSON ファイル全体を base64 して FIREBASE_SERVICE_ACCOUNT_BASE64 に入れて`,
    );
  }
}

export function getAdminApp(): App {
  if (adminApp) return adminApp;

  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error("NEXT_PUBLIC_FIREBASE_DATABASE_URL is required");
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT) {
    const cred = parseServiceAccountJson();
    adminApp = initializeApp({
      credential: cert({
        projectId: cred.project_id,
        clientEmail: cred.client_email,
        privateKey: cred.private_key.replace(/\\n/g, "\n"),
      }),
      databaseURL,
    });
    return adminApp;
  }

  if (getApps().length === 0) {
    adminApp = initializeApp({
      credential: applicationDefault(),
      databaseURL,
    });
  } else {
    adminApp = getApps()[0]!;
  }
  return adminApp!;
}

export function getAdminDatabase() {
  return getDatabase(getAdminApp());
}
