import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Onboarding, { type OnboardingResult } from "./Onboarding";
import { seedAlerts, seedMentors, seedSignals } from "./data/seed";
import { firestore, getSessionUserId, saveOnboardingResult, subscribeToCollection } from "./lib/firebase";
import type { CoachingAlert, MarketSignal, Mentor, MentorPattern } from "./types";

const fallbackChartBars = [
  46, 58, 72, 65, 38, 28, 42, 64, 55, 31, 25, 48, 79, 70, 44, 36, 52, 83,
];

const upbitTickerEndpoint = "https://api.upbit.com/v1/ticker?markets=KRW-BTC";
const marketRefreshMs = 10000;
const marketTimeframes = [
  {
    id: "1m",
    label: "1분",
    candleLabel: "1분봉",
    endpoint: "https://api.upbit.com/v1/candles/minutes/1?market=KRW-BTC&count=40",
  },
  {
    id: "30m",
    label: "30분",
    candleLabel: "30분봉",
    endpoint: "https://api.upbit.com/v1/candles/minutes/30?market=KRW-BTC&count=40",
  },
  {
    id: "1h",
    label: "1시간",
    candleLabel: "1시간봉",
    endpoint: "https://api.upbit.com/v1/candles/minutes/60?market=KRW-BTC&count=40",
  },
  {
    id: "4h",
    label: "4시간",
    candleLabel: "4시간봉",
    endpoint: "https://api.upbit.com/v1/candles/minutes/240?market=KRW-BTC&count=40",
  },
  {
    id: "1d",
    label: "1일",
    candleLabel: "1일봉",
    endpoint: "https://api.upbit.com/v1/candles/days?market=KRW-BTC&count=40",
  },
] as const;

type MarketTimeframe = (typeof marketTimeframes)[number]["id"];

type UpbitTicker = {
  trade_price: number;
  signed_change_rate: number;
  signed_change_price: number;
};

type UpbitCandle = {
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_volume: number;
};

type ChartCandle = {
  id: string;
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  bodyBottom: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
  direction: "up" | "down";
  close: number;
  changeRate: number;
  volume: number;
  volumeHeight: number;
};

const fallbackTicker: UpbitTicker = {
  trade_price: 91875000,
  signed_change_rate: 0.0078,
  signed_change_price: 710000,
};

const fallbackCandles: UpbitCandle[] = fallbackChartBars.map((height, index) => {
  const openingPrice = 91400000 + index * 85000 + (index % 4) * 120000;
  const bodySize = height * 7200;
  const tradePrice = index % 3 === 0 ? openingPrice - bodySize : openingPrice + bodySize;
  const highPrice = Math.max(openingPrice, tradePrice) + 230000 + (index % 3) * 55000;
  const lowPrice = Math.min(openingPrice, tradePrice) - 210000 - (index % 5) * 45000;

  return {
    candle_date_time_kst: `seed-${index}`,
    opening_price: openingPrice,
    high_price: highPrice,
    low_price: lowPrice,
    trade_price: tradePrice,
    candle_acc_trade_volume: 120 + index * 8,
  };
});

function formatCandleDateTime(value: string) {
  if (value.startsWith("seed-")) {
    return `Seed ${value.replace("seed-", "")}`;
  }

  const [datePart, rawTimePart = ""] = value.split("T");
  const [, month = "", day = ""] = datePart.split("-");
  const [hour = "00", minute = "00", second = "00"] = rawTimePart
    .replace("Z", "")
    .split(/[+.]/)[0]
    .split(":");

  return `${month}/${day} ${hour}:${minute}${second !== "00" ? `:${second}` : ""}`;
}

function toChartCandles(candles: UpbitCandle[]) {
  const orderedCandles = [...candles].reverse();
  const minLow = Math.min(...orderedCandles.map((candle) => candle.low_price));
  const maxHigh = Math.max(...orderedCandles.map((candle) => candle.high_price));
  const priceRange = Math.max(maxHigh - minLow, 1);
  const maxVolume = Math.max(...orderedCandles.map((candle) => candle.candle_acc_trade_volume), 1);

  return orderedCandles.map((candle) => {
    const bodyHigh = Math.max(candle.opening_price, candle.trade_price);
    const bodyLow = Math.min(candle.opening_price, candle.trade_price);
    const rawBodyHeight = ((bodyHigh - bodyLow) / priceRange) * 100;
    const volumeHeight =
      candle.candle_acc_trade_volume > 0
        ? Math.max((candle.candle_acc_trade_volume / maxVolume) * 100, 6)
        : 0;

    return {
      id: candle.candle_date_time_kst,
      timeLabel: formatCandleDateTime(candle.candle_date_time_kst),
      open: candle.opening_price,
      high: candle.high_price,
      low: candle.low_price,
      bodyBottom: ((bodyLow - minLow) / priceRange) * 100,
      bodyHeight: Math.max(rawBodyHeight, 2.4),
      wickTop: ((candle.high_price - bodyHigh) / priceRange) * 100,
      wickBottom: ((bodyLow - candle.low_price) / priceRange) * 100,
      direction: candle.trade_price >= candle.opening_price ? "up" : "down",
      close: candle.trade_price,
      changeRate:
        candle.opening_price === 0
          ? 0
          : ((candle.trade_price - candle.opening_price) / candle.opening_price) * 100,
      volume: candle.candle_acc_trade_volume,
      volumeHeight,
    } satisfies ChartCandle;
  });
}

