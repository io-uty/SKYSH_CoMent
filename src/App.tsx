import { useEffect, useMemo, useState } from "react";
import { seedAlerts, seedMentors, seedSignals } from "./data/seed";
import { firestore, subscribeToCollection } from "./lib/firebase";
import type { CoachingAlert, MarketSignal, Mentor, MentorPattern } from "./types";

const chartBars = [46, 58, 72, 65, 38, 28, 42, 64, 55, 31, 25, 48, 79, 70, 44, 36, 52, 83];

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
    price: 79000,
    cadence: "월",
    summary: "주 1회 코칭과 기본 리스크 코멘트",
    features: ["주간 포트폴리오 점검", "멘토 코멘트 12회", "감정 리스크 요약"],
  },
  {
    id: "pro",
    name: "프로",
    price: 129000,
    cadence: "월",
    summary: "실시간 화면 공유 기반 코칭",
    features: ["멘토 코멘트 30회", "급등락 알림 우선", "매매 기록 피드백"],
  },
  {
    id: "prime",
    name: "프라임",
    price: 219000,
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

function App() {
  const mentors = seedMentors;
  const [signals, setSignals] = useState<MarketSignal[]>(seedSignals);
  const [alerts, setAlerts] = useState<CoachingAlert[]>(seedAlerts);
  const [menteePattern, setMenteePattern] = useState<MentorPattern>("neutral");
  const [selectedMentorId, setSelectedMentorId] = useState(
    seedMentors.find((mentor) => mentor.pattern === "neutral")?.id ?? seedMentors[0].id,
  );
  const [activeView, setActiveView] = useState<AppView>("match");
  const [pendingMentor, setPendingMentor] = useState<Mentor | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(subscriptionPlans[1].id);
  const [subscribedPlan, setSubscribedPlan] = useState<SubscriptionPlan | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => subscribeToCollection("signals", seedSignals, setSignals), []);
  useEffect(() => subscribeToCollection("alerts", seedAlerts, setAlerts), []);

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
  const hotSignal = signals.find((signal) => signal.riskLabel === "FOMO") ?? signals[0];
  const mirrorAlert = alerts.find((alert) => alert.id === "mirror") ?? alerts[0];
  const fomoAlert = alerts.find((alert) => alert.id === "fomo") ?? alerts[0];
  const patternProfile = patternProfiles[menteePattern];

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

  const openPlan = (mentor: Mentor) => {
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">C</div>
          <div>
            <span>Coment</sgipan>
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
                <button className="mentor-card" key={mentor.id} onClick={() => openPlan(mentor)}>
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
                  <button className="mentor-list-row" key={mentor.id} onClick={() => openPlan(mentor)}>
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
                  <strong className="asset-price">91,875,000</strong>
                  <p className="asset-change">+0.78% ▲ 710,000 KRW</p>
                </article>

                <article className="mini-card">
                  <span>멘토 수익률</span>
                  <strong>+{selectedMentor.verifiedReturn.toFixed(1)}%</strong>
                  <p>{selectedMentor.badge}</p>
                </article>

                <article className="mini-card">
                  <span>감정 상태</span>
                  <strong>공포 82%</strong>
                  <p>급락 후 매도 시도 감지</p>
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
                    <button>1분</button>
                    <button className="active">30분</button>
                    <button>1일</button>
                  </div>
                </div>

                <div className="chart-stage">
                  <div className="grid-lines" />
                  <div className="candle-chart" aria-label="비트코인 캔들 차트">
                    {chartBars.map((height, index) => (
                      <span
                        className={index % 3 === 0 ? "candle down" : "candle up"}
                        key={`${height}-${index}`}
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
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
                </div>
              </article>

              <section className="bottom-grid">
                <article className="orderbook">
                  <div className="panel-tabs">
                    <button className="active">일반호가</button>
                    <button>누적호가</button>
                    <button>호가주문</button>
                  </div>
                  {signals.map((signal) => (
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
                  {signals.map((signal) => (
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
              <button className="ghost-button" onClick={() => setPendingMentor(null)}>
                나중에 선택
              </button>
              <button className="solid-button" onClick={completeSubscription}>
                구독 결제하고 코칭 보드로 이동
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
