import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

let adminApp: App | null = null;

export function getAdminApp(): App {
  if (adminApp) return adminApp;

  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error("NEXT_PUBLIC_FIREBASE_DATABASE_URL is required");
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    const cred = JSON.parse(json) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
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
