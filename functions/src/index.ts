import { onRequest } from "firebase-functions/v2/https";
import { Anthropic } from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: "YOUR_CLAUDE_API_KEY_HERE", // 여기에 실제 Claude API 키 입력
});

// AI가 반환할 응답 객체의 타입 정의
interface AIResponse {
  status: "approve" | "reject";
  reason: string;
  summary_1: string;
  summary_2: string;
  summary_3: string;
}

export const refineMentorPost = onRequest({ cors: true }, async (req, res) => {
  try {
    const { rawContent } = req.body as { rawContent?: string };

    if (!rawContent) {
      res.status(400).json({ error: "내용이 없습니다." });
      return;
    }

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: "너는 코인 초보자를 위한 전문 카운셀러 AI야. 멘토가 작성한 복잡한 시장 분석 글을 분석해서 불법 리딩(매수 유도, 입금 유도 등)이 있다면 차단하고, 안전하다면 초보자가 이해하기 쉽게 3줄 요약 카드로 변환해줘. 응답은 반드시 JSON 형식으로만 해줘. 형식: { \"status\": \"approve\" | \"reject\", \"reason\": \"차단 사유(안전하면 빈값)\", \"summary_1\": \"현재 상황\", \"summary_2\": \"주의할 점\", \"summary_3\": \"멘토의 한줄평\" }",
      messages: [{ role: "user", content: rawContent }],
    });

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    
    if (!responseText) {
      res.status(500).json({ error: "AI 응답을 생성하지 못했습니다." });
      return;
    }

    const aiResult: AIResponse = JSON.parse(responseText);
    res.json(aiResult);

  } catch (error) {
    console.error("Claude API 오류:", error);
    res.status(500).json({ error: "AI 정제 중 오류가 발생했습니다." });
  }
});