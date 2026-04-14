import { readFileSync, existsSync } from 'node:fs';
import type { LogLevel } from './logger.js';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

export interface ClaudeCodeConfig {
  model: string;
  maxTurns: number;
  systemPrompt: string;
  cwd: string;
}

export interface ImagentConfig {
  platform: string;
  agent: string;
  feishu: FeishuConfig;
  claudeCode: ClaudeCodeConfig;
  logLevel: LogLevel;
}

const DEFAULTS: ImagentConfig = {
  platform: 'feishu',
  agent: 'claude-code',
  feishu: {
    appId: '',
    appSecret: '',
  },
  claudeCode: {
    model: 'claude-sonnet-4-20250514',
    maxTurns: 30,
    systemPrompt:
      'You are a helpful AI assistant in an IM group chat. ' +
      'Use the feishu MCP tools to send messages when needed. Be concise and helpful.',
    cwd: process.cwd(),
  },
  logLevel: 'info',
};

export function loadConfig(configPath: string, cliOpts: Record<string, string>): ImagentConfig {
  let fileConfig: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (e) {
      throw new Error(`Failed to parse config file ${configPath}: ${e}`);
    }
  }

  const feishuFile = (fileConfig.feishu ?? {}) as Record<string, string>;
  const claudeFile = (fileConfig.claudeCode ?? {}) as Record<string, string>;

  const config: ImagentConfig = {
    platform: (cliOpts.platform ?? fileConfig.platform ?? DEFAULTS.platform) as string,
    agent: (cliOpts.agent ?? fileConfig.agent ?? DEFAULTS.agent) as string,
    feishu: {
      appId: process.env.IMAGENT_FEISHU_APP_ID ?? feishuFile.appId ?? DEFAULTS.feishu.appId,
      appSecret:
        process.env.IMAGENT_FEISHU_APP_SECRET ?? feishuFile.appSecret ?? DEFAULTS.feishu.appSecret,
    },
    claudeCode: {
      model: process.env.IMAGENT_CLAUDE_MODEL ?? claudeFile.model ?? DEFAULTS.claudeCode.model,
      maxTurns: Number(claudeFile.maxTurns ?? DEFAULTS.claudeCode.maxTurns),
      systemPrompt: (claudeFile.systemPrompt ?? DEFAULTS.claudeCode.systemPrompt) as string,
      cwd: (claudeFile.cwd ?? DEFAULTS.claudeCode.cwd) as string,
    },
    logLevel: (process.env.IMAGENT_LOG_LEVEL ?? cliOpts.logLevel ?? fileConfig.logLevel ?? DEFAULTS.logLevel) as LogLevel,
  };

  if (!config.feishu.appId || !config.feishu.appSecret) {
    throw new Error(
      'Feishu appId and appSecret are required. ' +
      'Set IMAGENT_FEISHU_APP_ID and IMAGENT_FEISHU_APP_SECRET environment variables, ' +
      'or provide them in the config file.',
    );
  }

  return config;
}
