import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Firebase Admin 초기화
admin.initializeApp();
const db = admin.firestore();

// ─── Claude API 공통 호출 함수 ────────────────────────────────────────────────
const callClaude = async (
  systemPrompt: string,
  userContent: string
): Promise<string> => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    error?: { message: string };
  };

  if (!response.ok) {
    throw new Error(`Claude API 오류: ${data.error?.message ?? response.status}`);
  }

  return data.content[0].text;
};

// ─── 프롬프트 1: 투자 성향 분석 ──────────────────────────────────────────────
const INVESTMENT_TYPE_SYSTEM_PROMPT = `
너는 투자 성향 분석 전문가야. 사용자가 설문에 답변한 내용을 바탕으로 투자 성향 유형을 분석해줘.

투자 성향 유형 (반드시 아래 5가지 중 하나만 선택):
- 공격형: 높은 위험을 감수하고 단기 고수익을 추구하는 투자자
- 성장형: 어느 정도의 위험을 감수하며 중장기 수익을 추구하는 투자자
- 중립형: 위험과 수익의 균형을 중시하는 투자자
- 안정형: 낮은 위험으로 안정적인 수익을 선호하는 투자자
- 보수형: 원금 보존을 최우선으로 하는 매우 보수적인 투자자

반드시 아래 JSON 형식으로만 응답해. 코드 블록이나 다른 텍스트 없이 순수 JSON만 출력해.
{
  "type": "공격형",
  "description": "해당 성향에 대한 한 줄 설명",
  "reason": "이 성향으로 판단한 이유를 2~3문장으로 작성"
}
`.trim();

// ─── 프롬프트 2: 가드레일 ─────────────────────────────────────────────────────
const GUARDRAIL_SYSTEM_PROMPT = `
너는 코인 투자 플랫폼의 콘텐츠 심사 AI야. 멘토가 작성한 글이 불법 투자 리딩에 해당하는지 판별해줘.

다음 중 하나라도 해당하면 반드시 reject:
- 특정 코인의 매수·매도를 단정적으로 지시하는 표현 ("지금 사세요", "무조건 오릅니다", "지금 팔아야 합니다" 등)
- 수익 보장 또는 확정적 예측 발언 ("반드시 오른다", "100% 수익" 등)
- 개인 채널·외부 링크 유도 (카카오톡, 텔레그램, 오픈채팅 등)
- 입금·송금 유도 행위
- 허위 정보 또는 근거 없는 루머 조장

위 항목에 해당하지 않으면 approve.

반드시 아래 JSON 형식으로만 응답해. 코드 블록이나 다른 텍스트 없이 순수 JSON만 출력해.
{
  "status": "approve",
  "reason": ""
}
`.trim();

// ─── 프롬프트 3: 카드 정제 ───────────────────────────────────────────────────
const CARD_REFINE_SYSTEM_PROMPT = `
너는 코인 초보자를 위한 콘텐츠 정제 AI야. 멘토가 작성한 전문적인 시장 분석 글을 초보자도 이해할 수 있는 3줄 요약 카드로 변환해줘.

규칙:
- 전문 용어는 쉬운 말로 풀어서 설명
- 각 카드는 1~2문장으로 핵심만 담아
- 매수·매도를 단정적으로 권유하는 표현은 절대 포함하지 마
- summary_1: 현재 시장 상황 요약
- summary_2: 주의하거나 알아둬야 할 점
- summary_3: 멘토의 핵심 메시지 한 줄

반드시 아래 JSON 형식으로만 응답해. 코드 블록이나 다른 텍스트 없이 순수 JSON만 출력해.
{
  "summary_1": "현재 상황 카드",
  "summary_2": "주의사항 카드",
  "summary_3": "멘토 핵심 메시지 카드"
}
`.trim();

// ─── 설문 문항 텍스트 ─────────────────────────────────────────────────────────
const QUESTIONS = [
  "코인 투자 경험이 어느 정도 있으신가요?",
  "투자한 코인이 30% 하락했을 때 어떻게 하시겠어요?",
  "전체 자산 중 코인에 투자하는 비율은 어느 정도인가요?",
  "주로 어떤 투자 기간을 선호하시나요?",
  "지금까지 코인 거래를 몇 번이나 해보셨나요?",
  "급등하는 코인을 봤을 때 어떻게 행동하시나요?",
  "투자에서 가장 중요하게 생각하는 것은 무엇인가요?",
  "주변 사람들이 특정 코인을 추천할 때 어떻게 하시나요?",
  "시장이 급락할 때 어떤 감정을 느끼시나요?",
  "투자 수익을 어떻게 활용하고 싶으신가요?",
];

