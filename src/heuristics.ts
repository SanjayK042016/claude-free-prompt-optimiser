/**
 * Rule-based prompt optimization engine.
 *
 * No network calls, no LLM calls, no API keys — every check and rewrite here
 * is plain string/regex logic, so this runs free and instantly for anyone
 * who connects the MCP server.
 *
 * The checks and the resulting XML-tag structure follow Anthropic's public
 * prompt engineering guidance (be clear & direct, add context, use examples,
 * specify output format, use structural tags, invite step-by-step reasoning
 * for complex tasks).
 */

export interface Issue {
  id: string;
  severity: "high" | "medium" | "low";
  message: string;
}

export interface OptimizeOptions {
  style?: "xml" | "markdown";
  addThinkingStep?: boolean;
}

export interface OptimizeResult {
  optimizedPrompt: string;
  issuesFound: Issue[];
  improvementsApplied: string[];
  wordCount: { original: number; optimized: number };
}

const VAGUE_WORDS = [
  "good", "nice", "better", "some", "stuff", "things", "etc", "appropriate",
  "a lot", "several", "various", "properly", "correctly", "well",
];

const ROLE_RE = /\b(you are|act as|as an? [\w-]+ (expert|assistant|engineer|writer|analyst)|your role is)\b/i;
const OUTPUT_FORMAT_RE = /\b(json|markdown|bullet|bulleted|table|csv|xml|paragraph|word count|words?\b.*\blimit|format|numbered list|yaml)\b/i;
const EXAMPLE_RE = /\b(example|e\.g\.|for instance|for example|sample input|sample output)\b/i;
const SUCCESS_CRITERIA_RE = /\b(must|should|requirement|criteria|make sure|ensure that)\b/i;
const AUDIENCE_RE = /\b(audience|reader|readers?|for (a |an )?\w+ (user|customer|beginner|developer|executive|student))\b/i;
const NEGATIVE_RE = /\b(don't|do not|avoid|never)\b/i;
const CONTEXT_MARKER_RE = /\b(context|background|here is|here's|given the following|attached|the following (text|data|document))\b/i;

const IMPERATIVE_STARTERS = [
  "write", "create", "generate", "list", "explain", "summarize", "analyze",
  "build", "design", "draft", "compare", "translate", "fix", "review",
  "optimize", "refactor", "convert", "extract", "classify", "rewrite",
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countImperativeClauses(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const verb of IMPERATIVE_STARTERS) {
    const re = new RegExp(`(^|[.!?]\\s+|\\band\\s+|,\\s*)${verb}\\b`, "gi");
    const matches = lower.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

export function analyzePrompt(prompt: string): Issue[] {
  const issues: Issue[] = [];
  const trimmed = prompt.trim();
  const wordCount = countWords(trimmed);

  if (wordCount < 8) {
    issues.push({
      id: "too_short",
      severity: "high",
      message: "Prompt is very short and likely underspecified — the model has to guess at scope, format, and constraints.",
    });
  }

  if (!ROLE_RE.test(trimmed)) {
    issues.push({
      id: "no_role",
      severity: "low",
      message: "No persona/role is set (e.g. \"You are a senior copy editor\"). A role can anchor tone and expertise level.",
    });
  }

  if (!OUTPUT_FORMAT_RE.test(trimmed)) {
    issues.push({
      id: "no_output_format",
      severity: "high",
      message: "No output format is specified (length, structure, JSON/markdown/list, etc.) — the model will pick one for you.",
    });
  }

  if (!EXAMPLE_RE.test(trimmed)) {
    issues.push({
      id: "no_examples",
      severity: "medium",
      message: "No examples given. One good input/output example usually improves consistency more than extra instructions.",
    });
  }

  const vagueHits = VAGUE_WORDS.filter((w) =>
    new RegExp(`\\b${w}\\b`, "i").test(trimmed)
  );
  if (vagueHits.length > 0) {
    issues.push({
      id: "vague_language",
      severity: "medium",
      message: `Vague/subjective wording found (${vagueHits.slice(0, 5).join(", ")}) — replace with concrete, measurable criteria.`,
    });
  }

  if (!SUCCESS_CRITERIA_RE.test(trimmed)) {
    issues.push({
      id: "no_success_criteria",
      severity: "medium",
      message: "No explicit success criteria or must-haves — hard for the model to know when the output is \"done\".",
    });
  }

  if (!AUDIENCE_RE.test(trimmed)) {
    issues.push({
      id: "no_audience",
      severity: "low",
      message: "No target audience specified — tone and technical depth are left to guesswork.",
    });
  }

  if (NEGATIVE_RE.test(trimmed) && !SUCCESS_CRITERIA_RE.test(trimmed)) {
    issues.push({
      id: "negative_only",
      severity: "low",
      message: "Prompt says what NOT to do but doesn't say what TO do instead — pair negative constraints with a positive instruction.",
    });
  }

  const imperativeClauses = countImperativeClauses(trimmed);
  if (imperativeClauses >= 3) {
    issues.push({
      id: "multiple_unstructured_asks",
      severity: "high",
      message: `Looks like ${imperativeClauses} separate instructions are bundled into one unstructured request — split into a numbered list so none get dropped.`,
    });
  }

  if (wordCount > 250) {
    issues.push({
      id: "too_long",
      severity: "low",
      message: "Prompt is long and possibly rambling — consider trimming to the essential instruction plus structured context.",
    });
  }

  const hasPastedContent = /["“][^"”]{80,}["”]/.test(trimmed) || wordCount > 120;
  if (hasPastedContent && !CONTEXT_MARKER_RE.test(trimmed)) {
    issues.push({
      id: "no_context_delimiters",
      severity: "medium",
      message: "Long or pasted content isn't clearly separated from the instruction — wrap reference material in its own tagged section.",
    });
  }

  return issues;
}

/**
 * Which structural gaps can legitimately live "elsewhere" in an agentic
 * system — e.g. role/format/audience defined once in a system prompt, not
 * repeated in every per-turn task prompt. Letting a caller declare these
 * avoids false positives when analyzing a task prompt in isolation.
 */
export const ELSEWHERE_CONCERNS = ["role", "audience", "output_format", "success_criteria", "examples"] as const;
export type ElsewhereConcern = (typeof ELSEWHERE_CONCERNS)[number];

const ELSEWHERE_TO_ISSUE_ID: Record<ElsewhereConcern, string> = {
  role: "no_role",
  audience: "no_audience",
  output_format: "no_output_format",
  success_criteria: "no_success_criteria",
  examples: "no_examples",
};

const SEVERITY_PENALTY: Record<Issue["severity"], number> = { high: 25, medium: 12, low: 5 };

export interface ValidateOptions {
  /** Concerns already guaranteed by a system prompt or other layer — suppressed instead of flagged. */
  assumeDefinedElsewhere?: ElsewhereConcern[];
  /** Minimum score (0-100) to count as `passed`. Defaults to 70. */
  passThreshold?: number;
}

export interface ValidateResult {
  passed: boolean;
  score: number;
  issues: Issue[];
  /** The assumeDefinedElsewhere entries that actually suppressed a would-be issue. */
  assumedElsewhere: ElsewhereConcern[];
}

/**
 * Machine-facing variant of analyzePrompt for agentic pipelines: returns a
 * structured pass/fail + numeric score instead of prose, and accepts
 * `assumeDefinedElsewhere` so a caller can say "role/format are already
 * fixed by my system prompt, don't flag them for this per-turn prompt."
 */
export function validatePrompt(rawPrompt: string, options: ValidateOptions = {}): ValidateResult {
  const threshold = options.passThreshold ?? 70;
  const assumed = options.assumeDefinedElsewhere ?? [];
  const suppressedIds = new Set(assumed.map((c) => ELSEWHERE_TO_ISSUE_ID[c]));

  const allIssues = analyzePrompt(rawPrompt);
  const issues = allIssues.filter((i) => !suppressedIds.has(i.id));
  const assumedElsewhere = assumed.filter((c) => allIssues.some((i) => i.id === ELSEWHERE_TO_ISSUE_ID[c]));

  const penalty = issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0);
  const score = Math.max(0, 100 - penalty);

  return { passed: score >= threshold, score, issues, assumedElsewhere };
}

function stripFluff(text: string): string {
  return text
    .trim()
    .replace(/^(please\s+|kindly\s+|i (want|need|would like) you to\s+)/i, "")
    .replace(/\s+/g, " ");
}

function isComplexTask(prompt: string, issues: Issue[]): boolean {
  const wordCount = countWords(prompt);
  const hasMultipleAsks = issues.some((i) => i.id === "multiple_unstructured_asks");
  const analyticalVerbs = /\b(analyze|compare|evaluate|debug|diagnose|design|plan|reason|decide|prioriti[sz]e)\b/i;
  return hasMultipleAsks || wordCount > 60 || analyticalVerbs.test(prompt);
}

export function optimizePrompt(rawPrompt: string, options: OptimizeOptions = {}): OptimizeResult {
  const style = options.style ?? "xml";
  const prompt = rawPrompt.trim();
  if (!prompt) {
    return {
      optimizedPrompt: "",
      issuesFound: [{ id: "empty", severity: "high", message: "Prompt is empty." }],
      improvementsApplied: [],
      wordCount: { original: 0, optimized: 0 },
    };
  }

  const issues = analyzePrompt(prompt);
  const has = (id: string) => issues.some((i) => i.id === id);
  const improvementsApplied: string[] = [];

  const coreTask = stripFluff(prompt);
  const wantThinking = options.addThinkingStep ?? isComplexTask(prompt, issues);

  const sections: { tag: string; content: string }[] = [];

  sections.push({ tag: "task", content: coreTask });
  improvementsApplied.push("Isolated the core instruction into its own section, stripped of filler phrases.");

  if (has("no_context_delimiters") || countWords(prompt) > 120) {
    sections.push({
      tag: "context",
      content: "[SPECIFY: any background info, prior attempts, or reference material the model needs — paste it here, separated from the instruction above.]",
    });
    improvementsApplied.push("Added a dedicated context section so background material won't be conflated with the instruction.");
  }

  if (has("no_audience") || has("no_role")) {
    sections.push({
      tag: "role_and_audience",
      content: "[SPECIFY: who should the model act as (e.g. \"senior backend engineer\"), and who is the output for?]",
    });
    improvementsApplied.push("Added a role/audience placeholder to anchor tone and expertise level.");
  }

  if (has("multiple_unstructured_asks")) {
    const clauses = coreTask
      .split(/(?:,|\band\b|\.|\bthen\b)/i)
      .map((c) => c.trim())
      .filter((c) => c.length > 3);
    sections[0] = {
      tag: "task",
      content:
        "Complete the following steps, in order:\n" +
        clauses.map((c, i) => `${i + 1}. ${c.charAt(0).toUpperCase() + c.slice(1)}`).join("\n"),
    };
    improvementsApplied.push("Split the bundled instructions into a numbered list so each ask is tracked separately.");
  }

  sections.push({
    tag: "requirements",
    content: [
      has("no_success_criteria")
        ? "- [SPECIFY: what must be true for this output to count as correct/complete?]"
        : "- (success criteria already implied in the task above — consider making them a checklist)",
      has("negative_only")
        ? "- [SPECIFY: the positive instruction to pair with each \"don't\"/\"avoid\" in the original prompt.]"
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  improvementsApplied.push("Added an explicit requirements/success-criteria section.");

  sections.push({
    tag: "output_format",
    content: has("no_output_format")
      ? "[SPECIFY: format (prose / bullet list / table / JSON / code), approximate length, and any structural constraints.]"
      : "(format already specified in the task — keep it, and consider stating an approximate length too.)",
  });
  improvementsApplied.push("Added an output-format section — the single highest-leverage fix for inconsistent responses.");

  if (has("no_examples")) {
    sections.push({
      tag: "example",
      content: "[OPTIONAL BUT RECOMMENDED: paste one example input/output pair here — this typically improves consistency more than any other change.]",
    });
    improvementsApplied.push("Added an example slot (few-shot prompting).");
  }

  if (wantThinking) {
    sections.push({
      tag: "thinking",
      content: "Before answering, work through the problem step by step inside this section, then give the final answer in <answer> tags.",
    });
    improvementsApplied.push("Added a step-by-step reasoning instruction — this task looks multi-step or analytical.");
  }

  let optimizedPrompt: string;
  if (style === "markdown") {
    optimizedPrompt = sections
      .map((s) => `## ${s.tag.replace(/_/g, " ")}\n${s.content}`)
      .join("\n\n");
  } else {
    optimizedPrompt = sections.map((s) => `<${s.tag}>\n${s.content}\n</${s.tag}>`).join("\n\n");
  }

  return {
    optimizedPrompt,
    issuesFound: issues,
    improvementsApplied,
    wordCount: { original: countWords(prompt), optimized: countWords(optimizedPrompt) },
  };
}
