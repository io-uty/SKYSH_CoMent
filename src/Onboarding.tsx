import { useState } from "react";
import type { MentorPattern } from "./types";

type OnboardingStat = {
  labelLeft: string;
  labelRight: string;
  percent: number;
  color: string;
};

export type OnboardingResult = {
  pattern: MentorPattern;
  type: string;
  scores: number[];
  answers: string[];
  stats: OnboardingStat[];
};

type OnboardingProps = {
  onComplete: (result: OnboardingResult) => void;
};

const ONBOARDING_QUESTIONS = [
  { question: "1. 코인 투자 경험이 있으신가요?", options: ["전혀 없음", "1년 미만", "1~3년", "3년 이상"] },
  { question: "2. 투자금이 30% 하락하면 어떻게 하시겠어요?", options: ["즉시 매도", "유지", "추가 매수 고려", "공격적 추가 매수"] },
  { question: "3. 기대하는 연간 수익률은?", options: ["5~10%", "10~30%", "30~100%", "100% 이상도 가능"] },
  { question: "4. 투자 기간은?", options: ["단기(1개월 이내)", "중기(3~6개월)", "장기(1년 이상)", "무기한"] },
  { question: "5. 하루에 코인 시세를 몇 번 확인하나요?", options: ["거의 안 함", "1~2회", "5회 이상", "수시로 확인"] },
  { question: "6. 새로운 알트코인 투자를 권유받으면?", options: ["무조건 거절", "공부 후 소액 투자", "빠르게 진입", "큰 금액 바로 투자"] },
  { question: "7. 투자 결정을 내릴 때 가장 중요한 기준은?", options: ["안정성", "유동성", "성장 가능성", "수익성"] },
  { question: "8. 코인 시장이 급등했을 때 내 심리는?", options: ["무덤덤", "이미 예측함", "이미 보유 중이라 기쁨", "FOMO 느낌"] },
  { question: "9. 투자 손실에 대한 내 태도는?", options: ["감정 없음", "오히려 기회로 봄", "불안하지만 버팀", "밤에 잠 못 잠"] },
  { question: "10. 코인 투자에서 가장 중요한 것은?", options: ["원금 보존", "시장 공부", "장기 우상향 믿음", "빠른 수익 실현"] },
];