const fallbackChartCandles = toChartCandles(fallbackCandles);

const appViews = [
  { id: "match", label: "멘토 매칭", icon: "◇" },
  { id: "coach", label: "코칭 보드", icon: "◫" },
  { id: "wallet", label: "구독 지갑", icon: "□" },
] as const;

type AppView = (typeof appViews)[number]["id"];
type ChatMessage = {
  id: string;
  author: "mentor" | "mentee";
  body: string;
  time: string;
};

const patternProfiles: Record<
  MentorPattern,
  { label: string; tone: string; summary: string; guide: string }
> = {
  aggressive: {
    label: "공격형",
    tone: "높은 변동성 수용",
    summary: "단기 기회와 빠른 대응을 선호하는 성향입니다.",
    guide: "추격 매수와 손실 확대를 막아줄 멘토를 우선 추천합니다.",
  },
  neutral: {
    label: "중립형",
    tone: "균형형 매매",
    summary: "수익 기회와 리스크 관리를 함께 보는 성향입니다.",
    guide: "분할 전략과 근거 기록을 함께 잡아줄 멘토를 우선 추천합니다.",
  },
  defensive: {
    label: "수비형",
    tone: "손실 제한 우선",
    summary: "자산 방어와 장기 생존 가능성을 중시하는 성향입니다.",
    guide: "현금 비중과 하락장 대응 규칙을 잡아줄 멘토를 우선 추천합니다.",
  },
};

const patternOrder: Record<MentorPattern, number> = {
  aggressive: 0,
  neutral: 1,
  defensive: 2,
};

const subscriptionPlans = [
  {
    id: "basic",
    name: "베이직",
    price: 9900,
    cadence: "월",
    summary: "주 1회 코칭과 기본 리스크 코멘트",
    features: ["주간 포트폴리오 점검", "멘토 코멘트 12회" , "감정 리스크 요약"],
  },
  {
    id: "pro",
    name: "프로",
    price: 19000,
    cadence: "월",
    summary: "실시간 화면 공유 기반 코칭",
    features: ["멘토 코멘트 30회", "급등락 알림 우선", "매매 기록 피드백"],
  },
  {
    id: "prime",
    name: "프라임",
    price: 49000,
    cadence: "월",
    summary: "고빈도 멘토링과 세부 전략 관리",
    features: ["1:1 심화 세션 2회", "관심 종목 리뷰", "월간 전략 리포트"],
  },
] as const;

type SubscriptionPlan = (typeof subscriptionPlans)[number];

function formatCurrency(value: number) {
  return value.toLocaleString("ko-KR");
}

