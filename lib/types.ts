import type {
  FigmaColor,
  FigmaComposition,
  FigmaCornerRadius,
  FigmaEffect,
  FigmaFontWeight,
  FigmaGradient,
  FigmaLayout,
  FigmaMediaMode,
  FigmaMotif,
  FigmaStrokeWeight,
  FigmaTypeface,
  FigmaTypeSize,
  FigmaVisualElement
} from "@/lib/figma-visual-system";

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

export type SlideLayout = FigmaLayout | "sources";
export type SlideComposition = FigmaComposition;
export type SlideMotif = FigmaMotif;

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
  highlight?: string;
  backgroundColor?: FigmaColor;
  foregroundColor?: FigmaColor;
  accentColor?: FigmaColor;
  gradient?: FigmaGradient;
  composition?: FigmaComposition;
  motif?: FigmaMotif;
  titleTypeface?: FigmaTypeface;
  bodyTypeface?: FigmaTypeface;
  titleWeight?: FigmaFontWeight;
  bodyWeight?: FigmaFontWeight;
  titleItalic?: boolean;
  bodyItalic?: boolean;
  titleSize?: FigmaTypeSize;
  bodySize?: FigmaTypeSize;
  cornerRadius?: FigmaCornerRadius;
  strokeWeight?: FigmaStrokeWeight;
  effect?: FigmaEffect;
  mediaMode?: FigmaMediaMode;
  visualElements?: FigmaVisualElement[];
  mediaAssetId?: string;
  /** Campos mantidos apenas para renderizar posts antigos. */
  accent?: "blue" | "black" | "white";
  titleStyle?: "sans" | "serif" | "mixed";
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

export type StudioContentType = "single" | "carousel" | "reel" | "story";
export type StudioFrameTemplate = "cover" | "editorial" | "stat" | "quote" | "photo" | "cta";

export type DriveAsset = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string | null;
  thumbnailLink?: string | null;
  modifiedTime?: string | null;
  size?: string | null;
  path?: string[];
};

export type InstagramReferencePost = {
  id: string;
  mediaType: string;
  mediaProductType: string | null;
  caption: string;
  permalink: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  timestamp: string;
  children: Array<Record<string, unknown>>;
  visualAnalysis?: Record<string, unknown>;
};

export type StudioFrame = {
  position: number;
  template: StudioFrameTemplate;
  eyebrow?: string;
  title: string;
  body?: string;
  bullets?: string[];
  stat?: string;
  statLabel?: string;
  mediaAssetId?: string;
  mediaFit?: "cover" | "contain";
};

export type StudioPayload = {
  contentType: StudioContentType;
  title: string;
  caption: string;
  frames: StudioFrame[];
  factualClaims: Array<{ claim: string; sourceUrl: string }>;
  primaryDriveAssetId?: string;
  styleSummary: string;
};
