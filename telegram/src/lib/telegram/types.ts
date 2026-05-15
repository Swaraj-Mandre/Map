export type TelegramMessage = {
  id: string;
  channelId: string;
  channelTitle: string;
  channelUsername?: string | null;
  messageId: number;
  text: string;
  createdAt: string;
  url: string;
  isNew: boolean;
};

export type TelegramChannelSummary = {
  channelId: string;
  channelTitle: string;
  channelUsername?: string | null;
  totalMessages: number;
  newMessages: number;
};

export type TelegramReport = {
  generatedAt: string;
  updatedAt: string | null;
  status: "ok" | "stale" | "empty" | "error";
  totalMessages: number;
  newMessages: number;
  channels: TelegramChannelSummary[];
  messages: TelegramMessage[];
  errors: string[];
};

export type ScrapedTelegramMessage = {
  id: string;
  channelId: string;
  channelTitle: string;
  channelUsername?: string | null;
  messageId: number;
  text: string;
  createdAt: string;
  url: string;
};
