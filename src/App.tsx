import { useEffect, useMemo, useState } from "react";
import { seedAlerts, seedMentors, seedSignals } from "./data/seed";
import { firestore, subscribeToCollection } from "./lib/firebase";
import type { CoachingAlert, MarketSignal, Mentor } from "./types";

const chartBars = [46, 58, 72, 65, 38, 28, 42, 64, 55, 31, 25, 48, 79, 70, 44, 36, 52, 83];

const appViews = [
  { id: "coach", label: "코칭 보드", icon: "◫" },
  { id: "match", label: "멘토 매칭", icon: "◇" },
  { id: "wallet", label: "구독 지갑", icon: "□" },
] as const;

type AppView = (typeof appViews)[number]["id"];

function formatCurrency(value: number) {
  return value.toLocaleString("ko-KR");
}

function percent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function App() {
  const [mentors, setMentors] = useState<Mentor[]>(seedMentors);
  const [signals, setSignals] = useState<MarketSignal[]>(seedSignals);
  const [alerts, setAlerts] = useState<CoachingAlert[]>(seedAlerts);
  const [selectedMentorId, setSelectedMentorId] = useState(seedMentors[0].id);
  const [activeView, setActiveView] = useState<AppView>("coach");

  useEffect(() => subscribeToCollection("mentors", seedMentors, setMentors), []);
  useEffect(() => subscribeToCollection("signals", seedSignals, setSignals), []);
  useEffect(() => subscribeToCollection("alerts", seedAlerts, setAlerts), []);

  const selectedMentor = useMemo(
    () => mentors.find((mentor) => mentor.id === selectedMentorId) ?? mentors[0],
    [mentors, selectedMentorId],
  );

  const hotSignal = signals.find((signal) => signal.riskLabel === "FOMO") ?? signals[0];
  const mirrorAlert = alerts.find((alert) => alert.id === "mirror") ?? alerts[0];
  const fomoAlert = alerts.find((alert) => alert.id === "fomo") ?? alerts[0];

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
          {appViews.map((view) => (
            <button
              className={activeView === view.id ? "active" : ""}
              key={view.id}
              onClick={() => setActiveView(view.id)}
            >
              <span>{view.icon}</span>
              {view.label}
            </button>
          ))}
        </nav>

        <div className="profile-card">
          <span className="profile-label">Mentee</span>
          <strong>김준혁</strong>
          <p>초보자 · 베이직 구독</p>
          <div>
            <span>Fear</span>
            <b>82</b>
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
            <span>Live Coaching Workspace</span>
            <h1>BTC/KRW 코칭 보드</h1>
          </div>
          <div className="app-actions">
            <div className="global-search">코인명 / 멘토 / 리포트 검색</div>
            <button className="ghost-button">알림 3</button>
            <button className="solid-button">멘토 연결</button>
          </div>
        </header>

        <section className="status-strip">
          <span>Coment 실시간 분석</span>
          <strong>{mirrorAlert.metric}</strong>
          <span>주문 취소 4회</span>
          <span>차트 확대 15회</span>
          <span className="firebase-state">{firestore ? "Firebase live" : "Seed data"}</span>
        </section>

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
            <section className="rail-panel">
              <div className="rail-title">
                <span>Verified Mentors</span>
                <h2>멘토 선택</h2>
              </div>
              {mentors.map((mentor) => (
                <button
                  className={`mentor-row ${selectedMentor.id === mentor.id ? "active" : ""}`}
                  key={mentor.id}
                  onClick={() => setSelectedMentorId(mentor.id)}
                >
                  <span className="mentor-avatar" style={{ backgroundColor: mentor.accent }}>
                    {mentor.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{mentor.name}</strong>
                    <small>{mentor.badge}</small>
                  </span>
                  <b>+{mentor.verifiedReturn.toFixed(1)}%</b>
                </button>
              ))}
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
      </div>

      <nav className="mobile-tabbar" aria-label="모바일 앱 메뉴">
        {appViews.map((view) => (
          <button
            className={activeView === view.id ? "active" : ""}
            key={view.id}
            onClick={() => setActiveView(view.id)}
          >
            <span>{view.icon}</span>
            {view.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
