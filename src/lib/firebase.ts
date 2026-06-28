import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
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

// ─── 멘토 메시지 정제(모니터링 AI) 호출 ─────────────────────────────────────
// 멘토가 작성한 메시지를 백엔드 AI 로 보내 객관성 검수/정제한다.
// approved 면 refinedContent 를 멘티에게 전달하고, rejected 면 reason 으로 차단한다.
export type RefineResult = {
  status: "approved" | "rejected";
  refinedContent: string;
  reason: string;
};

export async function refineMentorMessage(message: string): Promise<RefineResult> {
  if (!FUNCTIONS_BASE_URL) {
    throw new Error("VITE_FUNCTIONS_BASE_URL 환경변수가 설정되지 않았습니다.");
  }

  const response = await fetch(`${FUNCTIONS_BASE_URL}/refineMentorPost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const data = (await response.json()) as {
    success: boolean;
    status?: "approved" | "rejected";
    refinedContent?: string;
    reason?: string;
    error?: string;
  };

  if (!data.success || !data.status) {
    throw new Error(data.error ?? "메시지 정제에 실패했습니다.");
  }

  return {
    status: data.status,
    refinedContent: data.refinedContent ?? "",
    reason: data.reason ?? "",
  };
}

// ─── 멘토-멘티 1:1 채팅 (Firestore 실시간 연동) ──────────────────────────────
// 메시지 경로: chats/{chatId}/messages/{messageId}
// chatId 는 (멘티 userId, 멘토 mentorId) 쌍으로 고유하게 결정된다.
export type StoredChatMessage = {
  id: string;
  author: "mentor" | "mentee";
  body: string;
  time: string;
  warning?: string;
  ts: number; // 정렬용 클라이언트 타임스탬프
};

export function buildChatId(userId: string, mentorId: string): string {
  return `${userId}__${mentorId}`;
}

// 멘티/멘토가 공유하는 채팅방 ID.
// 두 사용자가 서로 다른 브라우저여도 같은 방을 보도록 URL 쿼리(?room=)로 맞출 수 있고,
// 미지정 시 기본 공유 방으로 연결된다. (예: 멘티 탭과 멘토 탭이 자동으로 같은 방)
export const DEFAULT_CHAT_ROOM = "coment-live-room";

export function getRoomId(): string {
  if (typeof window !== "undefined") {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      return room;
    }
  }
  return DEFAULT_CHAT_ROOM;
}

// 채팅 메시지 실시간 구독 (onSnapshot 리스너)
// 멘토/멘티 어느 쪽 화면이든 같은 chatId 를 구독하면 동일한 대화가 실시간으로 동기화된다.
export function subscribeToChatMessages(
  chatId: string,
  setMessages: (messages: StoredChatMessage[]) => void,
): () => void {
  if (!firestore) {
    return () => undefined;
  }

  const messagesQuery = query(
    collection(firestore, "chats", chatId, "messages"),
    orderBy("ts", "asc"),
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs.map((docSnapshot: QueryDocumentSnapshot<DocumentData>) => {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          author: data.author,
          body: data.body,
          time: data.time,
          warning: data.warning,
          ts: data.ts ?? 0,
        } as StoredChatMessage;
      });
      setMessages(messages);
    },
    (error) => {
      console.error("채팅 구독 오류:", error);
    },
  );
}

// 채팅 메시지 추가 (멘티/멘토 공통). 리스너가 이를 감지해 양쪽 화면에 즉시 반영된다.
export async function appendChatMessage(
  chatId: string,
  message: { author: "mentor" | "mentee"; body: string; time: string; warning?: string },
): Promise<void> {
  if (!firestore) {
    return;
  }

  const payload: Record<string, unknown> = {
    author: message.author,
    body: message.body,
    time: message.time,
    ts: Date.now(),
    created_at: serverTimestamp(),
  };
  if (message.warning) {
    payload.warning = message.warning;
  }

  await addDoc(collection(firestore, "chats", chatId, "messages"), payload);

  // 채팅방 메타데이터 갱신 (목록/최근 활동 표시에 활용 가능)
  await setDoc(
    doc(firestore, "chats", chatId),
    { last_message_at: serverTimestamp() },
    { merge: true },
  );
}

// 채팅방을 최초로 열 때 시드 대화를 한 번만 저장한다 (이미 메시지가 있으면 건너뜀).
export async function seedChatIfEmpty(
  chatId: string,
  mentorMeta: { userId: string; mentorId: string; mentorName: string },
  seedMessages: Array<{ author: "mentor" | "mentee"; body: string; time: string; warning?: string }>,
): Promise<boolean> {
  if (!firestore) {
    return false;
  }

  // 이미 메시지가 존재하면 시드하지 않는다.
  const existing = await getDocs(
    query(collection(firestore, "chats", chatId, "messages"), limit(1)),
  );
  if (!existing.empty) {
    return false;
  }

  const chatRef = doc(firestore, "chats", chatId);
  await setDoc(
    chatRef,
    {
      user_id: mentorMeta.userId,
      mentor_id: mentorMeta.mentorId,
      mentor_name: mentorMeta.mentorName,
      created_at: serverTimestamp(),
    },
    { merge: true },
  );

  // 첫 메시지들에는 시간 간격을 줘서 정렬 순서를 보장한다.
  const baseTs = Date.now();
  for (let index = 0; index < seedMessages.length; index += 1) {
    const message = seedMessages[index];
    const payload: Record<string, unknown> = {
      author: message.author,
      body: message.body,
      time: message.time,
      ts: baseTs + index,
      seeded: true,
      created_at: serverTimestamp(),
    };
    if (message.warning) {
      payload.warning = message.warning;
    }
    await addDoc(collection(firestore, "chats", chatId, "messages"), payload);
  }

  return true;
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
