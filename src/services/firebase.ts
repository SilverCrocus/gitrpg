import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function initializeFirebase(config: FirebaseConfig): void {
  if (app) return; // Already initialized

  app = initializeApp(config);
  db = getFirestore(app);
  auth = getAuth(app);
}

export function getDb(): Firestore {
  if (!db) throw new Error('Firebase not initialized. Call initializeFirebase first.');
  return db;
}

export function getAuthInstance(): Auth {
  if (!auth) throw new Error('Firebase not initialized. Call initializeFirebase first.');
  return auth;
}
