# imagent

Bridge IM platforms to AI agent tools.

Currently supports:
- **IM Platform**: Feishu (飞书/Lark) via WebSocket long connection
- **AI Agent**: Claude Code via Agent SDK with MCP tools

## Architecture

```
Feishu WebSocket → FeishuPlatform (parse events) → Bridge (route + session)
  → ClaudeCodeAgent (query with MCP) → response → FeishuPlatform (send message)
```

- Messages in groups are processed when the bot is @mentioned
- Direct messages are always processed
- Each chat/thread gets its own agent session with conversation context preserved
- Claude Code can send messages back to Feishu via MCP tools

## Setup

### 1. Create a Feishu Bot

1. Go to [Feishu Open Platform](https://open.feishu.cn/) and create an app
2. Enable the Bot capability
3. Subscribe to `im.message.receive_v1` event
4. Set event subscription mode to **Long Connection** (长连接)
5. Add permissions: `im:message`, `im:message:send_as_bot`
6. Get your `App ID` and `App Secret`

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your Feishu credentials
```

Or create `imagent.config.json`:
```json
{
  "feishu": {
    "appId": "your-app-id",
    "appSecret": "your-app-secret"
  }
}
```

### 3. Build & Run

```bash
npm install
npm run build
npm start
```

Or with options:
```bash
node dist/index.js start --config ./imagent.config.json --log-level debug
```

## CLI

```
imagent start [options]

Options:
  -c, --config <path>   Config file path (default: "./imagent.config.json")
  --platform <name>     IM platform (default: "feishu")
  --agent <name>        AI agent (default: "claude-code")
  --log-level <level>   debug | info | warn | error (default: "info")
```

## Configuration

Environment variables (override config file):

| Variable | Description |
|---|---|
| `IMAGENT_FEISHU_APP_ID` | Feishu app ID |
| `IMAGENT_FEISHU_APP_SECRET` | Feishu app secret |
| `IMAGENT_CLAUDE_MODEL` | Claude model ID |
| `IMAGENT_LOG_LEVEL` | Log level |

## Extending

### Add a new IM platform

1. Implement the `IMPlatform` interface in `src/platforms/`
2. Add the platform to the `createPlatform()` switch in `src/bridge.ts`

### Add a new AI agent

1. Implement the `AgentProvider` interface in `src/agents/`
2. Add the agent to the `createAgent()` switch in `src/bridge.ts`

## License

MIT
