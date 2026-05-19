import 'server-only';
import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let adminApp: App | undefined;

export function getAdmin() {
  if (adminApp) {
    return { app: adminApp, auth: getAuth(adminApp), db: getFirestore(adminApp) as Firestore };
  }
  if (getApps().length) {
    adminApp = getApps()[0]!;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    adminApp = initializeApp({ credential: applicationDefault(), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    adminApp = initializeApp({ credential: cert(sa), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  } else {
    // On App Hosting, ADC is auto-provided
    adminApp = initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }
  const auth = getAuth(adminApp) as unknown as Auth;
  const db = getFirestore(adminApp) as Firestore;
  return { app: adminApp, auth, db };
}
