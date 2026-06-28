export type MentorPattern = "aggressive" | "neutral" | "defensive";

export type Mentor = {
  id: string;
  name: string;
  pattern: MentorPattern;
  specialty: string;
  style: string;
  headline: string;
  philosophy: string;
  verifiedReturn: number;
  drawdown: number;
  rating: number;
  menteeCount: number;
  matchScore: number;
  monthlyPrice: number;
  badge: string;
  tags: string[];
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
