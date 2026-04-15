import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger.js';

export interface EvaluatorConfig {
  enabled: boolean;
  model: string;
  apiKey?: string;
}

const RELEVANCE_PROMPT = `You are a message filter for an AI assistant bot in a group chat.
Determine if the following message should trigger the bot to respond.

Respond with ONLY "yes" or "no".

Respond "yes" if:
- The message asks a question that an AI assistant could answer
- The message requests help, advice, or technical support
- The message discusses a topic where the bot could add value
- The message is a follow-up to a conversation the bot was part of

Respond "no" if:
- The message is casual chat between humans (greetings, small talk, jokes)
- The message is an internal team discussion not seeking AI input
- The message is just an emoji reaction, sticker, or very short acknowledgment
- The message is clearly directed at a specific person (not the bot)

Message:
`;

export class MessageEvaluator {
  private client: Anthropic;
  private model: string;

  constructor(config: EvaluatorConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_AUTH_TOKEN || undefined,
      baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    });
    this.model = config.model;
  }

  async shouldRespond(messageText: string): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8,
        messages: [
          { role: 'user', content: RELEVANCE_PROMPT + messageText },
        ],
      });

      const answer = response.content[0];
      if (answer.type === 'text') {
        const result = answer.text.trim().toLowerCase().startsWith('yes');
        logger.debug(`Evaluator: "${messageText.slice(0, 60)}" -> ${result ? 'respond' : 'skip'}`);
        return result;
      }
      return false;
    } catch (e) {
      logger.error('Evaluator failed, defaulting to skip', e);
      return false;
    }
  }
}
