import type { Session, ChatContext, AgentResponse } from '../types.js';

export interface AgentProvider {
  readonly id: string;
  processMessage(
    userMessage: string,
    session: Session,
    context: ChatContext,
  ): Promise<AgentResponse>;
  destroy(): Promise<void>;
}
