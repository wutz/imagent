import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  userName?: string;
  timestamp: number;
}

export interface ConversationData {
  sessionId: string;
  sessionKey: string;
  agentSessionId?: string;
  messages: ConversationMessage[];
  createdAt: number;
  lastActiveAt: number;
}

/**
 * Persists conversation history to disk as JSON files.
 * Each session gets its own file: <storePath>/<sessionId>.json
 */
export class ConversationStore {
  constructor(private storePath: string) {
    if (!existsSync(storePath)) {
      mkdirSync(storePath, { recursive: true });
    }
  }

  private filePath(sessionId: string): string {
    return join(this.storePath, `${sessionId}.json`);
  }

  save(data: ConversationData): void {
    try {
      writeFileSync(this.filePath(data.sessionId), JSON.stringify(data, null, 2));
    } catch (err) {
      logger.error(`Failed to save conversation ${data.sessionId}`, err);
    }
  }

  load(sessionId: string): ConversationData | null {
    const path = this.filePath(sessionId);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as ConversationData;
    } catch (err) {
      logger.error(`Failed to load conversation ${sessionId}`, err);
      return null;
    }
  }

  /**
   * Find a conversation by its session key (platformId:chatId:threadId).
   * Scans all stored conversations to find a match.
   */
  findByKey(sessionKey: string): ConversationData | null {
    try {
      const files = readdirSync(this.storePath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = JSON.parse(
            readFileSync(join(this.storePath, file), 'utf-8'),
          ) as ConversationData;
          if (data.sessionKey === sessionKey) return data;
        } catch {
          // skip corrupt files
        }
      }
    } catch {
      // store dir doesn't exist or is unreadable
    }
    return null;
  }

  addMessage(sessionId: string, message: ConversationMessage): void {
    const data = this.load(sessionId);
    if (!data) return;
    data.messages.push(message);
    data.lastActiveAt = Date.now();
    this.save(data);
  }

  updateAgentSessionId(sessionId: string, agentSessionId: string): void {
    const data = this.load(sessionId);
    if (!data) return;
    data.agentSessionId = agentSessionId;
    this.save(data);
  }
}
