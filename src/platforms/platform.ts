import type { IncomingMessage, OutgoingMessage } from '../types.js';

export interface IMPlatform {
  readonly id: string;
  start(onMessage: (msg: IncomingMessage) => void): Promise<void>;
  sendMessage(msg: OutgoingMessage): Promise<void>;
  stop(): Promise<void>;
}