const initialResultData: OnboardingResult = {
  pattern: "neutral",
  type: "",
  scores: [],
  answers: [],
  stats: [
    { labelLeft: "안정 추구형", labelRight: "위험 감수형", percent: 0, color: "#45a29e" },
    { labelLeft: "단기 스윙형", labelRight: "장기 가치형", percent: 0, color: "#e3a857" },
    { labelLeft: "시장 둔감형", labelRight: "트렌드 민감형", percent: 0, color: "#5bbd82" },
    { labelLeft: "이성적 멘탈", labelRight: "감정적 동요", percent: 0, color: "#b98bb9" },
  ],
};

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<OnboardingResult>(initialResultData);

  const handleSelect = (optionIndex: number) => {
    const selectedAnswer = ONBOARDING_QUESTIONS[currentStep].options[optionIndex];
    const newScores = [...scores, optionIndex + 1];
    const newAnswers = [...answers, selectedAnswer];
    setScores(newScores);
    setAnswers(newAnswers);

    if (currentStep < ONBOARDING_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      calculateResult(newScores, newAnswers);
      setShowResult(true);
    }
  };

  const calculateResult = (finalScores: number[], finalAnswers: string[]) => {
    const totalScore = finalScores.reduce((acc, curr) => acc + curr, 0);
    let investorType = "";
    let pattern: MentorPattern = "neutral";

    if (totalScore <= 18) {
      investorType = "수비적인 투자자";
      pattern = "defensive";
    } else if (totalScore <= 28) {
      investorType = "중립적인 투자자";
      pattern = "neutral";
    } else {
      investorType = "공격적인 투자자";
      pattern = "aggressive";
    }

    const riskPercent = Math.round(((finalScores[1] + finalScores[2] + finalScores[5] - 3) / 9) * 100);
    const termPercent = Math.round(((finalScores[3] + finalScores[9] - 2) / 6) * 100);
    const trendPercent = Math.round(((finalScores[0] + finalScores[4] + finalScores[6] - 3) / 9) * 100);
    const reverseEmotion = (5 - finalScores[7]) + (5 - finalScores[8]);
    const emotionPercent = Math.round(((reverseEmotion - 2) / 6) * 100);

    setResultData({
      pattern,
      type: investorType,
      scores: finalScores,
      answers: finalAnswers,
      stats: [
        { labelLeft: "안정 추구형", labelRight: "위험 감수형", percent: riskPercent, color: "#45a29e" },
        { labelLeft: "단기 스윙형", labelRight: "장기 가치형", percent: termPercent, color: "#e3a857" },
        { labelLeft: "시장 둔감형", labelRight: "트렌드 민감형", percent: trendPercent, color: "#5bbd82" },
        { labelLeft: "이성적 멘탈", labelRight: "감정적 동요", percent: emotionPercent, color: "#8a6d96" },
      ]
    });
  };

  const restartSurvey = () => {
    setCurrentStep(0);
    setScores([]);
    setAnswers([]);
    setResultData(initialResultData);
    setShowResult(false);
  };

  if (showResult) {
    return (
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logoMark}>C</div>
            <span style={styles.brandName}>CoMent</span>
          </div>
        </header>

        <main style={styles.main}>
          <div style={styles.card}>
            <div style={styles.resultHeader}>
              <span style={styles.subTitle}>ANALYSIS COMPLETE</span>
              <h1 style={styles.mainTitle}>당신은 <span style={{ color: "#0062ff" }}>[{resultData.type}]</span> 입니다.</h1>
              <p style={styles.resultDesc}>작성해주신 10개의 설문 데이터를 바탕으로 분석된 결과입니다.</p>
            </div>

            <div style={styles.statsContainer}>
              {resultData.stats.map((stat, idx) => (
                <div key={idx} style={styles.statRow}>
                  <div style={styles.statLabels}>
                    <span style={styles.statLabelLeft}>{stat.labelLeft}</span>
                    <span style={styles.statLabelRight}>{stat.labelRight}</span>
                  </div>
                  <div style={styles.statBarWrapper}>
                    <span style={styles.percentLeft}>{100 - stat.percent}%</span>
                    <div style={styles.statBarBg}>
                      <div style={{ ...styles.statBarFill, width: `${stat.percent}%`, backgroundColor: stat.color }} />
                    </div>
                    <span style={{ ...styles.percentRight, color: stat.color }}>{stat.percent}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 버튼 2개 영역 */}
            <div style={styles.buttonGroup}>
              <button
                style={styles.primaryButton}
                onClick={() => onComplete(resultData)}
              >
                멘토 매칭 보기
              </button>
              <button
                style={styles.secondaryButton}
                onClick={restartSurvey}
              >
                설문 다시하기
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ... (질문 화면 렌더링 로직은 이전과 동일)
  const currentQuestion = ONBOARDING_QUESTIONS[currentStep];
  const progress = ((currentStep + 1) / ONBOARDING_QUESTIONS.length) * 100;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.logoMark}>C</div>
          <span style={styles.brandName}>CoMent</span>
        </div>
        <div style={styles.titleArea}>
          <span style={styles.subTitle}>Onboarding Process</span>
          <h1 style={styles.mainTitle}>투자 성향 분석</h1>
        </div>
      </header>
      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.progressContainer}>
            <div style={styles.progressLabel}>
              <span>질문 {currentStep + 1} / {ONBOARDING_QUESTIONS.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div style={styles.progressBarBg}>
              <div style={{ ...styles.progressBarFill, width: `${progress}%` }} />
            </div>
          </div>
          <h2 style={styles.questionText}>{currentQuestion.question}</h2>
          <div style={styles.optionsGrid}>
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleSelect(index)}
                style={styles.optionButton}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
              >
                <div style={styles.optionNumber}>{index + 1}</div>
                <span style={styles.optionLabel}>{option}</span>
                <div style={styles.optionArrow}>→</div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  // ... (이전 스타일 유지)
  container: { backgroundColor: "#f1f5f9", minHeight: "100vh", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", color: "#1e293b" },
  header: { width: "100%", maxWidth: "800px", marginBottom: "30px", display: "flex", flexDirection: "column", gap: "20px" },
  brand: { display: "flex", alignItems: "center", gap: "10px" },
  logoMark: { backgroundColor: "#0062ff", color: "#fff", width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "18px" },
  brandName: { fontSize: "20px", fontWeight: "700", color: "#001e62", letterSpacing: "-0.5px" },
  titleArea: { borderBottom: "1px solid #e2e8f0", paddingBottom: "15px" },
  subTitle: { fontSize: "12px", color: "#0062ff", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" },
  mainTitle: { fontSize: "28px", fontWeight: "700", margin: "5px 0 0 0" },
  main: { width: "100%", maxWidth: "600px" },
  card: { backgroundColor: "#fff", borderRadius: "16px", padding: "40px 32px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
  progressContainer: { marginBottom: "30px" },
  progressLabel: { display: "flex", justifyItems: "space-between", justifyContent: "space-between", fontSize: "13px", color: "#64748b", marginBottom: "8px", fontWeight: "500" },
  progressBarBg: { backgroundColor: "#e2e8f0", height: "6px", borderRadius: "10px", overflow: "hidden" },
  progressBarFill: { backgroundColor: "#0062ff", height: "100%", transition: "width 0.4s ease" },
  questionText: { fontSize: "20px", fontWeight: "600", marginBottom: "24px", lineHeight: "1.4" },
  optionsGrid: { display: "flex", flexDirection: "column", gap: "12px" },
  optionButton: { display: "flex", alignItems: "center", padding: "16px", backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", cursor: "pointer", transition: "all 0.2s ease", textAlign: "left" },
  optionNumber: { width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#eff6ff", color: "#0062ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "700", marginRight: "15px" },
  optionLabel: { flex: 1, fontSize: "16px", fontWeight: "500", color: "#334155" },
  optionArrow: { color: "#cbd5e1", fontSize: "18px" },
  resultHeader: { textAlign: "center", marginBottom: "40px" },
  resultDesc: { color: "#64748b", fontSize: "14px", marginTop: "15px", lineHeight: "1.5" },
  statsContainer: { display: "flex", flexDirection: "column", gap: "30px", marginBottom: "40px" },
  statRow: { display: "flex", flexDirection: "column", gap: "10px" },
  statLabels: { display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "600", color: "#334155", padding: "0 40px" },
  statLabelLeft: { color: "#64748b" },
  statLabelRight: { color: "#64748b" },
  statBarWrapper: { display: "flex", alignItems: "center", gap: "15px" },
  percentLeft: { width: "30px", fontSize: "16px", fontWeight: "700", textAlign: "right", color: "#334155" },
  percentRight: { width: "30px", fontSize: "16px", fontWeight: "700", textAlign: "left" },
  statBarBg: { flex: 1, height: "16px", backgroundColor: "#f1f5f9", borderRadius: "20px", overflow: "hidden" },
  statBarFill: { height: "100%", borderRadius: "20px", transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)" },
  
  // 버튼 그룹 스타일
  buttonGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  primaryButton: {
    width: "100%",
    padding: "16px",
    backgroundColor: "#0062ff",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    boxShadow: "0 4px 6px -1px rgba(0, 98, 255, 0.2)",
    transition: "background-color 0.2s",
  },
  secondaryButton: {
    width: "100%",
    padding: "16px",
    backgroundColor: "#fff",
    color: "#64748b",
    fontSize: "16px",
    fontWeight: "600",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
};
