export type Mentor = {
  id: string;
  name: string;
  specialty: string;
  style: string;
  verifiedReturn: number;
  drawdown: number;
  rating: number;
  menteeCount: number;
  badge: string;
  accent: string;
};

export type MarketSignal = {
  id: string;
  symbol: string;
  koreanName: string;
  price: number;
  changeRate: number;
  volumeLabel: string;
  riskLabel: string;
};

export type CoachingAlert = {
  id: string;
  title: string;
  description: string;
  metric: string;
  tone: "fear" | "greed" | "neutral";
};
