import { query } from '@anthropic-ai/claude-code';
import { execSync } from 'node:child_process';
import type { AgentProvider } from './agent.js';
import type { IMPlatform } from '../platforms/platform.js';
import type { Session, ChatContext, AgentResponse } from '../types.js';
import type { ClaudeCodeConfig } from '../config.js';
import { createFeishuMcpServer } from '../mcp/feishu-tools.js';
import { logger } from '../logger.js';

function findClaudeExecutable(): string | undefined {
  try {
    const path = execSync('which claude', { encoding: 'utf-8' }).trim();
    if (path) {
      logger.debug(`Found global claude CLI at: ${path}`);
      return path;
    }
  } catch {
    // not found
  }
  return undefined;
}

export class ClaudeCodeAgent implements AgentProvider {
  readonly id = 'claude-code';
  private claudePath: string | undefined;

  constructor(
    private config: ClaudeCodeConfig,
    private platform: IMPlatform,
  ) {
    this.claudePath = findClaudeExecutable();
  }

  async processMessage(
    userMessage: string,
    session: Session,
    context: ChatContext,
  ): Promise<AgentResponse> {
    const mcpServer = createFeishuMcpServer(this.platform, context);

    logger.debug(`Processing message in session ${session.id}, agent session: ${session.agentSessionId ?? 'new'}`);

    const q = query({
      prompt: userMessage,
      options: {
        model: this.config.model,
        customSystemPrompt: this.config.systemPrompt,
        maxTurns: this.config.maxTurns,
        cwd: this.config.cwd,
        permissionMode: 'bypassPermissions',
        mcpServers: { feishu: mcpServer },
        allowedTools: ['mcp__feishu__*'],
        ...(this.claudePath ? { pathToClaudeCodeExecutable: this.claudePath } : {}),
        ...(session.agentSessionId ? { resume: session.agentSessionId } : {}),
      },
    });

    let resultText = '';
    let sessionId = '';

    try {
      for await (const message of q) {
        // Capture session_id from any message
        if ('session_id' in message && message.session_id) {
          sessionId = message.session_id;
        }

        if (message.type === 'result') {
          if (message.subtype === 'success') {
            resultText = message.result;
          } else {
            logger.warn(`Agent session ended with: ${message.subtype}`);
            resultText = `[Agent stopped: ${message.subtype}]`;
          }
          sessionId = message.session_id;
        }
      }
    } catch (e) {
      logger.error('Error during Claude Code query', e);
      throw e;
    }

    return { text: resultText || '[No response]', sessionId };
  }

  async destroy(): Promise<void> {
    // No persistent resources to clean up
  }
}
