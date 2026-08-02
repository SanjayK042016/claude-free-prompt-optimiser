# Remote MCP server (Cloudflare Workers)

This is the publicly-connectable version of the Free Prompt Optimizer. It runs
the same rule-based logic as the root [stdio server](../src/index.ts) —
copied into [`src/heuristics.ts`](src/heuristics.ts) — but serves it over
Streamable HTTP from Cloudflare's free edge network so anyone can add it as a
**Connector** in Claude without installing anything.

No auth, no user data, no LLM calls — just deterministic prompt rewriting.

## Live instance

```
https://claude-free-prompt-optimiser.claude-free-prompt-optimiser-worker.workers.dev/mcp
```

## Connect it in Claude

In Claude (claude.ai or Desktop): **Settings → Connectors → Add custom
connector**, paste the URL above, and save. No authentication step needed.

## Deploy your own copy

```bash
cd worker
npm install
npx wrangler login   # opens your browser, authorizes this machine
npm run deploy
```

Wrangler will print your live URL, e.g.:

```
https://claude-free-prompt-optimiser.<your-subdomain>.workers.dev
```

The MCP endpoint is that URL + `/mcp`.

## Local development

```bash
npm run dev   # wrangler dev, served at http://localhost:8788/mcp
```

Test it with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector@latest
```

then connect to `http://localhost:8788/mcp`.
