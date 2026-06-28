import React, { useState } from "react";

interface Message {
  id: number;
  author: "mentee" | "mentor" | "system";
  body: string;
  time: string;
  status?: "approved" | "rejected";
}

export default function Mentor() {
  const [rawInput, setRawInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      id: 1,
      author: "mentee",
      body: "현재 재 코인이 더 떨어질거같은데 손절할까요? 차라리 지금 비트코인 손실 난 걸 다른 코인으로 갈아타서 빠르게 메꾸는 건 어떨까요?",
      time: "09:15",
    },
    {
      id: 2,
      author: "mentor",
      body: "현재 시장 변동성이 큽니다. 너무 감정적으로 대응하지 마세요. 급락장에서 타 종목으로 추격 매수를 진행하는 것은 2차 손실로 이어질 확률이 매우 높습니다. 멘티님의 'Emotion Replay' 타임라인을 보면, 과거에도 급락 후 평균 5분안에 뇌동매매를 하고 손실을 본 패턴이 있습니다. 신규 진입을 보류하고 30분봉 차트가 안정될 때까지 관망하시길 권장합니다.",
      time: "09:20",
      status: "approved",
    },
    {
      id: 3,
      author: "mentee",
      body: "하지만 계좌 상황이 너무 안좋아서 불안해요...",
      time: "09:22",
    },
  ]);

  const handleRefine = async () => {
    const trimmedInput = rawInput.trim();

    if (!trimmedInput || isRefining) return;

    setIsRefining(true);

    const currentTime = new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const rejectedKeywords = ["무조건", "영끌", "풀매수"];
    const isRejected = rejectedKeywords.some((keyword) => trimmedInput.includes(keyword));

    if (isRejected) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          author: "system",
          time: currentTime,
          status: "rejected",
          body: "[차단됨] 선동 문구가 포함되어 있어 전송이 차단되었습니다.",
        },
      ]);
    } else {
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          author: "mentor",
          time: currentTime,
          status: "approved",
          body: trimmedInput,
        },
      ]);
    }

    setRawInput("");
    setIsRefining(false);
  };

  return (
    <section className="chat-modal" role="dialog" aria-label="윤서연 멘토와 1:1 코칭방">
      <div className="chat-title">
        <div className="matched-mentor-head">
          <span className="mentor-avatar large">윤</span>
          <div>
            <span>Mentor-Mentee Chat</span>
            <h2>윤서연 멘토와 1:1 코칭방</h2>
            <p>멘토 화면 · AI AGENT 문구 검토 연결</p>
          </div>
        </div>
      </div>

      <div className="chat-thread">
        {chatMessages.map((message) => {
          const isMentorSide = message.author === "mentor" || message.author === "system";

          // 핵심 해결 로직: 팀원의 CSS가 멘티 기준이므로, 클래스 이름을 의도적으로 반전시킵니다.
          // 멘토가 입력한 글은 CSS의 'mentee' 스타일(우측/파란색)을 적용받게 합니다.
          const rowClass = isMentorSide ? "right" : "left";
          const bubbleClass = isMentorSide ? "mentee" : "mentor";

          return (
            <div
              className={`chat-row ${rowClass}`}
              key={message.id}
            >
              {message.status === "rejected" ? (
                <div className="chat-guardrail">
                  <strong>경고</strong>
                  {message.body}
                  <span>{message.time}</span>
                </div>
              ) : (
                <div className={`chat-bubble ${bubbleClass}`}>
                  <p>{message.body}</p>
                  <span>{message.time}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="chat-composer mentor-composer">
        <textarea
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder="멘티에게 보낼 코멘트를 입력하세요"
        />
        <button className="solid-button" onClick={handleRefine} disabled={isRefining}>
          {isRefining ? "검토 중" : "전송"}
        </button>
      </div>
    </section>
  );
}