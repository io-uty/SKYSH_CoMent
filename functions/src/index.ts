import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { inflateRawSync } from "node:zlib";

// Firebase Admin 초기화
admin.initializeApp();
const db = admin.firestore();

const UPBIT_HISTORICAL_LISTING_ENDPOINT =
  "https://crix-data-api.upbit.com/api/v1/market-data/listing";
const UPBIT_HISTORICAL_DOWNLOAD_HOST = "https://crix-data.upbit.com";
const SUPPORTED_HISTORICAL_TIMEFRAMES = {
  "1m": { path: "1m", rowsPerDailyFile: 1440 },
  "30m": { path: "30m", rowsPerDailyFile: 48 },
  "1h": { path: "60m", rowsPerDailyFile: 24 },
  "4h": { path: "240m", rowsPerDailyFile: 6 },
  "1d": { path: "day", rowsPerDailyFile: 1 },
} as const;

type HistoricalTimeframe = keyof typeof SUPPORTED_HISTORICAL_TIMEFRAMES;

type UpbitHistoricalFile = {
  key: string;
  size: number;
  lastModified: string | null;
  type: "DIRECTORY" | "FILE";
};

type HistoricalCandle = {
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_volume: number;
};

const isHistoricalTimeframe = (value: unknown): value is HistoricalTimeframe =>
  typeof value === "string" && value in SUPPORTED_HISTORICAL_TIMEFRAMES;

const toKstDateTime = (utcDateTime: string) => {
  const date = new Date(`${utcDateTime}Z`);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 19);
};

const unzipSingleCsv = (zipBuffer: Buffer) => {
  const findSignature = (signature: number, start = zipBuffer.length - 4) => {
    for (let index = start; index >= 0; index -= 1) {
      if (zipBuffer.readUInt32LE(index) === signature) {
        return index;
      }
    }

    return -1;
  };

  const endOfCentralDirectory = findSignature(0x06054b50);
  if (endOfCentralDirectory < 0) {
    throw new Error("ZIP central directory를 찾을 수 없습니다.");
  }

  const centralDirectoryOffset = zipBuffer.readUInt32LE(endOfCentralDirectory + 16);
  if (zipBuffer.readUInt32LE(centralDirectoryOffset) !== 0x02014b50) {
    throw new Error("ZIP file header 형식이 올바르지 않습니다.");
  }

  const compressionMethod = zipBuffer.readUInt16LE(centralDirectoryOffset + 10);
  const compressedSize = zipBuffer.readUInt32LE(centralDirectoryOffset + 20);
  const fileNameLength = zipBuffer.readUInt16LE(centralDirectoryOffset + 28);
  const extraFieldLength = zipBuffer.readUInt16LE(centralDirectoryOffset + 30);
  const commentLength = zipBuffer.readUInt16LE(centralDirectoryOffset + 32);
  const localHeaderOffset = zipBuffer.readUInt32LE(centralDirectoryOffset + 42);
  const fileName = zipBuffer
    .subarray(centralDirectoryOffset + 46, centralDirectoryOffset + 46 + fileNameLength)
    .toString("utf8");

  if (!fileName.endsWith(".csv")) {
    throw new Error("ZIP 내부 CSV 파일을 찾을 수 없습니다.");
  }

  const nextCentralHeader =
    centralDirectoryOffset + 46 + fileNameLength + extraFieldLength + commentLength;
  if (nextCentralHeader > zipBuffer.length) {
    throw new Error("ZIP central directory 길이가 올바르지 않습니다.");
  }

  const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraFieldLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
  const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) {
    return compressedData.toString("utf8");
  }

  if (compressionMethod === 8) {
    return inflateRawSync(compressedData).toString("utf8");
  }

  throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${compressionMethod}`);
};

const parseHistoricalCandles = (csv: string): HistoricalCandle[] => {
  const [headerLine, ...rows] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");

  const column = (name: string) => {
    const index = headers.indexOf(name);
    if (index < 0) {
      throw new Error(`CSV 컬럼이 누락되었습니다: ${name}`);
    }
    return index;
  };

  const dateIndex = column("date_time_utc");
  const openIndex = column("open");
  const highIndex = column("high");
  const lowIndex = column("low");
  const closeIndex = column("close");
  const volumeIndex = column("acc_trade_volume");

  return rows
    .map((row) => row.split(","))
    .filter((values) => values.length >= headers.length)
    .map((values) => ({
      candle_date_time_kst: toKstDateTime(values[dateIndex]),
      opening_price: Number(values[openIndex]),
      high_price: Number(values[highIndex]),
      low_price: Number(values[lowIndex]),
      trade_price: Number(values[closeIndex]),
      candle_acc_trade_volume: Number(values[volumeIndex]),
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.opening_price) &&
        Number.isFinite(candle.high_price) &&
        Number.isFinite(candle.low_price) &&
        Number.isFinite(candle.trade_price) &&
        Number.isFinite(candle.candle_acc_trade_volume)
    );
};

const fetchHistoricalJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Coment/1.0 historical-market-proxy",
    },
  });

  if (!response.ok) {
    throw new Error(`Upbit historical API 오류: ${response.status}`);
  }

  return (await response.json()) as T;
};

const fetchHistoricalZipCsv = async (key: string) => {
  const response = await fetch(`${UPBIT_HISTORICAL_DOWNLOAD_HOST}/${key}`, {
    headers: {
      Accept: "application/zip",
      "User-Agent": "Coment/1.0 historical-market-proxy",
    },
  });

  if (!response.ok) {
    throw new Error(`Upbit historical ZIP 다운로드 오류: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return unzipSingleCsv(Buffer.from(arrayBuffer));
};

