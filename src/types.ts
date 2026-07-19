export type BotMode = 'inactive' | 'keywords' | 'ai' | 'hybrid';

export interface BotConfig {
  token: string;
  mode: BotMode;
  systemInstruction: string;
  isActive: boolean;
  webhookUrl: string;
  webhookStatus: 'connected' | 'error' | 'unconfigured';
  webhookError?: string;
  botUsername?: string;
  botFirstName?: string;
}

export interface KeywordRule {
  id: string;
  pattern: string;
  replyContent: string;
  matchType: 'exact' | 'contains' | 'regex';
  isActive: boolean;
  replyCount: number;
}

export interface AutoReplyLog {
  id: string;
  timestamp: string;
  senderId: number;
  senderName: string;
  senderUsername?: string;
  incomingMessage: string;
  matchedRuleType: 'keyword' | 'ai' | 'none';
  matchedRuleDetails?: string;
  replySent?: string;
  success: boolean;
  error?: string;
}

export interface DailyStat {
  date: string;
  received: number;
  replies: number;
}

export interface BotStats {
  totalReceived: number;
  totalReplies: number;
  keywordMatches: number;
  aiMatches: number;
  failures: number;
  dailyChartData: DailyStat[];
}

export interface DashboardData {
  config: BotConfig;
  rules: KeywordRule[];
  logs: AutoReplyLog[];
  stats: BotStats;
}
