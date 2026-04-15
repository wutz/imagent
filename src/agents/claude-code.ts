import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentProvider } from './agent.js';
import type { Session, ChatContext, AgentResponse } from '../types.js';
import type { ClaudeCodeConfig, FeishuConfig } from '../config.js';
import { logger } from '../logger.js';

interface StreamJsonMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  result?: string;
  [key: string]: unknown;
}

export class ClaudeCodeAgent implements AgentProvider {
  readonly id = 'claude-code';
  private tmpDir: string;

  constructor(
    private config: ClaudeCodeConfig,
    private feishuConfig: FeishuConfig,
  ) {
    this.tmpDir = mkdtempSync(join(tmpdir(), 'imagent-'));
  }

  private buildMcpConfig(context: ChatContext): string {
    const mcpServerPath = join(this.config.cwd, 'dist', 'mcp', 'feishu-server.js');
    const config = {
      mcpServers: {
        feishu: {
          command: 'node',
          args: [mcpServerPath],
          env: {
            FEISHU_APP_ID: this.feishuConfig.appId,
            FEISHU_APP_SECRET: this.feishuConfig.appSecret,
            FEISHU_CHAT_ID: context.chatId,
          },
        },
      },
    };

    const configPath = join(this.tmpDir, `mcp-${context.chatId}.json`);
    writeFileSync(configPath, JSON.stringify(config));
    return configPath;
  }

  async processMessage(
    userMessage: string,
    session: Session,
    context: ChatContext,
  ): Promise<AgentResponse> {
    const mcpConfigPath = this.buildMcpConfig(context);

    logger.debug(`Processing message in session ${session.id}, agent session: ${session.agentSessionId ?? 'new'}`);

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--model', this.config.model,
      '--mcp-config', mcpConfigPath,
      '--strict-mcp-config',
      '--allowedTools', 'mcp__feishu__*',
      '--permission-mode', 'bypassPermissions',
      '--system-prompt', this.config.systemPrompt,
    ];

    if (this.config.maxTurns > 0) {
      args.push('--max-turns', String(this.config.maxTurns));
    }

    if (session.agentSessionId) {
      args.push('--resume', session.agentSessionId);
    }

    args.push(userMessage);

    return new Promise<AgentResponse>((resolve, reject) => {
      const claude = spawn('claude', args, {
        cwd: this.config.cwd,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let resultText = '';
      let sessionId = '';

      claude.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();

        // Parse stream-json: each line is a JSON message
        const lines = stdout.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        stdout = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed) as StreamJsonMessage;

            if (msg.session_id) {
              sessionId = msg.session_id;
            }

            if (msg.type === 'result') {
              if (msg.subtype === 'success') {
                resultText = (msg.result as string) ?? '';
              } else {
                logger.warn(`Agent session ended with: ${msg.subtype}`);
                resultText = `[Agent stopped: ${msg.subtype}]`;
              }
              if (msg.session_id) sessionId = msg.session_id;
            }
          } catch {
            // Not valid JSON, skip
          }
        }
      });

      claude.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      claude.on('close', (code) => {
        // Process any remaining data in buffer
        if (stdout.trim()) {
          try {
            const msg = JSON.parse(stdout.trim()) as StreamJsonMessage;
            if (msg.session_id) sessionId = msg.session_id;
            if (msg.type === 'result') {
              if (msg.subtype === 'success') {
                resultText = (msg.result as string) ?? '';
              } else {
                resultText = `[Agent stopped: ${msg.subtype}]`;
              }
              if (msg.session_id) sessionId = msg.session_id;
            }
          } catch {
            // ignore
          }
        }

        if (code !== 0 && !resultText) {
          logger.error(`Claude CLI exited with code ${code}. stderr: ${stderr}`);
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }

        if (stderr) {
          logger.debug(`Claude CLI stderr: ${stderr}`);
        }

        resolve({ text: resultText || '[No response]', sessionId });
      });

      claude.on('error', (err) => {
        logger.error('Failed to spawn Claude CLI', err);
        reject(err);
      });

      // Close stdin since we pass prompt as argument
      claude.stdin.end();
    });
  }

  async destroy(): Promise<void> {
    try {
      for (const f of readdirSync(this.tmpDir)) {
        unlinkSync(join(this.tmpDir, f));
      }
      rmdirSync(this.tmpDir);
    } catch {
      // Best effort cleanup
    }
  }
}