function percent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function signedRate(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function App() {
  const mentors = seedMentors;
  const [signals, setSignals] = useState<MarketSignal[]>(seedSignals);
  const [alerts, setAlerts] = useState<CoachingAlert[]>(seedAlerts);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [menteePattern, setMenteePattern] = useState<MentorPattern>("neutral");
  const [selectedMentorId, setSelectedMentorId] = useState(
    seedMentors.find((mentor) => mentor.pattern === "neutral")?.id ?? seedMentors[0].id,
  );
  const [activeView, setActiveView] = useState<AppView>("match");
  const [portfolioMentor, setPortfolioMentor] = useState<Mentor | null>(null);
  const [pendingMentor, setPendingMentor] = useState<Mentor | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(subscriptionPlans[1].id);
  const [subscribedPlan, setSubscribedPlan] = useState<SubscriptionPlan | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [ticker, setTicker] = useState<UpbitTicker>(fallbackTicker);
  const [chartCandles, setChartCandles] = useState<ChartCandle[]>(fallbackChartCandles);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState("Seed data");
  const [isMarketFallback, setIsMarketFallback] = useState(true);
  const [activeTimeframe, setActiveTimeframe] = useState<MarketTimeframe>("30m");
  const [hoveredCandleIndex, setHoveredCandleIndex] = useState<number | null>(null);

  const activeTimeframeConfig =
    marketTimeframes.find((timeframe) => timeframe.id === activeTimeframe) ?? marketTimeframes[1];

  useEffect(() => subscribeToCollection("signals", seedSignals, setSignals), []);
  useEffect(() => subscribeToCollection("alerts", seedAlerts, setAlerts), []);
  useEffect(() => {
    let isCancelled = false;

    const loadUpbitMarket = async () => {
      try {
        const [tickerResponse, candleResponse] = await Promise.all([
          fetch(upbitTickerEndpoint),
          fetch(activeTimeframeConfig.endpoint),
        ]);

        if (!tickerResponse.ok || !candleResponse.ok) {
          throw new Error("Upbit API request failed");
        }

        const tickerData = (await tickerResponse.json()) as UpbitTicker[];
        const candleData = (await candleResponse.json()) as UpbitCandle[];
        const nextTicker = tickerData[0];

        if (!nextTicker || candleData.length === 0) {
          throw new Error("Upbit API returned empty market data");
        }

        if (!isCancelled) {
          setTicker(nextTicker);
          setChartCandles(toChartCandles(candleData));
          setMarketUpdatedAt(
            new Intl.DateTimeFormat("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date()),
          );
          setIsMarketFallback(false);
        }
      } catch {
        if (!isCancelled) {
          setTicker((previousTicker) => previousTicker ?? fallbackTicker);
          setChartCandles((previousCandles) =>
            previousCandles.length > 0 ? previousCandles : fallbackChartCandles,
          );
          setMarketUpdatedAt("Seed data");
          setIsMarketFallback(true);
        }
      }
    };

    loadUpbitMarket();
    const intervalId = window.setInterval(loadUpbitMarket, marketRefreshMs);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTimeframeConfig.endpoint]);

  const selectedMentor = useMemo(
    () => mentors.find((mentor) => mentor.id === selectedMentorId) ?? mentors[0],
    [mentors, selectedMentorId],
  );

  const recommendedMentors = useMemo(
    () =>
      mentors
        .filter((mentor) => mentor.pattern === menteePattern)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 3),
    [menteePattern, mentors],
  );

  const sortedMentors = useMemo(
    () =>
      [...mentors].sort((a, b) => {
        if (a.pattern === b.pattern) {
          return b.matchScore - a.matchScore;
        }
        return patternOrder[a.pattern] - patternOrder[b.pattern];
      }),
    [mentors],
  );

  const selectedPlan =
    subscriptionPlans.find((plan) => plan.id === selectedPlanId) ?? subscriptionPlans[1];
  const marketPrice = Math.round(ticker.trade_price);
  const marketChangeRate = ticker.signed_change_rate * 100;
  const marketChangePrice = Math.round(ticker.signed_change_price);
  const marketDirection = marketChangeRate >= 0 ? "rise" : "fall";
  const marketChangeText = `${marketChangeRate >= 0 ? "+" : ""}${marketChangeRate.toFixed(2)}% ${
    marketChangePrice >= 0 ? "▲" : "▼"
  } ${formatCurrency(Math.abs(marketChangePrice))} KRW`;
  const displaySignals = useMemo(
    () =>
      signals.map((signal) =>
        signal.symbol === "BTC"
          ? { ...signal, price: marketPrice, changeRate: marketChangeRate }
          : signal,
      ),
    [marketChangeRate, marketPrice, signals],
  );
  const hotSignal = displaySignals.find((signal) => signal.riskLabel === "FOMO") ?? displaySignals[0];
  const mirrorAlert = alerts.find((alert) => alert.id === "mirror") ?? alerts[0];
  const fomoAlert = alerts.find((alert) => alert.id === "fomo") ?? alerts[0];
  const patternProfile = patternProfiles[menteePattern];
  const hoveredCandle =
    hoveredCandleIndex === null ? null : chartCandles[hoveredCandleIndex] ?? null;
  const hoveredCandleLeft =
    hoveredCandleIndex !== null && chartCandles.length > 1
      ? (hoveredCandleIndex / (chartCandles.length - 1)) * 100
      : 50;
  const hoverTooltipPlacement =
    hoveredCandleLeft > 72 ? " align-right" : hoveredCandleLeft < 22 ? " align-left" : "";
  const portfolioCoinReturnMax = portfolioMentor
    ? Math.max(...portfolioMentor.coinReturns.map((coin) => Math.abs(coin.returnRate)), 1)
    : 1;
  const portfolioCoinReturnTotal =
    portfolioMentor?.coinReturns.reduce((total, coin) => total + coin.returnRate, 0) ?? 0;

  const viewCopy = {
    match: {
      eyebrow: "Onboarding Result",
      title: "멘토 매칭",
      search: "멘토명 / 성향 / 전문 분야 검색",
    },
    coach: {
      eyebrow: "Live Coaching Workspace",
      title: "BTC/KRW 코칭 보드",
      search: "코인명 / 멘토 / 리포트 검색",
    },
    wallet: {
      eyebrow: "Subscription Wallet",
      title: "구독 지갑",
      search: "구독 플랜 / 결제 내역 검색",
    },
  } satisfies Record<AppView, { eyebrow: string; title: string; search: string }>;

  const openPortfolio = (mentor: Mentor) => {
    setPortfolioMentor(mentor);
  };

  const openPlan = (mentor: Mentor) => {
    setPortfolioMentor(null);
    setPendingMentor(mentor);
    setSelectedPlanId(subscriptionPlans[1].id);
  };

  const completeSubscription = () => {
    if (!pendingMentor) {
      return;
    }

    setSelectedMentorId(pendingMentor.id);
    setSubscribedPlan(selectedPlan);
    setPendingMentor(null);
    setActiveView("coach");
  };

  const returnToPortfolio = () => {
    if (!pendingMentor) {
      return;
    }

    setPortfolioMentor(pendingMentor);
    setPendingMentor(null);
  };

  const handleOnboardingComplete = (result: OnboardingResult) => {
    const matchedMentor =
      mentors
        .filter((mentor) => mentor.pattern === result.pattern)
        .sort((a, b) => b.matchScore - a.matchScore)[0] ?? mentors[0];

    setMenteePattern(result.pattern);
    setSelectedMentorId(matchedMentor.id);
    setActiveView("match");
    setPortfolioMentor(null);
    setPendingMentor(null);
    setSubscribedPlan(null);
    setIsChatOpen(false);
    setChatMessages([]);
    setChatDraft("");
    setHasCompletedOnboarding(true);

    // Firestore 저장 (비동기, 화면 전환과 무관하게 백그라운드에서 실행)
    saveOnboardingResult({
      userId: getSessionUserId(),
      pattern: result.pattern,
      investorType: result.type,
      scores: result.scores,
      answers: result.answers,
      matchedMentorId: matchedMentor.id,
    }).catch((error) => console.error("온보딩 저장 실패:", error));
  };

  const baseChatMessages: ChatMessage[] = [
    {
      id: "mentor-checkin",
      author: "mentor",
      body: `${selectedMentor.name}입니다. 오늘은 BTC 변동성이 커서 진입 근거와 손절 기준부터 같이 확인해볼게요.`,
      time: "오전 11:42",
    },
    {
      id: "mentee-reply",
      author: "mentee",
      body: "네, 방금 급등한 알트도 같이 봐도 될까요?",
      time: "오전 11:43",
    },
    {
      id: "mentor-guide",
      author: "mentor",
      body: `${selectedMentor.style} 관점으로 먼저 과열 구간인지 체크하고, 매수 판단은 기록으로 남겨봅시다.`,
      time: "오전 11:44",
    },
  ];

  const sendChatMessage = () => {
    const trimmedMessage = chatDraft.trim();

    if (!trimmedMessage) {
      return;
    }

    setChatMessages((messages) => [
      ...messages,
      {
        id: `mentee-${Date.now()}`,
        author: "mentee",
        body: trimmedMessage,
        time: "방금",
      },
    ]);
    setChatDraft("");
  };

  if (!hasCompletedOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">C</div>
          <div>
            <span>Coment</span>
            <strong>코인 멘토링 앱</strong>
          </div>
        </div>

        <nav className="side-nav" aria-label="앱 메뉴">
          {appViews.map((view) => {
            const isLocked = view.id === "coach" && !subscribedPlan;

            return (
              <button
                className={activeView === view.id ? "active" : ""}
                disabled={isLocked}
                key={view.id}
                onClick={() => setActiveView(view.id)}
              >
                <span>{view.icon}</span>
                {view.label}
              </button>
            );
          })}
        </nav>

        <div className="profile-card">
          <span className="profile-label">Mentee</span>
          <strong>김준혁</strong>
          <p>{subscribedPlan ? `${subscribedPlan.name} 구독` : "온보딩 완료 · 매칭 대기"}</p>
          <div>
            <span>{patternProfiles[menteePattern].label}</span>
            <b>{selectedMentor.matchScore}</b>
          </div>
        </div>

        <div className="guard-card">
          <span>가드레일</span>
          <p>매수·매도 추천 없이 검증 정보와 감정 개입만 제공합니다.</p>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-bar">
          <div className="app-title">
            <span>{viewCopy[activeView].eyebrow}</span>
            <h1>{viewCopy[activeView].title}</h1>
          </div>
          <div className="app-actions">
            <div className="global-search">{viewCopy[activeView].search}</div>
            <button className="ghost-button">알림 3</button>
            <button className="solid-button" onClick={() => setActiveView("match")}>
              멘토 연결
            </button>
          </div>
        </header>

        <section className="status-strip">
          {activeView === "match" ? (
            <>
              <span>온보딩 성향</span>
              <strong>{patternProfile.label}</strong>
              <span>{patternProfile.tone}</span>
              <span>추천 멘토 {recommendedMentors.length}명</span>
            </>
          ) : (
            <>
              <span>Coment 실시간 분석</span>
              <strong>{mirrorAlert.metric}</strong>
              <span>주문 취소 4회</span>
              <span>차트 확대 15회</span>
            </>
          )}
          <span className="firebase-state">{firestore ? "Firebase live" : "Seed data"}</span>
        </section>

        {activeView === "match" ? (
          <main className="matching-page">
            <section className="match-summary">
              <article className="match-hero">
                <span>Matching Profile</span>
                <h2>{patternProfile.label} 멘티에게 맞는 멘토를 골랐습니다.</h2>
                <p>{patternProfile.summary}</p>
                <div className="pattern-toggle" aria-label="온보딩 성향">
                  {(Object.keys(patternProfiles) as MentorPattern[]).map((pattern) => (
                    <button
                      className={menteePattern === pattern ? "active" : ""}
                      key={pattern}
                      onClick={() => setMenteePattern(pattern)}
                    >
                      {patternProfiles[pattern].label}
                    </button>
                  ))}
                </div>
              </article>

              <article className="match-rule">
                <span>추천 기준</span>
                <strong>{patternProfile.tone}</strong>
                <p>{patternProfile.guide}</p>
              </article>
            </section>

            <section className="section-heading">
              <div>
                <span>Recommended Mentors</span>
                <h2>성향 일치 추천 3명</h2>
              </div>
            </section>

            <section className="recommend-grid">
              {recommendedMentors.map((mentor) => (
                <button className="mentor-card" key={mentor.id} onClick={() => openPortfolio(mentor)}>
                  <div className="mentor-card-top">
                    <span className="mentor-avatar" style={{ backgroundColor: mentor.accent }}>
                      {mentor.name.slice(0, 1)}
                    </span>
                    <span className={`pattern-pill ${mentor.pattern}`}>
                      {patternProfiles[mentor.pattern].label}
                    </span>
                  </div>
                  <strong>{mentor.name}</strong>
                  <p>{mentor.headline}</p>
                  <div className="mentor-score">
                    <span>매칭률</span>
                    <b>{mentor.matchScore}%</b>
                  </div>
                  <div className="mentor-stats">
                    <span>수익률 {mentor.verifiedReturn.toFixed(1)}%</span>
                    <span>MDD {mentor.drawdown.toFixed(1)}%</span>
                    <span>평점 {mentor.rating.toFixed(1)}</span>
                  </div>
                  <div className="tag-row">
                    {mentor.tags.map((tag) => (
                      <i key={tag}>{tag}</i>
                    ))}
                  </div>
                </button>
              ))}
            </section>

            <section className="mentor-directory">
              <div className="section-heading compact">
                <div>
                  <span>Mentor Directory</span>
                  <h2>전체 멘토 목록</h2>
                </div>
                <strong>{mentors.length}명</strong>
              </div>

              <div className="mentor-list">
                {sortedMentors.map((mentor) => (
                  <button className="mentor-list-row" key={mentor.id} onClick={() => openPortfolio(mentor)}>
                    <span className="mentor-avatar" style={{ backgroundColor: mentor.accent }}>
                      {mentor.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{mentor.name}</strong>
                      <small>
                        {patternProfiles[mentor.pattern].label} · {mentor.specialty}
                      </small>
                    </span>
                    <em>{mentor.style}</em>
                    <b>{mentor.matchScore}%</b>
                  </button>
                ))}
              </div>
            </section>
          </main>
        ) : activeView === "wallet" ? (
          <main className="wallet-page">
            <section className="wallet-panel">
              <span>Current Subscription</span>
              <h2>{subscribedPlan ? `${subscribedPlan.name} 플랜` : "아직 구독 전입니다."}</h2>
              <p>
                {subscribedPlan
                  ? `${selectedMentor.name} 멘토와 1:1 코칭 관계가 연결되어 있습니다.`
                  : "멘토를 선택하고 요금제 안내에서 구독 버튼을 누르면 코칭 보드가 열립니다."}
              </p>
              <button className="solid-button" onClick={() => setActiveView("match")}>
                멘토 목록 보기
              </button>
            </section>

            <section className="plan-ledger">
              {subscriptionPlans.map((plan) => (
                <article className={subscribedPlan?.id === plan.id ? "active" : ""} key={plan.id}>
                  <span>{plan.name}</span>
                  <strong>{formatCurrency(plan.price)}원</strong>
                  <p>{plan.summary}</p>
                </article>
              ))}
            </section>
          </main>
        ) : (
          <main className="workbench">
            <section className="workspace-column">
              <section className="metric-grid">
                <article className="asset-card">
                  <div className="asset-title">
                    <span className="coin-dot" />
                    <h2>비트코인</h2>
                    <small>BTC/KRW</small>
                  </div>
                  <strong className={`asset-price ${marketDirection}`}>
                    {formatCurrency(marketPrice)}
                  </strong>
                  <p className={`asset-change ${marketDirection}`}>{marketChangeText}</p>
                </article>

                <article className="mini-card">
                  <span>멘토 수익률</span>
                  <strong>+{selectedMentor.verifiedReturn.toFixed(1)}%</strong>
                  <p>{selectedMentor.badge}</p>
                </article>

                <article className="mini-card">
                  <span>감정 상태</span>
                  <strong>안정 52%</strong>
                  <p>급락 후 매도 시도 없음</p>
                </article>
              </section>

              <article className="chart-card">
                <div className="panel-header">
                  <div className="panel-tabs">
                    <button className="active">시세</button>
                    <button>정보</button>
                    <button>마켓 인사이트</button>
                  </div>
                  <div className="time-tabs">
                    {marketTimeframes.map((timeframe) => (
                      <button
                        className={activeTimeframe === timeframe.id ? "active" : ""}
                        key={timeframe.id}
                        onClick={() => {
                          setActiveTimeframe(timeframe.id);
                          setHoveredCandleIndex(null);
                        }}
                      >
                        {timeframe.label}
                      </button>
                    ))}
                  </div>
                  <span className={`market-live-pill ${isMarketFallback ? "fallback" : ""}`}>
                    {isMarketFallback ? "Upbit fallback" : "Upbit live"}
                    <small>{marketUpdatedAt}</small>
                  </span>
                </div>

                <div className="chart-stage" onMouseLeave={() => setHoveredCandleIndex(null)}>
                  <div className="grid-lines" />
                  <div
                    className="candle-chart"
                    aria-label={`비트코인 ${activeTimeframeConfig.candleLabel} 캔들 차트`}
                  >
                    {hoveredCandle ? (
                      <span
                        className="chart-hover-line"
                        style={{ left: `${hoveredCandleLeft}%` }}
                      />
                    ) : null}
                    {chartCandles.map((candle, index) => (
                      <span
                        className={`candle ${candle.direction}${
                          hoveredCandleIndex === index ? " matched" : ""
                        }`}
                        key={`${candle.id}-${index}`}
                        onMouseEnter={() => setHoveredCandleIndex(index)}
                        onMouseMove={() => setHoveredCandleIndex(index)}
                        onMouseOver={() => setHoveredCandleIndex(index)}
                        style={
                          {
                            "--wick-bottom": `${candle.wickBottom}%`,
                            "--wick-top": `${candle.wickTop}%`,
                            bottom: `${candle.bodyBottom}%`,
                            height: `${candle.bodyHeight}%`,
                            left: `${
                              chartCandles.length > 1
                                ? (index / (chartCandles.length - 1)) * 100
                                : 50
                            }%`,
                          } as CSSProperties
                        }
                        title={`${candle.timeLabel} 종가 ${formatCurrency(
                          Math.round(candle.close),
                        )} KRW · 거래량 ${candle.volume.toFixed(4)} BTC`}
                      />
                    ))}
                  </div>
                  <div className="volume-chart" aria-label={`${activeTimeframeConfig.candleLabel} 거래량`}>
                    <span>거래량</span>
                    <div className="volume-bars">
                      {hoveredCandle ? (
                        <span
                          className="volume-hover-line"
                          style={{ left: `${hoveredCandleLeft}%` }}
                        />
                      ) : null}
                      {chartCandles.map((candle, index) => (
                        <i
                          className={`${candle.direction}${
                            hoveredCandleIndex === index ? " matched" : ""
                          }`}
                          key={`${candle.id}-volume-${index}`}
                          onMouseEnter={() => setHoveredCandleIndex(index)}
                          onMouseMove={() => setHoveredCandleIndex(index)}
                          onMouseOver={() => setHoveredCandleIndex(index)}
                          style={
                            {
                              height: `${candle.volumeHeight}%`,
                              left: `${
                                chartCandles.length > 1
                                  ? (index / (chartCandles.length - 1)) * 100
                                  : 50
                              }%`,
                            } as CSSProperties
                          }
                          title={`거래량 ${candle.volume.toFixed(4)} BTC`}
                        />
                      ))}
                    </div>
                  </div>
                  {hoveredCandle ? (
                    <div
                      className={`chart-hover-tooltip${hoverTooltipPlacement}`}
                      style={{ left: `${hoveredCandleLeft}%` }}
                    >
                      <span>{hoveredCandle.timeLabel}</span>
                      <strong>{formatCurrency(Math.round(hoveredCandle.close))} KRW</strong>
                      <dl>
                        <div>
                          <dt>시가</dt>
                          <dd>{formatCurrency(Math.round(hoveredCandle.open))}</dd>
                        </div>
                        <div>
                          <dt>고가</dt>
                          <dd>{formatCurrency(Math.round(hoveredCandle.high))}</dd>
                        </div>
                        <div>
                          <dt>저가</dt>
                          <dd>{formatCurrency(Math.round(hoveredCandle.low))}</dd>
                        </div>
                        <div>
                          <dt>종가</dt>
                          <dd>{formatCurrency(Math.round(hoveredCandle.close))}</dd>
                        </div>
                        <div>
                          <dt>등락</dt>
                          <dd className={hoveredCandle.changeRate >= 0 ? "profit" : "loss"}>
                            {percent(hoveredCandle.changeRate)}
                          </dd>
                        </div>
                        <div>
                          <dt>거래량</dt>
                          <dd>{hoveredCandle.volume.toFixed(4)} BTC</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                </div>

                <div className="chart-insight-strip">
                  <div className="replay-card">
                    <span>Emotion Replay</span>
                    <p>급락 후 평균 5분 안에 매도 패턴</p>
                    <div className="replay-dots">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <div className="upbit-sync-card">
                    <span>Upbit Sync</span>
                    <strong>BTC/KRW {activeTimeframeConfig.candleLabel}</strong>
                    <p>
                      {isMarketFallback
                        ? "API 연결 실패 시 seed 차트로 화면을 유지합니다."
                        : `${marketUpdatedAt} 기준 공개 API 데이터가 반영되었습니다.`}
                    </p>
                  </div>
                </div>
              </article>

              <section className="bottom-grid">
                <article className="orderbook">
                  <div className="panel-tabs">
                    <button className="active">일반호가</button>
                    <button>누적호가</button>
                    <button>호가주문</button>
                  </div>
                  {displaySignals.map((signal) => (
                    <div className="order-row" key={signal.id}>
                      <span>{signal.symbol}</span>
                      <strong>{formatCurrency(signal.price)}</strong>
                      <b className={signal.changeRate >= 0 ? "rise" : "fall"}>
                        {percent(signal.changeRate)}
                      </b>
                    </div>
                  ))}
                </article>

                <article className="mentor-advice">
                  <div className="panel-tabs red">
                    <button className="active">멘토 코멘트</button>
                    <button>자문 요청</button>
                    <button>기록</button>
                  </div>
                  <div className="advocate-box">
                    <span>Coment Mentor</span>
                    <h3>{selectedMentor.name} 멘토가 현재 화면을 보고 있습니다.</h3>
                    <p>
                      {selectedMentor.style} · {selectedMentor.specialty}
                    </p>
                    <button>멘토 의견 보기</button>
                  </div>
                </article>
              </section>
            </section>

            <aside className="right-rail">
              <section className="rail-panel matched-mentor-panel">
                <div className="rail-title">
                  <span>Matched Mentor</span>
                  <h2>1:1 담당 프로필</h2>
                </div>
                <div className="matched-mentor-head">
                  <span className="mentor-avatar large" style={{ backgroundColor: selectedMentor.accent }}>
                    {selectedMentor.name.slice(0, 1)}
                  </span>
                  <div>
                    <strong>{selectedMentor.name}</strong>
                    <small>
                      {patternProfiles[selectedMentor.pattern].label} · {selectedMentor.specialty}
                    </small>
                  </div>
                </div>
                <p>{selectedMentor.headline}</p>
                <div className="mentor-profile-stats">
                  <span>
                    매칭률 <b>{selectedMentor.matchScore}%</b>
                  </span>
                  <span>
                    수익률 <b>+{selectedMentor.verifiedReturn.toFixed(1)}%</b>
                  </span>
                  <span>
                    평점 <b>{selectedMentor.rating.toFixed(1)}</b>
                  </span>
                </div>
                <div className="tag-row compact">
                  {selectedMentor.tags.map((tag) => (
                    <i key={tag}>{tag}</i>
                  ))}
                </div>
                <button className="chat-entry-card" onClick={() => setIsChatOpen(true)}>
                  <span>Mentor Chat</span>
                  <strong>{selectedMentor.name} 멘토와 채팅방 열기</strong>
                  <small>요금제 구독 후 연결된 1:1 코칭 대화방</small>
                </button>
              </section>

              <section className="rail-panel">
                <div className="search-box">코인명 / 심볼 검색</div>
                <div className="market-tabs">
                  <button className="active">원화</button>
                  <button>BTC</button>
                  <button>관심</button>
                </div>
                <div className="fomo-banner">
                  <div>
                    <strong>{fomoAlert.title}</strong>
                    <p>{hotSignal.koreanName} 클릭 시 추격매수 위험 경고</p>
                  </div>
                  <span>{fomoAlert.metric}</span>
                </div>
                <div className="coin-list">
                  {displaySignals.map((signal) => (
                    <button className="coin-row" key={signal.id}>
                      <span>
                        <strong>{signal.koreanName}</strong>
                        <small>{signal.symbol}/KRW</small>
                      </span>
                      <b>{formatCurrency(signal.price)}</b>
                      <em className={signal.changeRate >= 0 ? "rise" : "fall"}>
                        {percent(signal.changeRate)}
                      </em>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </main>
        )}
      </div>

      {portfolioMentor ? (
        <div className="modal-backdrop" onClick={() => setPortfolioMentor(null)}>
          <section
            aria-label={`${portfolioMentor.name} 멘토 포트폴리오`}
            className="portfolio-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-title">
              <div>
                <span>Mentor Portfolio</span>
                <h2>{portfolioMentor.name} 멘토 포트폴리오</h2>
                <p>{portfolioMentor.headline}</p>
              </div>
              <button aria-label="닫기" onClick={() => setPortfolioMentor(null)}>
                ×
              </button>
            </div>

            <div className="portfolio-layout">
              <section className="portfolio-profile">
                <div className="matched-mentor-head">
                  <span className="mentor-avatar large" style={{ backgroundColor: portfolioMentor.accent }}>
                    {portfolioMentor.name.slice(0, 1)}
                  </span>
                  <div>
                    <strong>{portfolioMentor.name}</strong>
                    <small>
                      {patternProfiles[portfolioMentor.pattern].label} · {portfolioMentor.specialty}
                    </small>
                  </div>
                </div>
                <p>{portfolioMentor.philosophy}</p>
                <div className="tag-row compact">
                  {portfolioMentor.tags.map((tag) => (
                    <i key={tag}>{tag}</i>
                  ))}
                </div>
              </section>

              <section
                className="portfolio-chart"
                aria-label={`${portfolioMentor.name} 멘토 우량 코인별 수익률`}
              >
                <div className="portfolio-coin-chart">
                  <div className="portfolio-coin-bars">
                    {portfolioMentor.coinReturns.map((coin) => (
                      <div className="portfolio-coin-item" key={coin.symbol} title={coin.name}>
                        <div className="coin-bar-track">
                          <i
                            className={coin.returnRate >= 0 ? "positive" : "negative"}
                            style={{
                              height: `${Math.max(
                                (Math.abs(coin.returnRate) / portfolioCoinReturnMax) * 100,
                                8,
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="coin-return-label">
                          <strong>{coin.symbol}</strong>
                          <small>{coin.name}</small>
                          <span className={coin.returnRate >= 0 ? "profit" : "loss"}>
                            {signedRate(coin.returnRate)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="portfolio-chart-summary">
                    <span>우량 코인별 6개월 검증 수익률</span>
                    <strong>합산 {signedRate(portfolioCoinReturnTotal)}</strong>
                  </div>
                </div>
              </section>
            </div>

            <div className="portfolio-stats-grid">
              <article>
                <span>검증 수익률</span>
                <strong>+{portfolioMentor.verifiedReturn.toFixed(1)}%</strong>
              </article>
              <article>
                <span>최대 낙폭</span>
                <strong>{portfolioMentor.drawdown.toFixed(1)}%</strong>
              </article>
              <article>
                <span>평점</span>
                <strong>{portfolioMentor.rating.toFixed(1)}</strong>
              </article>
              <article>
                <span>1시간 내 응답률</span>
                <strong>{portfolioMentor.responseRate}%</strong>
              </article>
            </div>

            <section className="portfolio-note">
              <span>구독 전 확인</span>
              <p>
                이 멘토의 코칭 방식이 맞다고 판단되면 구독 상품을 확인하세요. 실제 결제 대신
                버튼을 누르면 코칭 보드 연결 흐름을 시연합니다.
              </p>
            </section>

            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setPortfolioMentor(null)}>
                다른 멘토 보기
              </button>
              <button className="solid-button" onClick={() => openPlan(portfolioMentor)}>
                구독 상품 보기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingMentor ? (
        <div className="modal-backdrop" onClick={() => setPendingMentor(null)}>
          <section
            aria-label={`${pendingMentor.name} 멘토 구독 요금제`}
            className="pricing-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-title">
              <div>
                <span>Subscribe Mentor</span>
                <h2>{pendingMentor.name} 멘토 구독</h2>
                <p>{pendingMentor.philosophy}</p>
              </div>
              <button aria-label="닫기" onClick={() => setPendingMentor(null)}>
                ×
              </button>
            </div>

            <div className="pricing-grid">
              {subscriptionPlans.map((plan) => (
                <button
                  className={selectedPlanId === plan.id ? "active" : ""}
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  <span>{plan.name}</span>
                  <strong>{formatCurrency(plan.price)}원</strong>
                  <p>
                    {plan.cadence} · {plan.summary}
                  </p>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            <div className="modal-actions">
              <button className="ghost-button" onClick={returnToPortfolio}>
                돌아가기
              </button>
              <button className="solid-button" onClick={completeSubscription}>
                결제하기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isChatOpen ? (
        <div className="modal-backdrop" onClick={() => setIsChatOpen(false)}>
          <section
            aria-label={`${selectedMentor.name} 멘토와 1:1 채팅방`}
            className="chat-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="chat-title">
              <div className="matched-mentor-head">
                <span className="mentor-avatar large" style={{ backgroundColor: selectedMentor.accent }}>
                  {selectedMentor.name.slice(0, 1)}
                </span>
                <div>
                  <span>Mentor-Mentee Chat</span>
                  <h2>{selectedMentor.name} 멘토와 1:1 코칭방</h2>
                  <p>{subscribedPlan ? `${subscribedPlan.name} 구독 · 실시간 코멘트 연결` : "구독 연결 대기"}</p>
                </div>
              </div>
              <button aria-label="닫기" onClick={() => setIsChatOpen(false)}>
                ×
              </button>
            </div>

            <div className="chat-thread">
              {[...baseChatMessages, ...chatMessages].map((message) => (
                <div className={`chat-bubble ${message.author}`} key={message.id}>
                  <p>{message.body}</p>
                  <span>{message.time}</span>
                </div>
              ))}
            </div>

            <div className="chat-composer">
              <input
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    sendChatMessage();
                  }
                }}
                placeholder="멘토에게 남길 질문을 입력하세요"
                value={chatDraft}
              />
              <button className="solid-button" onClick={sendChatMessage}>
                전송
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <nav className="mobile-tabbar" aria-label="모바일 앱 메뉴">
        {appViews.map((view) => {
          const isLocked = view.id === "coach" && !subscribedPlan;

          return (
            <button
              className={activeView === view.id ? "active" : ""}
              disabled={isLocked}
              key={view.id}
              onClick={() => setActiveView(view.id)}
            >
              <span>{view.icon}</span>
              {view.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
