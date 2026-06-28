import type { CoachingAlert, MarketSignal, Mentor } from "../types";

export const seedMentors: Mentor[] = [
  {
    id: "mentor-park",
    name: "박성민",
    specialty: "BTC/ETH 스윙",
    style: "차분한 리스크 관리",
    verifiedReturn: 38.4,
    drawdown: -9.2,
    rating: 4.9,
    menteeCount: 42,
    badge: "업비트 6개월 검증",
    accent: "#0f7cff",
  },
  {
    id: "mentor-lee",
    name: "이하린",
    specialty: "알트 변동성",
    style: "FOMO 방어 코칭",
    verifiedReturn: 24.7,
    drawdown: -14.8,
    rating: 4.8,
    menteeCount: 31,
    badge: "앰버서더 교육 이수",
    accent: "#ff9f1c",
  },
  {
    id: "mentor-choi",
    name: "최도윤",
    specialty: "장기 포트폴리오",
    style: "저변동 누적형",
    verifiedReturn: 18.1,
    drawdown: -6.4,
    rating: 4.7,
    menteeCount: 27,
    badge: "면책 표현 가이드 통과",
    accent: "#18a058",
  },
];

export const seedSignals: MarketSignal[] = [
  {
    id: "btc",
    symbol: "BTC",
    koreanName: "비트코인",
    price: 91875000,
    changeRate: 0.78,
    volumeLabel: "61,475백만",
    riskLabel: "관찰",
  },
  {
    id: "xrp",
    symbol: "XRP",
    koreanName: "리플",
    price: 1613,
    changeRate: 1.45,
    volumeLabel: "81,704백만",
    riskLabel: "뉴스 자극",
  },
  {
    id: "edge",
    symbol: "EDGE",
    koreanName: "디피니티브",
    price: 130,
    changeRate: 27.45,
    volumeLabel: "43,054백만",
    riskLabel: "FOMO",
  },
  {
    id: "eth",
    symbol: "ETH",
    koreanName: "이더리움",
    price: 2414000,
    changeRate: 0.88,
    volumeLabel: "36,066백만",
    riskLabel: "중립",
  },
];

export const seedAlerts: CoachingAlert[] = [
  {
    id: "fomo",
    title: "FOMO Detector",
    description: "24시간 급등 종목 클릭 시 추격매수 위험 경고",
    metric: "평균 조정 -17%",
    tone: "greed",
  },
  {
    id: "mirror",
    title: "Emotion Mirror",
    description: "급락 후 매도 시도와 주문 취소 패턴을 감지",
    metric: "공포 82%",
    tone: "fear",
  },
  {
    id: "advocate",
    title: "Devil's Advocate AI",
    description: "매수 전 반대 근거까지 함께 확인",
    metric: "근거 기록",
    tone: "neutral",
  },
];