const listBtcHistoricalFiles = async (
  timeframe: HistoricalTimeframe,
  year: number
): Promise<UpbitHistoricalFile[]> => {
  const interval = SUPPORTED_HISTORICAL_TIMEFRAMES[timeframe].path;
  const prefix = `candle/KRW-BTC/daily/${interval}/${year}`;
  const url = `${UPBIT_HISTORICAL_LISTING_ENDPOINT}?prefix=${encodeURIComponent(prefix)}`;
  return fetchHistoricalJson<UpbitHistoricalFile[]>(url);
};

// ─── Function 0: GET /upbitHistoricalCandles ────────────────────────────────
export const upbitHistoricalCandles = onRequest(
  { cors: true, timeoutSeconds: 60, memory: "256MiB" },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ success: false, error: "GET 메서드만 허용됩니다." });
      return;
    }

    const timeframe = req.query.timeframe;
    if (!isHistoricalTimeframe(timeframe)) {
      res.status(400).json({
        success: false,
        error: "timeframe은 1m, 30m, 1h, 4h, 1d 중 하나여야 합니다.",
      });
      return;
    }

    const limit = Math.min(Math.max(Number(req.query.limit ?? 80), 1), 240);
    const currentYear = new Date().getUTCFullYear();
    const rowsPerFile = SUPPORTED_HISTORICAL_TIMEFRAMES[timeframe].rowsPerDailyFile;
    const fileCount = Math.min(Math.ceil(limit / rowsPerFile) + 1, timeframe === "1d" ? 120 : 14);

    try {
      const filesByYear = await Promise.all([
        listBtcHistoricalFiles(timeframe, currentYear),
        listBtcHistoricalFiles(timeframe, currentYear - 1),
      ]);

      const zipFiles = filesByYear
        .flat()
        .filter((file) => file.type === "FILE" && file.key.endsWith(".zip"))
        .sort((a, b) => a.key.localeCompare(b.key))
        .slice(-fileCount);

      const csvFiles = await Promise.all(zipFiles.map((file) => fetchHistoricalZipCsv(file.key)));
      const candles = csvFiles
        .flatMap(parseHistoricalCandles)
        .sort((a, b) => a.candle_date_time_kst.localeCompare(b.candle_date_time_kst))
        .slice(-limit);

      res.status(200).json({
        success: true,
        market: "KRW-BTC",
        timeframe,
        source: "upbit-historical-market-data",
        files: zipFiles.map((file) => file.key),
        candles,
      });
    } catch (error) {
      console.error("upbitHistoricalCandles 오류:", error);
      res.status(502).json({
        success: false,
        error: "Upbit 과거 캔들 데이터를 불러오지 못했습니다.",
      });
    }
  }
);

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
  { cors: true, secrets: ["ANTHROPIC_API_KEY"] },
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
export const processPost = onRequest({ cors: true, secrets: ["ANTHROPIC_API_KEY"] }, async (req, res) => {
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

// ─── 멀티턴 Claude 호출 (채팅 전용) ─────────────────────────────────────────
type ClaudeChatMessage = { role: "user" | "assistant"; content: string };

const callClaudeChat = async (
  systemPrompt: string,
  messages: ClaudeChatMessage[]
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
      max_tokens: 512,
      system: systemPrompt,
      messages,
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

// ─── Function 3: POST /chatWithMentor ────────────────────────────────────────
export const chatWithMentor = onRequest({ cors: true, secrets: ["ANTHROPIC_API_KEY"] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "POST 메서드만 허용됩니다." });
    return;
  }

  const { mentor_id, mentor_name, mentor_style, mentor_specialty, mentor_philosophy, messages } =
    req.body as {
      mentor_id?: string;
      mentor_name?: string;
      mentor_style?: string;
      mentor_specialty?: string;
      mentor_philosophy?: string;
      messages?: ClaudeChatMessage[];
    };

  if (!mentor_id || !mentor_name || !messages || messages.length === 0) {
    res.status(400).json({ success: false, error: "필수 필드가 누락되었습니다." });
    return;
  }

  // 대화 기록은 최근 20턴으로 제한
  const trimmedMessages = messages.slice(-20);

  const systemPrompt = `
너는 코인 멘토링 플랫폼 Coment의 멘토 ${mentor_name}이야. 멘티와 1:1 코칭 채팅을 진행하고 있어.

[멘토 프로필]
- 이름: ${mentor_name}
- 전문 분야: ${mentor_specialty ?? "코인 투자 전략"}
- 코칭 스타일: ${mentor_style ?? "균형형 매매"}
- 철학: ${mentor_philosophy ?? "근거 기반 투자 결정"}

[채팅 규칙 - 반드시 지켜야 함]
1. 특정 코인의 매수·매도를 단정적으로 권유하지 마 ("지금 사세요", "무조건 오릅니다" 등 금지)
2. 수익을 보장하거나 확정적으로 예측하지 마
3. 외부 채널(카카오톡, 텔레그램 등)이나 입금을 유도하지 마
4. 대신 멘티가 스스로 판단할 수 있도록 질문하고, 리스크와 근거를 같이 생각하게 도와줘
5. 반말보다는 존댓말을 사용하되, 친근한 코치 톤을 유지해
6. 답변은 3~5문장으로 간결하게 해. 너무 길게 쓰지 마
7. 코인·투자와 전혀 무관한 대화는 부드럽게 주제를 코칭으로 돌려줘

지금 멘티가 보내는 메시지에 ${mentor_name} 멘토로서 답해줘.
`.trim();

  try {
    const reply = await callClaudeChat(systemPrompt, trimmedMessages);

    res.status(200).json({ success: true, reply });
  } catch (error) {
    console.error("chatWithMentor 오류:", error);
    res.status(500).json({ success: false, error: "멘토 응답 생성에 실패했습니다." });
  }
});

