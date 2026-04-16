import type { Session, ChatContext } from './types.js';
import type { ConversationStore } from './conversation-store.js';
import { logger } from './logger.js';

export class SessionManager {
  private sessions = new Map<string, Session>();
  private activeCount = 0;
  private maxConcurrency: number;
  private store: ConversationStore | null;

  constructor(maxConcurrency: number = 10, store: ConversationStore | null = null) {
    this.maxConcurrency = maxConcurrency;
    this.store = store;
  }

  private makeKey(ctx: ChatContext): string {
    return `${ctx.platformId}:${ctx.chatId}:${ctx.threadId ?? 'root'}`;
  }

  getOrCreate(ctx: ChatContext): Session {
    const key = this.makeKey(ctx);
    let session = this.sessions.get(key);
    if (session) return session;

    // Try to restore from disk
    if (this.store) {
      const stored = this.store.findByKey(key);
      if (stored) {
        logger.info(`Restored session ${stored.sessionId} from disk (agent session: ${stored.agentSessionId ?? 'none'})`);
        session = {
          id: stored.sessionId,
          agentSessionId: stored.agentSessionId,
          context: ctx,
          createdAt: stored.createdAt,
          lastActiveAt: stored.lastActiveAt,
          locked: false,
        };
        this.sessions.set(key, session);
        return session;
      }
    }

    // Create new session
    session = {
      id: crypto.randomUUID(),
      context: ctx,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      locked: false,
    };
    this.sessions.set(key, session);

    // Persist new session
    if (this.store) {
      this.store.save({
        sessionId: session.id,
        sessionKey: key,
        messages: [],
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
      });
    }

    return session;
  }

  /**
   * Try to lock a session for processing.
   * Returns 'ok' if locked successfully,
   * 'session_busy' if the session is already processing,
   * 'at_capacity' if the global concurrency limit is reached.
   */
  tryLock(session: Session): 'ok' | 'session_busy' | 'at_capacity' {
    if (session.locked) return 'session_busy';
    if (this.activeCount >= this.maxConcurrency) return 'at_capacity';
    session.locked = true;
    this.activeCount++;
    return 'ok';
  }

  unlock(session: Session, agentSessionId?: string): void {
    if (session.locked) {
      session.locked = false;
      this.activeCount = Math.max(0, this.activeCount - 1);
    }
    session.lastActiveAt = Date.now();
    if (agentSessionId) {
      session.agentSessionId = agentSessionId;
      // Persist the agent session ID so it survives restarts
      if (this.store) {
        this.store.updateAgentSessionId(session.id, agentSessionId);
      }
    }
  }

  getStore(): ConversationStore | null {
    return this.store;
  }

  getActiveCount(): number {
    return this.activeCount;
  }
}
