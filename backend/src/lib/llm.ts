// Groq client (OpenAI-compatible chat completions API). This is the only
// file that knows about the AI provider — swapping providers later means
// changing this file, not any route or frontend code that calls it.

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
// Groq periodically retires/renames models — llama-3.3-70b-versatile was
// deprecated after this was first built. gpt-oss-120b is their current
// recommended general-purpose replacement. If this ever 404s again, list
// what's actually available with your key:
//   curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export function isAiConfigured(): boolean {
  return !!GROQ_API_KEY;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wraps the Groq call with retries for two specific, genuinely transient
// failure modes:
//   429 — rate limit. Groq tells us exactly how many seconds to wait
//   (either a Retry-After header or a "try again in Xs" in the error body);
//   we wait that long (plus a small buffer) and retry once.
//   Network-level failures (connection timeout, DNS blip, etc.) — retried
//   with a short fixed delay, since these usually resolve on their own.
// Anything else (bad API key, malformed request) fails immediately —
// retrying those would just waste time on an error that won't change.
async function fetchWithRetry(body: unknown, apiKey: string, attempt = 1): Promise<Response> {
  const MAX_ATTEMPTS = 3;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfterHeader = res.headers.get("retry-after");
      let waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      if (!waitMs || Number.isNaN(waitMs)) {
        const text = await res.clone().text().catch(() => "");
        const match = text.match(/try again in ([\d.]+)s/i);
        waitMs = match ? parseFloat(match[1]) * 1000 : 2000;
      }
      await sleep(waitMs + 300); // small buffer past the boundary
      return fetchWithRetry(body, apiKey, attempt + 1);
    }

    return res;
  } catch (err) {
    // Network-level failure (fetch never got a response at all).
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1500);
      return fetchWithRetry(body, apiKey, attempt + 1);
    }
    throw err;
  }
}

export interface AiRepoInput {
  index: number;
  name: string;
  description: string | null;
  language: string | null;
  topics: string;
  readme: string;
  rootFiles: string[];
}

export interface AiCategorizeResult {
  folders: { name: string; repoIndexes: number[] }[];
}

