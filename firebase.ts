// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  Auth
} from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

// ── Firebase configuration ─────────────────────────────────────────────
// Values come from your Firebase project console (Project settings → General)
const firebaseConfig = {
  apiKey: "AIzaSyDzSJPwBC1szW6yLs6wwWgj_RNPjW64ZI0",
  authDomain: "shesafe-d72a3.firebaseapp.com",
  projectId: "shesafe-d72a3",
  storageBucket: "shesafe-d72a3.firebasestorage.app",
  messagingSenderId: "11541245556",
  appId: "1:11541245556:web:bfff4cd49c7b15367fab21",
  measurementId: "G-XDDGKHSN8P"
} as const;

// ── Typed Firestore document shapes ───────────────────────────────────
export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  trust: number;           // 0 → 100, grows with good activity
  reportCount: number;     // total reports submitted
  suspicious: boolean;     // flagged by the rate-limiter heuristic
  createdAt?: Date;
  lastLogin?: Date;
}

export type ZoneStatus = "danger" | "safe" | "pending" | "flagged";

export interface SafetyReport {
  id: string;
  type: "safe" | "danger";
  lat: number;
  lng: number;
  reportedBy: string;
  reportedByName: string;
  reportedByEmail?: string | null;
  reportedByPhone?: string | null;
  timestamp: Date;
  confirmations: string[];     // uids that confirmed a safe zone
  flagged: boolean;
  expiresAt?: Date | null;     // safe zones expire after 30 minutes
}

// ── Singleton initialization ──────────────────────────────────────────
/** Initialize Firebase exactly once and return the app instance. */
function createFirebaseApp(): FirebaseApp {
  try {
    if (getApps().length === 0) {
      return initializeApp(firebaseConfig);
    }
    return getApp();
  } catch (error) {
    console.error("[firebase] Failed to initialize Firebase app:", error);
    throw error;
  }
}

const app = createFirebaseApp();

// ── Auth (persisted locally so users stay signed in across refreshes) ─
function createAuth(firebaseApp: FirebaseApp): Auth {
  const authInstance = getAuth(firebaseApp);
  authInstance.useDeviceLanguage();

  // Keep the session in localStorage (survives tab closes and refreshes)
  setPersistence(authInstance, browserLocalPersistence).catch((error) => {
    console.warn("[firebase] Could not set auth persistence:", error);
  });

  return authInstance;
}

const auth = createAuth(app);

// ── Firestore ──────────────────────────────────────────────────────────
const db: Firestore = getFirestore(app);

// ── Analytics (guarded: not supported on every browser) ───────────────
let analytics: Analytics | null = null;

(async () => {
  try {
    if (await isSupported()) {
      analytics = getAnalytics(app);
    }
  } catch (error) {
    // Analytics is best-effort — never block the app on it
    console.warn("[firebase] Analytics unavailable:", error);
  }
})();


