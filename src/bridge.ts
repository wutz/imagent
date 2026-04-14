import type { IMPlatform } from './platforms/platform.js';
import type { AgentProvider } from './agents/agent.js';
import type { ImagentConfig } from './config.js';
import { SessionManager } from './session-manager.js';
import { FeishuPlatform } from './platforms/feishu.js';
import { ClaudeCodeAgent } from './agents/claude-code.js';
import { logger } from './logger.js';

export class Bridge {
  private platform: IMPlatform;
  private agent: AgentProvider;
  private sessions = new SessionManager();

  constructor(private config: ImagentConfig) {
    this.platform = this.createPlatform();
    this.agent = this.createAgent(this.platform);
  }

  async start(): Promise<void> {
    logger.info(`Starting imagent bridge: ${this.config.platform} -> ${this.config.agent}`);

    await this.platform.start(async (msg) => {
      // Only respond to @mentions or direct messages
      if (!msg.mentionsBot && !msg.isDirectMessage) {
        logger.debug(`Ignoring message (no mention, not DM): ${msg.id}`);
        return;
      }

      logger.info(`Received message from ${msg.context.userId} in ${msg.context.chatId}: ${msg.text.slice(0, 80)}`);

      const session = this.sessions.getOrCreate(msg.context);

      // Concurrency guard
      if (!this.sessions.lock(session)) {
        logger.info(`Session ${session.id} is locked, replying with busy message`);
        await this.platform.sendMessage({
          context: msg.context,
          text: 'Still working on the previous message, please wait...',
        }).catch((e) => logger.error('Failed to send busy message', e));
        return;
      }

      try {
        const response = await this.agent.processMessage(
          msg.text,
          session,
          msg.context,
        );

        // Only send response text if it wasn't already sent via MCP tools
        if (response.text && response.text !== '[No response]') {
          await this.platform.sendMessage({
            context: msg.context,
            text: response.text,
          });
        }

        this.sessions.unlock(session, response.sessionId);
        logger.info(`Response sent for session ${session.id}`);
      } catch (err) {
        this.sessions.unlock(session);
        logger.error(`Error processing message in session ${session.id}`, err);
        await this.platform.sendMessage({
          context: msg.context,
          text: 'Sorry, something went wrong processing your message.',
        }).catch((e) => logger.error('Failed to send error message', e));
      }
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info('imagent bridge is running. Press Ctrl+C to stop.');
  }

  async stop(): Promise<void> {
    await this.platform.stop();
    await this.agent.destroy();
    logger.info('Bridge stopped');
  }

  private createPlatform(): IMPlatform {
    switch (this.config.platform) {
      case 'feishu':
        return new FeishuPlatform(this.config.feishu);
      default:
        throw new Error(`Unknown platform: ${this.config.platform}`);
    }
  }

  private createAgent(platform: IMPlatform): AgentProvider {
    switch (this.config.agent) {
      case 'claude-code':
        return new ClaudeCodeAgent(this.config.claudeCode, platform);
      default:
        throw new Error(`Unknown agent: ${this.config.agent}`);
    }
  }
}
