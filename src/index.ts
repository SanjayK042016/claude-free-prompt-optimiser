#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { optimizePrompt, analyzePrompt, validatePrompt, ELSEWHERE_CONCERNS } from "./heuristics.js";

const server = new McpServer({
  name: "free-prompt-optimizer",
  version: "0.1.0",
});

const issueSchema = z.object({
  id: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  message: z.string(),
});

server.registerTool(
  "optimize_prompt",
  {
    title: "Optimize Prompt",
    description:
      "Rewrites a prompt using rule-based prompt-engineering best practices (role, context, output format, examples, step-by-step reasoning for complex tasks). Runs entirely locally with no API calls, so it costs no extra credits. Returns structuredContent for programmatic/agentic callers in addition to human-readable text.",
    inputSchema: {
      prompt: z.string().min(1).describe("The raw prompt you want optimized."),
      style: z
        .enum(["xml", "markdown"])
        .optional()
        .describe("Output structure style. 'xml' (default) matches Claude's recommended tag format; 'markdown' uses headings."),
      addThinkingStep: z
        .boolean()
        .optional()
        .describe("Force-include (or exclude) a step-by-step reasoning section. If omitted, it's auto-detected from task complexity."),
    },
    outputSchema: {
      optimizedPrompt: z.string(),
      issuesFound: z.array(issueSchema),
      improvementsApplied: z.array(z.string()),
      wordCount: z.object({ original: z.number(), optimized: z.number() }),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ prompt, style, addThinkingStep }) => {
    const result = optimizePrompt(prompt, { style, addThinkingStep });
    const lines = [
      "## Optimized Prompt",
      "",
      "```",
      result.optimizedPrompt,
      "```",
      "",
      `## Issues found in the original (${result.issuesFound.length})`,
      ...result.issuesFound.map((i) => `- [${i.severity}] ${i.message}`),
      "",
      "## Improvements applied",
      ...result.improvementsApplied.map((s) => `- ${s}`),
      "",
      `Word count: ${result.wordCount.original} → ${result.wordCount.optimized}`,
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { ...result },
    };
  }
);

server.registerTool(
  "analyze_prompt",
  {
    title: "Analyze Prompt",
    description:
      "Diagnoses weaknesses in a prompt (missing role, context, output format, examples, success criteria, bundled instructions, vague language) without rewriting it. Returns a structured pass/fail + numeric score in structuredContent, so an agentic caller can gate on it programmatically instead of parsing prose. Pass assumeDefinedElsewhere for concerns (role, audience, output_format, success_criteria, examples) that are already guaranteed by a system prompt or other layer, so this per-turn prompt isn't false-flagged for not repeating them. Runs entirely locally, no API calls.",
    inputSchema: {
      prompt: z.string().min(1).describe("The prompt to diagnose."),
      assumeDefinedElsewhere: z
        .array(z.enum(ELSEWHERE_CONCERNS))
        .optional()
        .describe("Concerns already guaranteed elsewhere (e.g. by a system prompt) and therefore not flagged here."),
      passThreshold: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Minimum score (0-100) to count as passed. Defaults to 70."),
    },
    outputSchema: {
      passed: z.boolean(),
      score: z.number(),
      issues: z.array(issueSchema),
      assumedElsewhere: z.array(z.string()),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ prompt, assumeDefinedElsewhere, passThreshold }) => {
    const result = validatePrompt(prompt, { assumeDefinedElsewhere, passThreshold });
    const text = [
      `${result.passed ? "✅ PASSED" : "❌ FAILED"} — score ${result.score}/100`,
      ...(result.assumedElsewhere.length ? [`(suppressed, assumed defined elsewhere: ${result.assumedElsewhere.join(", ")})`] : []),
      "",
      result.issues.length === 0
        ? "No issues detected — this prompt already covers role/context, output format, and success criteria well."
        : result.issues.map((i) => `- [${i.severity}] ${i.message}`).join("\n"),
    ].join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { ...result },
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting free-prompt-optimizer-mcp:", err);
  process.exit(1);
});
