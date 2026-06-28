import { useEffect, useRef, useState } from "react";
import {
  appendChatMessage,
  firestore,
  resolveMentorRoomId,
  refineMentorMessage,
  subscribeToChatMessages,
  subscribeToChatRoomMeta,
  type ChatRoomMeta,
  type StoredChatMessage,
} from "./lib/firebase";

export default function Mentor() {
  const [rawInput, setRawInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [localWarning, setLocalWarning] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [chatId, setChatId] = useState<string>(() => resolveMentorRoomId());
  const [roomMeta, setRoomMeta] = useState<ChatRoomMeta>({});
  const threadRef = useRef<HTMLDivElement>(null);

  // 멘티 탭이 채팅을 열거나 멘토를 바꾸면 활성 방 포인터가 갱신된다.
  // 같은 브라우저의 멘토 탭은 storage 이벤트로 이를 감지해 같은 방을 자동 추종한다.
  // (단, URL 에 ?room= 이 고정돼 있으면 그 방을 우선한다.)
  useEffect(() => {
    const hasPinnedRoom =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("room");
    if (hasPinnedRoom) {
      return;
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === "coment_active_room" && event.newValue) {
        setChatId(event.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 멘티와 같은 방을 실시간 구독 → 멘티가 보낸 메시지가 즉시 표시된다.
  useEffect(() => {
    if (!firestore) {
      return;
    }
    setMessages([]);
    const unsubscribe = subscribeToChatMessages(chatId, setMessages);
    return () => unsubscribe();
  }, [chatId]);

  // 방 메타(멘토/멘티 이름)를 실시간 구독 → 멘티 화면과 같은 이름을 표시한다.
  useEffect(() => {
    if (!firestore) {
      return;
    }
    const unsubscribe = subscribeToChatRoomMeta(chatId, setRoomMeta);
    return () => unsubscribe();
  }, [chatId]);

  // 새 메시지가 오면 맨 아래로 스크롤
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const mentorName = roomMeta.mentorName?.trim() || "윤서연";
  const mentorAccent = roomMeta.mentorAccent || "#f97316";
  const menteeName = roomMeta.menteeName?.trim() || "멘티";

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
      // 멘토 → AI 정제(모니터링) → 멘티 전달. (3단계)
      //  approved: 정제된 내용을 그대로 전송
      //  warned  : 위험 표현을 순화·삭제한 본문 + 경고문을 함께 전송
      //  rejected: 극단적 위반만 차단하고 사유 표시
      let bodyToSend = trimmedInput;
      let warningToAttach: string | undefined;
      try {
        console.info("[refine] 정제 요청:", trimmedInput);
        const result = await refineMentorMessage(trimmedInput);
        console.info("[refine] 정제 응답:", result);
        if (result.status === "rejected") {
          setLocalWarning(
            `AI 모니터링이 메시지를 차단했습니다: ${result.reason || "위험·선동 표현이 감지되었습니다."}`,
          );
          setIsSending(false);
          return;
        }
        bodyToSend = result.refinedContent.trim() || trimmedInput;
        if (result.status === "warned") {
          warningToAttach =
            result.warning.trim() ||
            "투자 권유가 아닌 참고용 정보이며, 투자 판단과 책임은 본인에게 있습니다.";
        }
      } catch (refineError) {
        // AI 정제에 실패하면 검수되지 않은 원문이 멘티에게 나가지 않도록
        // 전송을 보류하고 멘토에게 명확히 알린다. (조용한 원문 통과 금지)
        console.error("AI 정제 실패 — 전송 보류:", refineError);
        setLocalWarning(
          "AI 검수 서버에 연결하지 못해 전송을 보류했습니다. 함수 배포(refineMentorPost)와 네트워크 상태를 확인해 주세요.",
        );
        setIsSending(false);
        return;
      }

      await appendChatMessage(chatId, {
        author: "mentor",
        body: bodyToSend,
        time,
        warning: warningToAttach,
      });
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
    <section className="chat-modal" role="dialog" aria-label={`${mentorName} 멘토 코칭 콘솔`}>
      <div className="chat-title">
        <div className="matched-mentor-head">
          <span className="mentor-avatar large" style={{ backgroundColor: mentorAccent }}>
            {mentorName.slice(0, 1)}
          </span>
          <div>
            <span>Mentor Console · Live</span>
            <h2>{mentorName} 멘토 — {menteeName} 멘티와 1:1 코칭방</h2>
            <p>
              {firestore ? `실시간 연결됨 · 방 ${chatId}` : "Firestore 미연결 — 환경변수를 확인하세요"}
            </p>
          </div>
        </div>
      </div>

      <div className="chat-thread" ref={threadRef}>
        {messages.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center", margin: "auto" }}>
            아직 메시지가 없습니다. {menteeName} 멘티가 보낸 메시지가 여기에 실시간으로 표시됩니다.
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
