import type { IMPlatform } from './platforms/platform.js';
import type { AgentProvider } from './agents/agent.js';
import type { ChatContext } from './types.js';
import type { ImagentConfig } from './config.js';
import { SessionManager } from './session-manager.js';
import { MessageEvaluator } from './evaluator.js';
import { FeishuPlatform } from './platforms/feishu.js';
import { ClaudeCodeAgent } from './agents/claude-code.js';
import { logger } from './logger.js';

export class Bridge {
  private platform: IMPlatform;
  private agent: AgentProvider;
  private sessions: SessionManager;
  private evaluator: MessageEvaluator | null = null;

  constructor(private config: ImagentConfig) {
    this.platform = this.createPlatform();
    this.agent = this.createAgent(this.platform);
    this.sessions = new SessionManager(config.maxConcurrency);

    if (config.evaluator.enabled) {
      this.evaluator = new MessageEvaluator(config.evaluator);
      logger.info('Message evaluator enabled — non-@mention messages will be evaluated for relevance');
      if (!config.evaluator.apiKey && !process.env.ANTHROPIC_AUTH_TOKEN) {
        logger.warn('Evaluator enabled but ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN not set — evaluator may fail at runtime');
      }
    }

    logger.info(`Max concurrency: ${config.maxConcurrency}`);
  }

  async start(): Promise<void> {
    logger.info(`Starting imagent bridge: ${this.config.platform} -> ${this.config.agent}`);

    await this.platform.start(async (msg) => {
      // DMs and @mentions always get processed
      if (msg.isDirectMessage || msg.mentionsBot) {
        logger.info(`Received message from ${msg.context.userId} in ${msg.context.chatId}: ${msg.text.slice(0, 80)}`);
        await this.handleMessage(msg.text, msg.context);
        return;
      }

      // Non-@mention group message: evaluate relevance if evaluator is enabled
      if (this.evaluator) {
        logger.debug(`Evaluating non-mention message: ${msg.text.slice(0, 80)}`);
        const shouldRespond = await this.evaluator.shouldRespond(msg.text);
        if (shouldRespond) {
          logger.info(`Evaluator approved message from ${msg.context.userId}: ${msg.text.slice(0, 80)}`);
          await this.handleMessage(msg.text, msg.context);
        } else {
          logger.debug(`Evaluator skipped message: ${msg.id}`);
        }
        return;
      }

      // No evaluator, skip non-@mention messages
      logger.debug(`Ignoring message (no mention, not DM): ${msg.id}`);
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

  private async handleMessage(text: string, context: ChatContext): Promise<void> {
    const session = this.sessions.getOrCreate(context);

    const lockResult = this.sessions.tryLock(session);

    if (lockResult === 'session_busy') {
      logger.info(`Session ${session.id} is locked, replying with busy message`);
      await this.platform.sendMessage({
        context,
        text: '正在处理上一条消息，请稍等...',
      }).catch((e) => logger.error('Failed to send busy message', e));
      return;
    }

    if (lockResult === 'at_capacity') {
      logger.info(`Global concurrency limit reached (${this.sessions.getActiveCount()}), replying with capacity message`);
      await this.platform.sendMessage({
        context,
        text: '当前处理请求较多，请稍等...',
      }).catch((e) => logger.error('Failed to send capacity message', e));
      return;
    }

    try {
      const response = await this.agent.processMessage(text, session, context);

      // Only send response text if it wasn't already sent via MCP tools
      if (response.text && response.text !== '[No response]') {
        await this.platform.sendMessage({
          context,
          text: response.text,
        });
      }

      this.sessions.unlock(session, response.sessionId);
      logger.info(`Response sent for session ${session.id} (active: ${this.sessions.getActiveCount()})`);
    } catch (err) {
      this.sessions.unlock(session);
      logger.error(`Error processing message in session ${session.id}`, err);
      await this.platform.sendMessage({
        context,
        text: 'Sorry, something went wrong processing your message.',
      }).catch((e) => logger.error('Failed to send error message', e));
    }
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