export async function categorizeRepositoriesWithAI(
  repos: AiRepoInput[],
  existingFolderNames: string[]
): Promise<AiCategorizeResult> {
  if (!GROQ_API_KEY) throw new Error("AI categorization is not configured on this server");
  if (repos.length === 0) return { folders: [] };

  function buildRepoBlocks(repoList: AiRepoInput[]) {
    return repoList
      .map((r) => {
        const readme = r.readme ? r.readme.slice(0, 900) : "(no README)";
        const files = r.rootFiles.length ? r.rootFiles.slice(0, 15).join(", ") : "(empty or unknown)";
        return [
          `#${r.index}`,
          `Name: ${r.name}`,
          `Language: ${r.language || "unknown"}`,
          `Topics: ${r.topics || "none"}`,
          `Description: ${r.description || "none"}`,
          `Root files: ${files}`,
          `README (truncated):`,
          readme,
          "---",
        ].join("\n");
      })
      .join("\n");
  }

  const repoBlocks = buildRepoBlocks(repos);

  const existingFoldersNote =
    existingFolderNames.length > 0
      ? `The user already has these top-level folders: ${existingFolderNames.join(", ")}. If a repo genuinely fits one of these, reuse that EXACT name (same spelling/casing) rather than inventing a similar-sounding new one. Only propose a new folder name when none of the existing ones are a good fit.`
      : `The user has no existing folders yet — propose new folder names freely.`;

  const systemPrompt = `You are a code repository organizer. You are given a list of GitHub repositories, each with an index number, name, description, language, topics, root file listing, and a truncated README.

${existingFoldersNote}

Your job: group these repositories into a small number of sensible top-level folders (aim for 3-8 folders total — fewer if the repos are similar, more only if genuinely needed), based on what each project actually does.

Rules:
- Folder names must be short, human-readable category labels only — e.g. "AI / ML", "Web Apps", "DSA Practice". Never append a number, index, count, or any digit to a folder name.
- CRITICAL: Every repo index from 0 to ${repos.length - 1} must appear in exactly one folder's repoIndexes array. You MUST place ALL ${repos.length} repos. Before you finish, count the total number of indexes across all folders — if it is not exactly ${repos.length}, add the missing indexes. Do NOT leave any repo out.
- Missing READMEs are common and are NOT a reason to skip a repo. When a repo has no README, judge by its name, language, topics, and root file listing instead (e.g. "requirements.txt" or "manage.py" suggests Python/backend; "package.json" suggests JS/web). ALWAYS place the repo somewhere — never skip it.
- A repo that is genuinely unlike the others should get its own folder with just that one repo in it — that is perfectly fine. The goal is that ALL ${repos.length} repos are placed, not that every folder has multiple repos.
- If you are unsure about a repo, place it in the MOST LIKELY folder based on whatever signal you have. An imperfect placement is always better than omitting a repo.
- Base your judgment on the actual content (README, root files), not just the repo name.
- Respond with ONLY a JSON object, no other text, no markdown code fences, matching exactly this shape:
{"folders": [{"name": "Folder Name", "repoIndexes": [0, 2, 5]}]}`;

  const res = await fetchWithRetry(
    {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: repoBlocks },
      ],
      temperature: 0.2,
      reasoning_effort: "medium",
      include_reasoning: false,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    },
    GROQ_API_KEY
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI categorization request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI categorization returned no content");

  let parsed: AiCategorizeResult;
  try {
    // Strip accidental markdown fences in case the model ignores the instruction.
    const cleaned = content.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    parsed = JSON.parse(cleaned) as AiCategorizeResult;
  } catch {
    throw new Error("AI response wasn't valid JSON");
  }

  if (!parsed || !Array.isArray(parsed.folders)) {
    throw new Error("AI response didn't match the expected format");
  }

  // Defensive cleanup: strip any stray trailing number/index the model
  // appended to a folder name.
  parsed.folders = parsed.folders.map((f) => ({
    ...f,
    name: f.name.replace(/\s*[-–—:]?\s*#?\d+\s*$/, "").trim() || f.name,
  }));

  // Second pass: if the model missed any repos, try once more with just
  // the missed repos, telling the model which folders already exist so it
  // slots them in rather than inventing new ones.
  const assignedIndexes = new Set(parsed.folders.flatMap((f) => f.repoIndexes));
  const missedRepos = repos.filter((r) => !assignedIndexes.has(r.index));

  if (missedRepos.length > 0 && missedRepos.length < repos.length) {
    const assignedFolderNames = parsed.folders.map((f) => f.name);
    const allKnownFolders = [...new Set([...existingFolderNames, ...assignedFolderNames])];

    const retryPrompt = `You are a code repository organizer. You have already organized most of a user's repos into these folders: ${allKnownFolders.join(", ")}.

The following ${missedRepos.length} repos were accidentally left out. Place EVERY SINGLE ONE into the most fitting folder from the list above. If none fit well, you may create ONE new folder.

CRITICAL: You MUST place ALL ${missedRepos.length} repos. Every index listed below must appear exactly once in your output.

Respond with ONLY a JSON object:
{"folders": [{"name": "Folder Name", "repoIndexes": [3, 7]}]}`;

    try {
      const retryRes = await fetchWithRetry(
        {
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: retryPrompt },
            { role: "user", content: buildRepoBlocks(missedRepos) },
          ],
          temperature: 0.1,
          reasoning_effort: "medium",
          include_reasoning: false,
          max_tokens: 1024,
          response_format: { type: "json_object" },
        },
        GROQ_API_KEY
      );

      if (retryRes.ok) {
        const retryData = (await retryRes.json()) as { choices?: { message?: { content?: string } }[] };
        const retryContent = retryData.choices?.[0]?.message?.content;
        if (retryContent) {
          const retryCleaned = retryContent.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
          const retryParsed = JSON.parse(retryCleaned) as AiCategorizeResult;
          if (retryParsed && Array.isArray(retryParsed.folders)) {
            for (const retryFolder of retryParsed.folders) {
              const existing = parsed.folders.find(
                (f) => f.name.toLowerCase() === retryFolder.name.toLowerCase()
              );
              if (existing) {
                existing.repoIndexes.push(...retryFolder.repoIndexes);
              } else {
                parsed.folders.push({
                  name: retryFolder.name.replace(/\s*[-–—:]?\s*#?\d+\s*$/, "").trim() || retryFolder.name,
                  repoIndexes: retryFolder.repoIndexes,
                });
              }
            }
          }
        }
      }
    } catch {
      // If the retry fails, we still have the original results — the
      // missed repos will show up as "unassigned" in the frontend, which
      // is better than crashing the whole request.
    }
  }

  return parsed;
}
