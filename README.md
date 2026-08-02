# Free Prompt Optimizer (MCP)

An [MCP](https://modelcontextprotocol.io) server that rewrites your prompts
using rule-based prompt-engineering best practices — role/audience, context
separation, explicit output format, examples, success criteria, and
step-by-step reasoning for complex tasks.

**It is genuinely free.** There are no LLM calls, no API keys, and no network
requests anywhere in this server — it's pure local string/regex logic. Connect
it once and use it as much as you want with zero extra API credits.

## Tools

- **`optimize_prompt`** — takes a raw prompt, returns a restructured version
  plus a list of what was weak in the original and what was changed.
- **`analyze_prompt`** — diagnostics only, no rewrite. Useful if you just want
  a checklist of what's missing.

## Install

```bash
git clone https://github.com/<your-username>/free-prompt-optimizer-mcp.git
cd free-prompt-optimizer-mcp
npm install
npm run build
```

## Connect to Claude Code

Add to your MCP config (e.g. via `claude mcp add`, or directly in your
`.claude.json` / `mcp_servers` config):

```json
{
  "mcpServers": {
    "free-prompt-optimizer": {
      "command": "node",
      "args": ["/absolute/path/to/free-prompt-optimizer-mcp/dist/index.js"]
    }
  }
}
```

Or, once published to npm, run it without cloning:

```json
{
  "mcpServers": {
    "free-prompt-optimizer": {
      "command": "npx",
      "args": ["-y", "free-prompt-optimizer-mcp"]
    }
  }
}
```

## Connect to Claude Desktop

Add the same block to your `claude_desktop_config.json` under `mcpServers`,
then restart Claude Desktop.

## How the rewrite works

The optimizer checks the prompt for common gaps (missing role, missing output
format, missing examples, vague language, bundled multi-step asks, missing
success criteria, negative-only constraints) and restructures it into tagged
sections (`<task>`, `<context>`, `<output_format>`, etc.) that Claude's own
prompting guide recommends. Anything it can't infer — like your actual
audience or desired format — is left as an explicit `[SPECIFY: ...]`
placeholder so you fill in the real answer instead of getting a guess.

## Development

```bash
npm run dev    # tsc --watch
npm run build  # one-off compile to dist/
npm start      # run the compiled server over stdio
```

## License

MIT
