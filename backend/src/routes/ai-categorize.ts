import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { fetchReadmeText, fetchRootFileNames } from "../lib/github.js";
import { categorizeRepositoriesWithAI, isAiConfigured, type AiRepoInput } from "../lib/llm.js";
import { suggestCategory } from "../lib/categorize.js";

const router = Router();
router.use(requireAuth);

// Keeps prompt size, GitHub API usage, and Groq token usage predictable per
// run. Groq's free tier has an 8,000 tokens-per-minute limit — 20 repos
// keeps a single scan comfortably under that even with README content
// included. Users with more than this many uncategorized repos just run it
// again a few seconds later.
const BATCH_CAP = 20;

router.get("/status", (_req, res) => {
  res.json({ enabled: isAiConfigured() });
});

router.post("/suggestions", async (req: AuthedRequest, res) => {
  if (!isAiConfigured()) {
    return res.status(503).json({ error: "AI categorization isn't configured on this server" });
  }

  const { includePrivate } = req.body as { includePrivate?: boolean };

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "Not found" });

  // Private repos are excluded unless the caller explicitly opts in — this is
  // the actual safety control, not just a note in a README.
  const repos = await prisma.repository.findMany({
    where: {
      userId: user.id,
      status: "active",
      folderId: null,
      ...(includePrivate ? {} : { private: false }),
    },
    take: BATCH_CAP,
  });

  if (repos.length === 0) {
    return res.json({ folders: [], processed: 0 });
  }

  try {
    // Existing top-level folders — passed to the model so it reuses your
    // taxonomy instead of inventing near-duplicate names each run.
    const existingFolders = await prisma.folder.findMany({
      where: { userId: user.id, parentId: null },
      select: { name: true },
    });

    // Sequential, not parallel — stays comfortably within GitHub's secondary
    // rate limits for a batch this size (2 calls per repo).
    const inputs: AiRepoInput[] = [];
    for (let i = 0; i < repos.length; i++) {
      const r = repos[i];
      const [readme, rootFiles] = await Promise.all([
        fetchReadmeText(user.accessToken, r.fullName),
        fetchRootFileNames(user.accessToken, r.fullName),
      ]);
      inputs.push({
        index: i,
        name: r.name,
        description: r.description,
        language: r.language,
        topics: r.topics,
        readme,
        rootFiles,
      });
    }

    const result = await categorizeRepositoriesWithAI(
      inputs,
      existingFolders.map((f: { name: string }) => f.name)
    );

    const folders = result.folders.map((f) => ({
      folderName: f.name,
      repos: f.repoIndexes
        .filter((idx) => repos[idx])
        .map((idx) => ({ repoId: repos[idx].id, repoName: repos[idx].name })),
    }));

    // Fallback: any repos the AI model missed get categorized by the
    // keyword-based engine instead. This guarantees every repo lands in a
    // folder — the AI handles the nuanced ones, keywords catch the rest.
    const assignedIds = new Set(folders.flatMap((f) => f.repos.map((r) => r.repoId)));
    const stillUnassigned: { repoId: string; repoName: string }[] = [];

    for (const r of repos) {
      if (assignedIds.has(r.id)) continue;

      const keywordResult = suggestCategory({
        name: r.name,
        description: r.description,
        language: r.language,
        topics: r.topics,
      });

      if (keywordResult) {
        // Find or create the folder in our results
        const existingFolder = folders.find(
          (f) => f.folderName.toLowerCase() === keywordResult.label.toLowerCase()
        );
        if (existingFolder) {
          existingFolder.repos.push({ repoId: r.id, repoName: r.name });
        } else {
          folders.push({
            folderName: keywordResult.label,
            repos: [{ repoId: r.id, repoName: r.name }],
          });
        }
      } else {
        // Even keywords couldn't match — truly unassigned
        stillUnassigned.push({ repoId: r.id, repoName: r.name });
      }
    }

    res.json({ folders, unassigned: stillUnassigned, processed: repos.length });
  } catch (err) {
    console.error("AI categorization failed:", err);
    res.status(502).json({ error: err instanceof Error ? err.message : "AI categorization failed" });
  }
});

export default router;

