export type BrightDataPost = {
  id: string;
  text: string;
  url?: string | null;
  createdAt: string | null;
  authorName?: string | null;
  authorUsername?: string | null;
  isNew: boolean;
};

export type BrightDataReport = {
  generatedAt: string;
  updatedAt: string | null;
  status: "ok" | "stale" | "empty" | "error";
  totalPosts: number;
  newPosts: number;
  posts: BrightDataPost[];
  errors: string[];
};

export type BrightDataRawPost = Record<string, unknown>;
