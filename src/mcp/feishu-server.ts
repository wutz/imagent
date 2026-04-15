#!/usr/bin/env node
/**
 * Standalone MCP server providing Feishu tools.
 * Runs as a stdio MCP server — spawned by the claude CLI via --mcp-config.
 *
 * Expects the following environment variables:
 *   FEISHU_APP_ID     — Feishu app ID
 *   FEISHU_APP_SECRET — Feishu app secret
 *   FEISHU_CHAT_ID    — Target chat ID for sending messages
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as lark from '@larksuiteoapi/node-sdk';
import { z } from 'zod';

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
const chatId = process.env.FEISHU_CHAT_ID;

if (!appId || !appSecret || !chatId) {
  process.stderr.write(
    'Missing required env vars: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_CHAT_ID\n',
  );
  process.exit(1);
}

const MAX_MSG_LENGTH = 4000;

const client = new lark.Client({ appId, appSecret });

function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf('\n', maxLength);
    if (breakAt <= 0) breakAt = maxLength;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).replace(/^\n/, '');
  }

  return chunks;
}

async function sendFeishuMessage(text: string, targetChatId: string): Promise<void> {
  const chunks = chunkText(text, MAX_MSG_LENGTH);
  for (const chunk of chunks) {
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: targetChatId,
        msg_type: 'text',
        content: JSON.stringify({ text: chunk }),
      },
    });
  }
}

const server = new McpServer({
  name: 'feishu',
  version: '1.0.0',
});

server.tool(
  'send_message',
  'Send a text message to the current Feishu chat. Use this to proactively send messages or long responses.',
  { text: z.string().describe('The message text to send') },
  async ({ text }) => {
    try {
      await sendFeishuMessage(text, chatId);
      return { content: [{ type: 'text', text: 'Message sent successfully.' }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Failed to send message: ${msg}` }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
