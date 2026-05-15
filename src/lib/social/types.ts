export type SocialSectionId = "geopolitics" | "conflict" | "military";

export type SocialTweet = {
  id: string;
  username: string;
  displayName: string;
  text: string;
  createdAt: string;
  url: string;
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  quoteCount: number;
  lang?: string;
  isOfficial: boolean;
  matchedKeywords: string[];
  sectionIds: SocialSectionId[];
  isNew: boolean;
};

export type SocialSectionReport = {
  id: SocialSectionId;
  name: string;
  summary: string;
  tweetCount: number;
  newTweetCount: number;
  topKeywords: string[];
  officialTweets: SocialTweet[];
  correlatedTweets: SocialTweet[];
};

export type SocialReport = {
  generatedAt: string;
  updatedAt: string | null;
  status: "ok" | "stale" | "empty" | "error";
  summary: string;
  keywords: string[];
  totalTweets: number;
  newTweets: number;
  sections: SocialSectionReport[];
  errors: string[];
};

export type ScrapedSocialTweet = {
  id: string;
  username: string;
  displayName: string;
  text: string;
  createdAt: string;
  url: string;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  quoteCount?: number;
  lang?: string;
  isVerified?: boolean;
  source?: "official" | "search";
};
