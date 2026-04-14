import type { Session, ChatContext } from './types.js';

export class SessionManager {
  private sessions = new Map<string, Session>();

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

  lock(session: Session): boolean {
    if (session.locked) return false;
    session.locked = true;
    return true;
  }

  unlock(session: Session, agentSessionId?: string): void {
    session.locked = false;
    session.lastActiveAt = Date.now();
    if (agentSessionId) session.agentSessionId = agentSessionId;
  }
}
