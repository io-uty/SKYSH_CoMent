import { useState } from "react";

export default function MentorAssistant() {
  const [rawInput, setRawInput] = useState("");
  const [refinedOutput, setRefinedOutput] = useState("");

  // 반드시 async 키워드가 함수 선언 바로 앞에 붙어야 합니다.
  const handleRefine = async () => {
    setRefinedOutput("AI 분석 중...");

    try {
      const response = await fetch("https://refinementorpost-fr2hkqeseq-uc.a.run.app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `너는 금융 및 코인 시장의 공정한 모니터링 AI야. 멘토가 작성한 투자 정보 메시지를 분석해서 다음 규칙에 따라 정제해줘.
          [규칙]
          1. 객관성 유지: "~무조건 떡상합니다", "영끌하세요" 같은 자극적인 선동이나 주관적인 예측은 배제하고 객관적인 사실 위주로 문맥을 다듬어줘.
          2. 위험 내용 필터링: 특정 리딩방 가입 유도, 개인 계좌 입금 요청, 100% 수익 보장 등의 사기/위험 문구가 있다면 status를 'rejected'로 판단해줘.
          3. 안전하다면 status를 'approved'로 하고, 정제된 내용을 refinedContent에 담아줘.
          [응답 포맷] 반드시 JSON으로만 답해줘.
          {
          "status": "approved" | "rejected",
          "refinedContent": "정제된 내용",
          "reason": "rejected 되었을 때의 사유"
          }`,
          message: rawInput
        })
      });

      if (!response.ok) throw new Error("서버 응답 오류");

      const data = await response.json();

      if (data.status === "approved") {
        setRefinedOutput(data.refinedContent);
      } else {
        setRefinedOutput(`[거절됨] 사유: ${data.reason}`);
      }
    } catch (error) {
      setRefinedOutput("오류가 발생했습니다. 서버 연결을 확인하세요.");
      console.error(error);
    }
  };

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>AI 멘토 메시지 정제 시스템</h1>
      <textarea 
        style={{ width: "100%", height: "150px", marginBottom: "20px" }}
        placeholder="멘토의 주관적 조언을 입력하세요..."
        value={rawInput}
        onChange={(e) => setRawInput(e.target.value)}
      />
      <button onClick={handleRefine} style={{ padding: "15px 30px", fontSize: "18px" }}>정제하여 전송</button>
      <div style={{ marginTop: "30px", padding: "20px", border: "2px solid #0062ff" }}>
        <h3>멘티에게 보여질 화면:</h3>
        <p style={{ whiteSpace: "pre-line" }}>{refinedOutput}</p>
      </div>
    </div>
  );
}