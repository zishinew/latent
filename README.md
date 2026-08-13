# latent.

A choice-driven, coming-of-age text RPG built with Next.js. A scene director
writes world events, an action referee resolves uncertain attempts, and private
NPC profiles preserve character continuity without exposing information the
player has not learned.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Add a DashScope API key to `.env`. The server uses Qwen's OpenAI-compatible
Chat Completions JSON mode; the key is never sent to the browser.

```dotenv
DASHSCOPE_API_KEY=your-dashscope-key
QWEN_MODEL=qwen3.7-flash
QWEN_SCENE_MODEL=qwen3.7-plus
```

`OPENAI_API_KEY` remains a temporary compatibility alias for deployments that
stored their DashScope key under the previous binding name. New environments
should use `DASHSCOPE_API_KEY`.

If the account uses a workspace-specific Model Studio endpoint, set
`DASHSCOPE_BASE_URL` to its `/compatible-mode/v1` base URL.

## Verification

```bash
npm run lint
npm run test:unit
npm run build
```

The main routes are:

- `/api/judge` — referees and narrates each player action in a single turn
- `/api/exam` — scores the hero high school entrance exam
- `/api/message` — writes persistent NPC phone messages
