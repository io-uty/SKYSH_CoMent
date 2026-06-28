import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  collection,
  getFirestore,
  onSnapshot,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ?? env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ??
    env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID ?? env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

export const firebaseApp: FirebaseApp | null = hasFirebaseConfig
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const firestore: Firestore | null = firebaseApp
  ? getFirestore(firebaseApp)
  : null;

export function subscribeToCollection<T extends { id: string }>(
  collectionName: string,
  fallback: T[],
  setData: (items: T[]) => void,
): () => void {
  if (!firestore) {
    setData(fallback);
    return () => undefined;
  }

  return onSnapshot(
    collection(firestore, collectionName),
    (snapshot) => {
      const items = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[];
      setData(items.length > 0 ? items : fallback);
    },
    () => {
      setData(fallback);
    },
  );
}
