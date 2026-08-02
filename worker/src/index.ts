import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { optimizePrompt, analyzePrompt } from "./heuristics.js";

function createServer() {
	const server = new McpServer({
		name: "free-prompt-optimizer",
		version: "0.1.0",
	});

	server.registerTool(
		"optimize_prompt",
		{
			title: "Optimize Prompt",
			description:
				"Rewrites a prompt using rule-based prompt-engineering best practices (role, context, output format, examples, step-by-step reasoning for complex tasks). Runs entirely locally with no API calls, so it costs no extra credits.",
			inputSchema: z.object({
				prompt: z.string().min(1).describe("The raw prompt you want optimized."),
				style: z
					.enum(["xml", "markdown"])
					.optional()
					.describe("Output structure style. 'xml' (default) matches Claude's recommended tag format; 'markdown' uses headings."),
				addThinkingStep: z
					.boolean()
					.optional()
					.describe("Force-include (or exclude) a step-by-step reasoning section. If omitted, it's auto-detected from task complexity."),
			}),
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
			};
		},
	);

	server.registerTool(
		"analyze_prompt",
		{
			title: "Analyze Prompt",
			description:
				"Diagnoses weaknesses in a prompt (missing role, context, output format, examples, success criteria, bundled instructions, vague language) without rewriting it. Runs entirely locally, no API calls.",
			inputSchema: z.object({
				prompt: z.string().min(1).describe("The prompt to diagnose."),
			}),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ prompt }) => {
			const issues = analyzePrompt(prompt);
			const text =
				issues.length === 0
					? "No issues detected — this prompt already covers role/context, output format, and success criteria well."
					: issues.map((i) => `- [${i.severity}] ${i.message}`).join("\n");
			return { content: [{ type: "text", text }] };
		},
	);

	return server;
}

const handler = createMcpHandler(createServer);

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