// ─── 프롬프트 4: 멘토 메시지 정제(모니터링) ──────────────────────────────────
const REFINE_SYSTEM_PROMPT = `
너는 금융 및 코인 시장의 공정한 모니터링 AI야. 멘토가 작성한 투자 정보 메시지를 분석해서 다음 규칙에 따라 정제해줘.

[규칙]
1. 객관성 유지: 과장·단정·선동적 표현을 객관적이고 중립적인 표현으로 다듬어줘. 사실과 의견을 구분하고, 근거 없는 확정적 예측은 완화해줘.
2. 위험 내용 필터링: 수익 보장("100% 수익", "무조건 오른다"), 단정적 매수·매도 지시("지금 사세요", "풀매수"), 외부 채널·리딩방 유도, 입금·송금 유도, 허위 정보가 포함되면 status를 "rejected"로 하고 reason에 사유를 적어줘.
3. 안전하다면 status를 "approved"로 하고, refinedContent에 객관적으로 정제된 메시지를 담아줘. 원문의 핵심 정보와 의도는 유지하되 표현만 다듬어줘.

[응답 포맷]
반드시 JSON으로만 답해줘. 코드 블록이나 다른 텍스트 없이 순수 JSON만 출력해.
{
  "status": "approved" | "rejected",
  "refinedContent": "정제된 내용",
  "reason": "rejected 되었을 때의 사유"
}
`.trim();

// 모델이 코드 펜스로 감싼 JSON 을 보내는 경우를 대비해 안전하게 추출한다.
const extractJson = (raw: string): string => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    return fenced[1].trim();
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw.trim();
};

// ─── Function 4: POST /refineMentorPost ──────────────────────────────────────
export const refineMentorPost = onRequest(
  { cors: true, secrets: ["ANTHROPIC_API_KEY"] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "POST 메서드만 허용됩니다." });
      return;
    }

    const { message } = req.body as { message?: string };

    if (!message || !message.trim()) {
      res.status(400).json({ success: false, error: "message가 누락되었습니다." });
      return;
    }

    try {
      const raw = await callClaude(REFINE_SYSTEM_PROMPT, message.trim());
      const parsed = JSON.parse(extractJson(raw)) as {
        status: "approved" | "rejected";
        refinedContent: string;
        reason: string;
      };

      res.status(200).json({
        success: true,
        status: parsed.status,
        refinedContent: parsed.refinedContent ?? "",
        reason: parsed.reason ?? "",
      });
    } catch (error) {
      console.error("refineMentorPost 오류:", error);
      res.status(500).json({ success: false, error: "메시지 정제에 실패했습니다." });
    }
  }
);
