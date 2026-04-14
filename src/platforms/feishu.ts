import * as lark from '@larksuiteoapi/node-sdk';
import type { IMPlatform } from './platform.js';
import type { IncomingMessage, OutgoingMessage } from '../types.js';
import type { FeishuConfig } from '../config.js';
import { logger } from '../logger.js';

// Max characters per Feishu text message
const MAX_MSG_LENGTH = 4000;

// Feishu event data structures (loosely typed since the SDK uses `any` internally)
interface FeishuMessageEvent {
  message?: {
    message_id?: string;
    chat_id?: string;
    chat_type?: string;
    message_type?: string;
    content?: string;
    root_id?: string;
    create_time?: string;
    mentions?: Array<{
      key?: string;
      id?: { open_id?: string; union_id?: string };
      name?: string;
    }>;
  };
  sender?: {
    sender_id?: { open_id?: string; union_id?: string; user_id?: string };
    sender_type?: string;
  };
}

export class FeishuPlatform implements IMPlatform {
  readonly id = 'feishu';
  private client: InstanceType<typeof lark.Client>;
  private wsClient: InstanceType<typeof lark.WSClient> | null = null;

  constructor(private config: FeishuConfig) {
    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
    });
  }

  async start(onMessage: (msg: IncomingMessage) => void): Promise<void> {
    logger.info('Starting Feishu platform...');

    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: unknown) => {
        try {
          const msg = this.parseEvent(data as FeishuMessageEvent);
          if (msg) onMessage(msg);
        } catch (e) {
          logger.error('Error parsing Feishu event', e);
        }
      },
    });

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info,
    });

    await this.wsClient.start({ eventDispatcher });
    logger.info('Feishu WebSocket connection established');
  }

  async sendMessage(msg: OutgoingMessage): Promise<void> {
    const chunks = this.chunkText(msg.text, MAX_MSG_LENGTH);

    for (const chunk of chunks) {
      try {
        await this.client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: msg.context.chatId,
            msg_type: 'text',
            content: JSON.stringify({ text: chunk }),
          },
        });
      } catch (e) {
        logger.error('Failed to send Feishu message', e);
        throw e;
      }
    }
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    logger.info('Feishu platform stopped');
  }

  private parseEvent(data: FeishuMessageEvent): IncomingMessage | null {
    const { message, sender } = data;
    if (!message || !sender) return null;

    if (message.message_type !== 'text') {
      logger.debug(`Ignoring non-text message type: ${message.message_type}`);
      return null;
    }

    const chatId = message.chat_id;
    const messageId = message.message_id;
    if (!chatId || !messageId) return null;

    const isDirectMessage = message.chat_type === 'p2p';

    // Parse text content - Feishu wraps it in JSON: {"text": "@_user_1 hello"}
    let text = '';
    try {
      const content = JSON.parse(message.content ?? '{}') as Record<string, string>;
      text = content.text ?? '';
    } catch {
      logger.warn('Failed to parse message content');
      return null;
    }

    // Detect @bot mention: if there are mentions in a group chat, the bot was likely mentioned
    // (Feishu only delivers group messages to the bot when it's @mentioned, unless
    // the app has im:message permission for all messages)
    const mentions = message.mentions;
    const mentionsBot = isDirectMessage || (Array.isArray(mentions) && mentions.length > 0);

    // Strip @mention placeholders from text (e.g., @_user_1)
    text = text.replace(/@_user_\d+/g, '').trim();

    if (!text) return null;

    const senderId = sender.sender_id?.open_id ?? 'unknown';
    const threadId = message.root_id || undefined;

    return {
      id: messageId,
      context: {
        platformId: this.id,
        chatId,
        threadId,
        userId: senderId,
      },
      text,
      mentionsBot,
      isDirectMessage,
      timestamp: Number(message.create_time ?? Date.now()),
    };
  }

  private chunkText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to break at a newline
      let breakAt = remaining.lastIndexOf('\n', maxLength);
      if (breakAt <= 0) breakAt = maxLength;

      chunks.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).replace(/^\n/, '');
    }

    return chunks;
  }
}