// ─── Function 1: POST /analyzeInvestmentType ──────────────────────────────────
export const analyzeInvestmentType = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "POST 메서드만 허용됩니다." });
      return;
    }

    const { user_id, answers } = req.body as {
      user_id?: string;
      answers?: string[];
    };

    if (!user_id || !answers) {
      res.status(400).json({
        success: false,
        error: "user_id 또는 answers가 누락되었습니다.",
      });
      return;
    }

    if (!Array.isArray(answers) || answers.length !== 10) {
      res.status(400).json({
        success: false,
        error: "answers 배열이 10개여야 합니다.",
      });
      return;
    }

    try {
      // Q&A 텍스트 포맷
      const qna = QUESTIONS.map((q, i) => `Q${i + 1}. ${q}\nA: ${answers[i]}`).join(
        "\n\n"
      );

      // Claude 호출 → 투자 성향 분석
      const raw = await callClaude(INVESTMENT_TYPE_SYSTEM_PROMPT, qna);
      const { type, description, reason } = JSON.parse(raw) as {
        type: string;
        description: string;
        reason: string;
      };

      // Firestore mentors에서 suitable_for 배열에 type이 포함된 멘토 조회
      const mentorsSnap = await db
        .collection("mentors")
        .where("suitable_for", "array-contains", type)
        .limit(1)
        .get();

      let matched_mentor_id = "";
      let matched_mentor_name = "";

      if (!mentorsSnap.empty) {
        const mentorDoc = mentorsSnap.docs[0];
        matched_mentor_id = mentorDoc.id;
        matched_mentor_name = (mentorDoc.data() as { name: string }).name;
      }

      // Firestore users/{user_id} 업데이트
      await db.collection("users").doc(user_id).set(
        {
          investment_type: type,
          description,
          matched_mentor_id,
          reason,
        },
        { merge: true }
      );

      res.status(200).json({
        success: true,
        investment_type: type,
        description,
        reason,
        matched_mentor_id,
        matched_mentor_name,
      });
    } catch (error) {
      console.error("analyzeInvestmentType 오류:", error);
      res.status(500).json({ success: false, error: "Claude API 호출 실패" });
    }
  }
);

// ─── Function 2: POST /processPost ───────────────────────────────────────────
export const processPost = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "POST 메서드만 허용됩니다." });
    return;
  }

  const { mentor_id, content } = req.body as {
    mentor_id?: string;
    content?: string;
  };

  if (!mentor_id || !content) {
    res.status(400).json({
      success: false,
      error: "mentor_id 또는 content가 누락되었습니다.",
    });
    return;
  }

  try {
    // ① 가드레일 체크
    const guardrailRaw = await callClaude(GUARDRAIL_SYSTEM_PROMPT, content);
    const guardrail = JSON.parse(guardrailRaw) as {
      status: "approve" | "reject";
      reason: string;
    };

    if (guardrail.status === "reject") {
      // rejected 문서 Firestore 저장
      await db.collection("posts").add({
        mentor_id,
        raw_content: content,
        status: "rejected",
        reject_reason: guardrail.reason,
        cards: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).json({
        success: true,
        status: "rejected",
        reason: guardrail.reason,
      });
      return;
    }

    // ② 카드 정제
    const cardsRaw = await callClaude(CARD_REFINE_SYSTEM_PROMPT, content);
    const cards = JSON.parse(cardsRaw) as {
      summary_1: string;
      summary_2: string;
      summary_3: string;
    };

    // approved 문서 Firestore 저장
    const postRef = await db.collection("posts").add({
      mentor_id,
      raw_content: content,
      status: "approved",
      reject_reason: null,
      cards,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      success: true,
      status: "approved",
      post_id: postRef.id,
      cards,
    });
  } catch (error) {
    console.error("processPost 오류:", error);
    res.status(500).json({ success: false, error: "Claude API 호출 실패" });
  }
});
