import * as admin from "firebase-admin";

function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app() as admin.app.App;
  }
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });
}

export function getFirebaseAdmin() {
  return getAdminApp();
}

export async function verifyIdToken(token: string) {
  const app = getFirebaseAdmin();
  const auth = admin.auth(app);
  const decoded = await auth.verifyIdToken(token);
  return decoded;
}
