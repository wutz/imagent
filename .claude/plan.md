# imagent Implementation Plan

## Overview
Build a TypeScript CLI tool `imagent` that bridges IM platforms (starting with Feishu) to AI agent tools (starting with Claude Code via Agent SDK). The tool connects to Feishu via WebSocket, listens for messages, and uses Claude Code Agent SDK to process and respond.

## Project Structure
```
src/
├── index.ts                 # CLI entry point (commander)
├── config.ts                # Config loading (env + JSON file)
├── types.ts                 # Core interfaces & shared types
├── bridge.ts                # Orchestrator: wires platform → agent
├── session-manager.ts       # Maps chat/thread → agent session
├── logger.ts                # Simple leveled logger
├── platforms/
│   ├── platform.ts          # IMPlatform interface
│   └── feishu.ts            # Feishu WebSocket implementation
├── agents/
│   ├── agent.ts             # AgentProvider interface
│   └── claude-code.ts       # Claude Code Agent SDK implementation
└── mcp/
    └── feishu-tools.ts      # MCP tools for Claude to interact with Feishu
```

## Key Dependencies
- `@anthropic-ai/claude-code` - Claude Code Agent SDK
- `@larksuiteoapi/node-sdk` - Feishu SDK (WebSocket + REST)
- `commander` - CLI framework
- `zod` - Schema validation (required by Agent SDK MCP tools)

## Message Flow
```
Feishu WSClient → feishu.ts (parse event) → bridge.ts (filter + route)
  → session-manager.ts (get/create session, lock)
  → claude-code.ts (query with MCP tools) → collect response
  → bridge.ts → feishu.ts (send message back)
```

## Implementation Order
1. `package.json`, `tsconfig.json`, `.env.example` - Project setup
2. `src/types.ts` - Core interfaces
3. `src/config.ts` - Config loading
4. `src/logger.ts` - Simple logger
5. `src/platforms/platform.ts` - IMPlatform interface
6. `src/platforms/feishu.ts` - Feishu implementation
7. `src/session-manager.ts` - Session management
8. `src/agents/agent.ts` - AgentProvider interface
9. `src/mcp/feishu-tools.ts` - MCP tools
10. `src/agents/claude-code.ts` - Claude Code implementation
11. `src/bridge.ts` - Orchestrator
12. `src/index.ts` - CLI entry point

## Key Design Decisions
- **WebSocket (long connection)** for Feishu events - no public server needed
- **In-memory sessions** for MVP - restart starts fresh conversations
- **Session locking** - one agent call per chat at a time
- **MCP tools** for Claude to send messages back to Feishu (send_message, get_chat_history)
- **Session resume** via Agent SDK's `resume` option with stored session_id
- **permissionMode: "bypassPermissions"** for unattended bot operation
- **Message chunking** for long responses (Feishu text limit)
