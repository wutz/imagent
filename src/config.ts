import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

export interface EvaluatorConfig {
  enabled: boolean;
  model: string;
  apiKey?: string;
}

export interface ImagentConfig {
  platform: string;
  agent: string;
  feishu: FeishuConfig;
  claudeCode: ClaudeCodeConfig;
  evaluator: EvaluatorConfig;
  maxConcurrency: number;
  conversationStorePath: string;
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
    model: 'Claude-Sonnet-4.6',
    maxTurns: 30,
    systemPrompt:
      'You are a helpful AI assistant in an IM group chat. ' +
      'Use the feishu MCP tools to send messages when needed. Be concise and helpful.',
    cwd: process.cwd(),
  },
  evaluator: {
    enabled: true,
    model: 'Claude-Sonnet-4.6',
  },
  maxConcurrency: 10,
  conversationStorePath: join(process.cwd(), '.imagent', 'conversations'),
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
  const evaluatorFile = (fileConfig.evaluator ?? {}) as Record<string, unknown>;

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
    evaluator: {
      enabled: process.env.IMAGENT_EVALUATOR_ENABLED !== undefined
        ? process.env.IMAGENT_EVALUATOR_ENABLED === 'true'
        : (evaluatorFile.enabled as boolean ?? DEFAULTS.evaluator.enabled),
      model: (process.env.IMAGENT_EVALUATOR_MODEL ?? evaluatorFile.model ?? DEFAULTS.evaluator.model) as string,
      apiKey: (process.env.ANTHROPIC_API_KEY ?? evaluatorFile.apiKey) as string | undefined,
    },
    maxConcurrency: Number(
      process.env.IMAGENT_MAX_CONCURRENCY ?? fileConfig.maxConcurrency ?? DEFAULTS.maxConcurrency,
    ),
    conversationStorePath: (
      process.env.IMAGENT_CONVERSATION_STORE_PATH ?? fileConfig.conversationStorePath ?? DEFAULTS.conversationStorePath
    ) as string,
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
