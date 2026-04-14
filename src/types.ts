// Identifies a conversation context on any IM platform
export interface ChatContext {
  platformId: string;
  chatId: string;
  threadId?: string;
  userId: string;
  userName?: string;
}

// A normalized inbound message from any IM platform
export interface IncomingMessage {
  id: string;
  context: ChatContext;
  text: string;
  mentionsBot: boolean;
  isDirectMessage: boolean;
  timestamp: number;
}

// Outbound message to send back to the IM platform
export interface OutgoingMessage {
  context: ChatContext;
  text: string;
  replyToMessageId?: string;
}

// Session state for an ongoing agent conversation
export interface Session {
  id: string;
  agentSessionId?: string;
  context: ChatContext;
  createdAt: number;
  lastActiveAt: number;
  locked: boolean;
}

// Agent response
export interface AgentResponse {
  text: string;
  sessionId: string;
}
