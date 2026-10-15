/** Public assistant contracts. Provider addresses, models and secrets never enter public status. */
export interface AssistantHistoryTurn { question: string; answer: string; }
export interface AssistantFeedbackDraft { title: string; message: string; category: 'bug'|'suggestion'|'content'|'other'; }
export interface AssistantStatus { name: '小齐'; enabled: boolean; available: boolean; revision: number; limits: {guestDaily: number; accountDaily: number; questionChars: number; historyTurns: number}; }
export interface AssistantChatRequest { requestId: string; question: string; history?: AssistantHistoryTurn[]; visitorToken?: string; }
export interface AssistantChatReply { requestId: string; answer: string; feedbackDraft?: AssistantFeedbackDraft; remaining: number; }
export interface AssistantAdminConfig { revision: number; enabled: boolean; endpoint: string; model: string; keyConfigured: boolean; tested: boolean; guestDaily: number; accountDaily: number; globalDailyTokens: number; }
export interface AssistantAdminUpdate { expectedRevision: number; enabled?: boolean; endpoint?: string; model?: string; apiKey?: string; guestDaily?: number; accountDaily?: number; globalDailyTokens?: number; }
export interface AssistantUsage { day: string; turns: number; tokens: number; approved: number; rejected: number; failed: number; active: number; dailyBudget: number; averageMs: number; }
