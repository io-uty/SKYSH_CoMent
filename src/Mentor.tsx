import { useEffect, useMemo, useRef, useState } from "react";
import {
  appendChatMessage,
  firestore,
  getRoomId,
  refineMentorMessage,
  subscribeToChatMessages,
  type StoredChatMessage,
} from "./lib/firebase";

// 멘토가 전송할 수 없는 선동/위험 문구 (AI 정제 실패 시 로컬 폴백 가드레일)
const REJECTED_KEYWORDS = ["무조건", "영끌", "풀매수", "100% 수익", "리딩방"];

export default function Mentor() {
  const [rawInput, setRawInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [localWarning, setLocalWarning] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  const chatId = useMemo(() => getRoomId(), []);

  // 멘티와 같은 방을 실시간 구독 → 멘티가 보낸 메시지가 즉시 표시된다.
  useEffect(() => {
    if (!firestore) {
      return;
    }
    const unsubscribe = subscribeToChatMessages(chatId, setMessages);
    return () => unsubscribe();
  }, [chatId]);

  // 새 메시지가 오면 맨 아래로 스크롤
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const handleSend = async () => {
    const trimmedInput = rawInput.trim();
    if (!trimmedInput || isSending) {
      return;
    }

    setLocalWarning(null);
    setIsSending(true);

    const time = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    try {
      // 멘토 → AI 정제(모니터링) → 멘티 전달.
      // approved: 정제된 내용을 멘티에게 전송 / rejected: 차단하고 사유 표시.
      let bodyToSend = trimmedInput;
      try {
        const result = await refineMentorMessage(trimmedInput);
        if (result.status === "rejected") {
          setLocalWarning(
            `AI 모니터링이 메시지를 차단했습니다: ${result.reason || "위험·선동 표현이 감지되었습니다."}`,
          );
          setIsSending(false);
          return;
        }
        bodyToSend = result.refinedContent.trim() || trimmedInput;
      } catch (refineError) {
        // AI 정제 실패 시 로컬 키워드 가드레일로 폴백한다.
        console.error("AI 정제 실패, 로컬 가드레일로 폴백:", refineError);
        if (REJECTED_KEYWORDS.some((keyword) => trimmedInput.includes(keyword))) {
          setLocalWarning("선동·위험 문구가 포함되어 전송이 차단되었습니다. 객관적인 표현으로 수정해 주세요.");
          setIsSending(false);
          return;
        }
      }

      await appendChatMessage(chatId, { author: "mentor", body: bodyToSend, time });
      setRawInput("");
    } catch (error) {
      console.error("멘토 메시지 전송 실패:", error);
      setLocalWarning("전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: "100vh",
        padding: "24px",
        background: "#eef3fb",
        boxSizing: "border-box",
      }}
    >
    <section className="chat-modal" role="dialog" aria-label="윤서연 멘토 코칭 콘솔">
      <div className="chat-title">
        <div className="matched-mentor-head">
          <span className="mentor-avatar large" style={{ backgroundColor: "#f97316" }}>
            윤
          </span>
          <div>
            <span>Mentor Console · Live</span>
            <h2>윤서연 멘토 — 멘티와 1:1 코칭방</h2>
            <p>
              {firestore ? `실시간 연결됨 · 방 ${chatId}` : "Firestore 미연결 — 환경변수를 확인하세요"}
            </p>
          </div>
        </div>
      </div>

      <div className="chat-thread" ref={threadRef}>
        {messages.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center", margin: "auto" }}>
            아직 메시지가 없습니다. 멘티가 보낸 메시지가 여기에 실시간으로 표시됩니다.
          </p>
        ) : (
          messages.map((message) => {
            // 멘토 콘솔 기준: 멘토(본인) 메시지는 우측 파란색, 멘티 메시지는 좌측 흰색.
            // 팀원 CSS가 .chat-bubble.mentee = 우측/파란색이므로 의도적으로 클래스를 반전한다.
            const isOwn = message.author === "mentor";
            return (
              <div className={`chat-bubble ${isOwn ? "mentee" : "mentor"}`} key={message.id}>
                <p>{message.body}</p>
                {message.warning ? (
                  <div className="chat-guardrail">
                    <strong>경고</strong>
                    {message.warning}
                  </div>
                ) : null}
                <span>{message.time}</span>
              </div>
            );
          })
        )}
      </div>

      {localWarning ? (
        <div className="chat-guardrail" style={{ margin: "0 18px 8px" }}>
          <strong>차단</strong>
          {localWarning}
        </div>
      ) : null}

      <div className="chat-composer">
        <input
          value={rawInput}
          disabled={isSending}
          onChange={(event) => setRawInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isSending) {
              void handleSend();
            }
          }}
          placeholder="멘티에게 보낼 코멘트를 입력하세요"
        />
        <button
          className="solid-button"
          onClick={() => void handleSend()}
          disabled={isSending}
          style={{ opacity: isSending ? 0.5 : 1 }}
        >
          {isSending ? "전송 중" : "전송"}
        </button>
      </div>
    </section>
    </div>
  );
}
