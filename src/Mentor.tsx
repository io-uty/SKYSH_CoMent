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
      body: "멘토님, 지금 비트코인 갑자기 3% 넘게 빠지는데 시장가로 던질까요?",
      time: "오전 10:33",
    },
    {
      id: 2,
      author: "system",
      body: "현재 급락은 단기 변동성 확대 구간으로 파악됩니다. 손절선(8,800만 원) 이탈 여부를 확인하는 신중한 접근이 필요합니다.",
      time: "오전 10:35",
      status: "approved",
    }
  ]);

 const handleRefine = async () => {
    if (!rawInput.trim() || isRefining) return;
    setIsRefining(true);

    const now = new Date();
    const currentTime = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

    // 1. 시연용: 거절 키워드 정의
    const rejectedKeywords = ["무조건", "영끌", "풀매수", "100% 보장", "리딩방"];
    const isRejected = rejectedKeywords.some(keyword => rawInput.includes(keyword));

    // 2. AI 분석 시뮬레이션
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 3. 메시지 생성 로직 (입력값 그대로 출력)
    const newMsg: Message = {
      id: Date.now(),
      author: "system",
      time: currentTime,
      status: isRejected ? "rejected" : "approved",
      body: isRejected 
        ? "[거절됨] 사유: 주관적인 선동 문구(무조건, 풀매수 등)가 포함되어 있습니다." 
        : `${rawInput}` // 입력한 내용을 그대로 출력
    };

    setChatMessages((prev) => [...prev, newMsg]);
    setRawInput(""); // 입력창 초기화
    setIsRefining(false);
  };
  return (
    <div style={{ width: "100%", maxWidth: "500px", height: "100vh", margin: "0 auto", display: "flex", flexDirection: "column", background: "#f4f7f6", fontFamily: "sans-serif" }}>
      {/* 헤더 수정 완료 */}
      <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #eee" }}>
        <span style={{ fontSize: "11px", color: "#4285f4", fontWeight: "bold" }}>MENTOR-MENTEE CHAT</span>
        <h2 style={{ margin: "4px 0", fontSize: "16px", fontWeight: "bold" }}>윤서연 멘토와 1:1 코칭방</h2>
        <span style={{ fontSize: "11px", color: "#999" }}>프로 구독 • 실시간 코멘트 연결</span>
      </div>

      <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
        {chatMessages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", justifyContent: msg.author === "mentee" ? "flex-end" : "flex-start", marginBottom: "15px" }}>
            {msg.author !== "mentee" && (
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: msg.status === "rejected" ? "#f44336" : "#4caf50", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginRight: "8px" }}>
                {msg.author === "system" ? "AI" : "멘"}
              </div>
            )}
            <div style={{ padding: "10px", borderRadius: "10px", backgroundColor: msg.author === "mentee" ? "#4285f4" : "#fff", color: msg.author === "mentee" ? "#fff" : "#333", maxWidth: "70%", border: msg.status === "rejected" ? "2px solid #f44336" : "none" }}>
              {msg.body}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "16px", background: "#fff", display: "flex", gap: "10px" }}>
        <textarea style={{ flex: 1, height: "50px", padding: "10px" }} value={rawInput} onChange={(e) => setRawInput(e.target.value)} placeholder="조언 입력..." />
        <button onClick={handleRefine} disabled={isRefining} style={{ padding: "0 20px", background: "#4285f4", color: "#fff", border: "none", borderRadius: "8px" }}>
          {isRefining ? "분석중" : "전송"}
        </button>
      </div>
    </div>
  );
}