import { tool, createSdkMcpServer } from '@anthropic-ai/claude-code';
import { z } from 'zod';
import type { IMPlatform } from '../platforms/platform.js';
import type { ChatContext } from '../types.js';

export function createFeishuMcpServer(platform: IMPlatform, context: ChatContext) {
  const sendMessageTool = tool(
    'send_message',
    'Send a text message to the current Feishu chat. Use this to proactively send messages or long responses.',
    { text: z.string().describe('The message text to send') },
    async (args) => {
      await platform.sendMessage({
        context,
        text: args.text,
      });
      return { content: [{ type: 'text' as const, text: 'Message sent successfully.' }] };
    },
  );

  return createSdkMcpServer({
    name: 'feishu',
    version: '1.0.0',
    tools: [sendMessageTool],
  });
}
