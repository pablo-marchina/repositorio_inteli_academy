export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ArticleCandidate = {
  title: string;
  url: string;
  source: string;
  summary: string;
  publishedAt: string;
  contentType: "research" | "news" | "tool" | "regulation" | "market" | "other";
  sourceQuality: number;
  popularity: {
    points?: number;
    comments?: number;
    mentions?: number;
  };
};

export type StoryCluster = {
  id?: string;
  title: string;
  summary: string;
  topic: string;
  articleIds: string[];
  sourceUrls: string[];
  sourceCount: number;
  sourceQuality: number;
  popularityScore: number;
  noveltyScore: number;
  clarityScore: number;
  predictedEngagement: number;
  score: number;
};

export type SlideLayout =
  | "cover"
  | "headline"
  | "stat"
  | "split"
  | "timeline"
  | "cards"
  | "impact"
  | "sources"
  | "cta";

export type SlideComposition = "editorial" | "poster" | "modular" | "split" | "stack" | "list";
export type SlideMotif = "brackets" | "orbit" | "grid" | "ribbon" | "frame" | "none";
export type SlideTitleStyle = "sans" | "serif" | "mixed";

export type PostSlide = {
  position: number;
  layout: SlideLayout;
  eyebrow?: string;
  title: string;
  body?: string;
  stat?: string;
  statLabel?: string;
  bullets?: string[];
  sourceLabels?: string[];
  accent?: "blue" | "black" | "white";
  composition?: SlideComposition;
  motif?: SlideMotif;
  titleStyle?: SlideTitleStyle;
  highlight?: string;
};

export type GeneratedPost = {
  title: string;
  caption: string;
  slides: PostSlide[];
  features: Record<string, number | string | boolean>;
  factualClaims: Array<{ claim: string; sourceUrl: string }>;
};

export type ReviewResult = {
  passed: boolean;
  score: number;
  issues: string[];
  corrections: string[];
};

export type InstagramAccount = {
  id: string;
  instagramUserId: string;
  username: string;
  accountType: string | null;
  accessTokenEncrypted: string;
  tokenExpiresAt: string | null;
};

export type EngagementMetrics = {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  follows: number;
  profileVisits: number;
  totalInteractions: number;
};
