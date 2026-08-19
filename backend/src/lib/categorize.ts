// Heuristic keyword-based categorizer. No external API calls, no ML model —
// just a rule table over fields we already have from the GitHub sync. This
// is deliberately the "Tier 1" version: cheap, deterministic, and a natural
// slot to later swap for an embedding-based version without touching callers.
//
// Matching is whole-word (via \b), not substring — "ai" must appear as its
// own token, not as a fragment inside "domain" or "explain". Substring
// matching was tried first and produced false positives on short keywords
// like "ai" and "ml"; word-boundary matching fixes that.

export interface CategoryRule {
  label: string;
  keywords: string[];
}

export const CATEGORY_RULES: CategoryRule[] = [
  {
    label: "AI / ML",
    keywords: [
      "ai", "ml", "machine-learning", "deep-learning", "neural", "llm", "nlp",
      "computer-vision", "tensorflow", "pytorch", "model", "predict", "prediction",
      "dataset", "transformer", "gpt", "embedding", "classifier", "regression",
      "intelligence", "detection", "colorization", "segmentation", "chatbot",
      "chatgpt", "datathon", "context", "memory", "agent", "rag",
    ],
  },
  {
    label: "Data / Analytics",
    keywords: ["analysis", "dashboard", "finance", "stock", "trading", "market", "nifty", "data", "analytics", "report", "visualization"],
  },
  {
    label: "Web",
    keywords: ["web", "react", "next", "website", "frontend", "html", "css", "portfolio", "landing", "vue", "webpage"],
  },
  {
    label: "Backend / API",
    keywords: ["api", "backend", "server", "express", "django", "flask", "microservice", "rest", "graphql"],
  },
  {
    label: "Mobile",
    keywords: ["android", "ios", "flutter", "react-native", "mobile", "kotlin", "swift"],
  },
  {
    label: "DevOps / Automation",
    keywords: ["docker", "kubernetes", "ci-cd", "devops", "terraform", "infra", "pipeline", "automation", "rpa", "monitor", "orchestration", "enterprise"],
  },
  {
    label: "DSA",
    keywords: ["dsa", "algorithm", "leetcode", "dynamic-programming", "graph", "sorting", "data-structure", "backtracking"],
  },
  {
    label: "College",
    keywords: ["college", "university", "semester", "assignment", "coursework", "iot"],
  },
  {
    label: "Productivity / Tools",
    keywords: ["app", "tool", "assistant", "manager", "management", "todo", "tracker", "desk", "helpdesk", "task"],
  },
];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Both the haystack and each keyword get hyphens/underscores normalized to
// spaces before matching, so "delay-intelligence-engine" and "react_client"
// both tokenize the same way a human reads them, and a hyphenated keyword
// like "machine-learning" still matches consistently on either side.
function normalize(s: string) {
  return s.replace(/[-_]/g, " ");
}

// Compiled once at module load, not per-call.
const COMPILED_RULES = CATEGORY_RULES.map((rule) => ({
  label: rule.label,
  patterns: rule.keywords.map((kw) => ({
    kw,
    re: new RegExp(`\\b${escapeRegExp(normalize(kw))}\\b`, "i"),
  })),
}));

export interface CategorySuggestion {
  label: string;
  matchedKeywords: string[];
  confidence: "high" | "medium";
}

export function suggestCategory(input: {
  name: string;
  description: string | null;
  language: string | null;
  topics: string; // comma-separated, as stored
}): CategorySuggestion | null {
  const haystack = normalize(
    [input.name, input.description || "", input.language || "", input.topics.replace(/,/g, " ")].join(" ")
  ).toLowerCase();

  let best: { label: string; hits: string[] } | null = null;

  for (const rule of COMPILED_RULES) {
    const hits = rule.patterns.filter((p) => p.re.test(haystack)).map((p) => p.kw);
    if (hits.length > 0 && (!best || hits.length > best.hits.length)) {
      best = { label: rule.label, hits };
    }
  }

  if (!best) return null;
  return {
    label: best.label,
    matchedKeywords: best.hits,
    confidence: best.hits.length >= 2 ? "high" : "medium",
  };
}
