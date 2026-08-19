import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { suggestCategory } from "../lib/categorize.js";

const router = Router();
router.use(requireAuth);

// Suggestions only ever consider repos that are active and not yet in a folder
// — this never touches anything the user has already organized.
router.get("/suggestions", async (req: AuthedRequest, res) => {
  const repos = await prisma.repository.findMany({
    where: { userId: req.userId!, status: "active", folderId: null },
  });

  interface Suggestion {
    repoId: string;
    repoName: string;
    suggestedFolderName: string;
    confidence: "high" | "medium";
    matchedKeywords: string[];
  }

  const suggestions: Suggestion[] = [];
  for (const r of repos as (typeof repos)[number][]) {
    const s = suggestCategory({ name: r.name, description: r.description, language: r.language, topics: r.topics });
    if (!s) continue;
    suggestions.push({
      repoId: r.id,
      repoName: r.name,
      suggestedFolderName: s.label,
      confidence: s.confidence,
      matchedKeywords: s.matchedKeywords,
    });
  }

  res.json(suggestions);
});

// Applies a batch of accepted suggestions. For each item, finds or creates a
// top-level folder with the given name for this user, then moves the repo there.
router.post("/apply", async (req: AuthedRequest, res) => {
  const { items } = req.body as { items: { repoId: string; folderName: string }[] };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "No items to apply" });
  }

  const folderCache = new Map<string, string>(); // folderName -> folderId
  let applied = 0;

  for (const item of items) {
    const repo = await prisma.repository.findFirst({ where: { id: item.repoId, userId: req.userId! } });
    if (!repo) continue;

    const cached = folderCache.get(item.folderName);
    let folderId: string;
    if (cached) {
      folderId = cached;
    } else {
      const existing = await prisma.folder.findFirst({
        where: { userId: req.userId!, parentId: null, name: item.folderName },
      });
      const folder =
        existing ||
        (await prisma.folder.create({ data: { name: item.folderName, parentId: null, userId: req.userId! } }));
      folderId = folder.id;
      folderCache.set(item.folderName, folderId);
    }

    await prisma.repository.update({ where: { id: repo.id }, data: { folderId } });
    applied += 1;
  }

  res.json({ applied });
});

export default router;
