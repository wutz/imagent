import type { Session, ChatContext, AgentResponse } from '../types.js';
import type { ConversationMessage } from '../conversation-store.js';

export interface AgentProvider {
  readonly id: string;
  processMessage(
    userMessage: string,
    session: Session,
    context: ChatContext,
    conversationHistory?: ConversationMessage[],
  ): Promise<AgentResponse>;
  destroy(): Promise<void>;
}
