import type { Session, ChatContext } from './types.js';

export class SessionManager {
  private sessions = new Map<string, Session>();
  private activeCount = 0;
  private maxConcurrency: number;

  constructor(maxConcurrency: number = 10) {
    this.maxConcurrency = maxConcurrency;
  }

  private makeKey(ctx: ChatContext): string {
    return `${ctx.platformId}:${ctx.chatId}:${ctx.threadId ?? 'root'}`;
  }

  getOrCreate(ctx: ChatContext): Session {
    const key = this.makeKey(ctx);
    let session = this.sessions.get(key);
    if (!session) {
      session = {
        id: crypto.randomUUID(),
        context: ctx,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        locked: false,
      };
      this.sessions.set(key, session);
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
    if (agentSessionId) session.agentSessionId = agentSessionId;
  }

  getActiveCount(): number {
    return this.activeCount;
  }
}
