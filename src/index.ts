#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { setLogLevel } from './logger.js';
import type { LogLevel } from './logger.js';
import { Bridge } from './bridge.js';

const program = new Command();

program
  .name('imagent')
  .description('Bridge IM platforms to AI agent tools')
  .version('0.1.0');

program
  .command('start')
  .description('Start the IM-to-agent bridge')
  .option('-c, --config <path>', 'config file path', './imagent.config.json')
  .option('--platform <name>', 'IM platform (feishu)', 'feishu')
  .option('--agent <name>', 'AI agent provider (claude-code)', 'claude-code')
  .option('--log-level <level>', 'log level (debug|info|warn|error)', 'info')
  .action(async (opts: Record<string, string>) => {
    try {
      setLogLevel(opts.logLevel as LogLevel);
      const config = loadConfig(opts.config, opts);
      setLogLevel(config.logLevel);

      const bridge = new Bridge(config);
      await bridge.start();
    } catch (err) {
      console.error('Fatal error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
