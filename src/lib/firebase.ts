import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { MentorPattern } from "../types";

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

// ─── 세션 유저 ID (로그인 없이 브라우저당 고유 ID 생성) ──────────────────────
export function getSessionUserId(): string {
  const KEY = "coment_uid";
  let uid = localStorage.getItem(KEY);
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem(KEY, uid);
  }
  return uid;
}

// ─── 온보딩 결과 저장 ─────────────────────────────────────────────────────────
export type OnboardingPayload = {
  userId: string;
  pattern: MentorPattern;
  investorType: string;      // "수비적인 투자자" | "중립적인 투자자" | "공격적인 투자자"
  scores: number[];
  answers: string[];
  matchedMentorId: string;
};

export async function saveOnboardingResult(payload: OnboardingPayload): Promise<void> {
  if (!firestore) {
    console.warn("Firestore 미연결 — 온보딩 결과를 로컬에만 유지합니다.");
    return;
  }

  await setDoc(
    doc(firestore, "users", payload.userId),
    {
      pattern: payload.pattern,
      investor_type: payload.investorType,
      scores: payload.scores,
      answers: payload.answers,
      matched_mentor_id: payload.matchedMentorId,
      onboarded_at: serverTimestamp(),
    },
    { merge: true },
  );
}

// ─── 멘토 채팅 API 호출 ──────────────────────────────────────────────────────
const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type MentorChatPayload = {
  mentor_id: string;
  mentor_name: string;
  mentor_style: string;
  mentor_specialty: string;
  mentor_philosophy: string;
  messages: ChatMessage[];
};

export async function callMentorChat(payload: MentorChatPayload): Promise<string> {
  if (!FUNCTIONS_BASE_URL) {
    throw new Error("VITE_FUNCTIONS_BASE_URL 환경변수가 설정되지 않았습니다.");
  }

  const response = await fetch(`${FUNCTIONS_BASE_URL}/chatWithMentor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as { success: boolean; reply?: string; error?: string };

  if (!data.success || !data.reply) {
    throw new Error(data.error ?? "멘토 응답을 받지 못했습니다.");
  }

  return data.reply;
}

// ─── 컬렉션 실시간 구독 ───────────────────────────────────────────────────────
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
