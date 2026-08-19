import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { checkReadmeExists } from "../lib/github.js";

const router = Router();
router.use(requireAuth);

// Aggregated view — everything here already lives in the DB from the last
// sync (pushedAt, hasLicense, openIssuesCount come free from /user/repos).
// hasReadme is the one field that needs a separate opt-in check (see below).
router.get("/", async (req: AuthedRequest, res) => {
  const repos = await prisma.repository.findMany({
    where: { userId: req.userId!, status: "active" },
    include: { folder: { select: { name: true } } },
    orderBy: { pushedAt: "asc" },
  });

  res.json(
    repos.map((r: (typeof repos)[number]) => ({
      id: r.id,
      name: r.name,
      folderName: r.folder?.name ?? "Uncategorized",
      pushedAt: r.pushedAt,
      hasLicense: r.hasLicense,
      hasReadme: r.hasReadme,
      openIssuesCount: r.openIssuesCount,
      language: r.language,
      htmlUrl: r.htmlUrl,
    }))
  );
});

// Explicit, user-triggered only — this is one GitHub API call per repo, so
// it's never run automatically during a normal sync (would burn through the
// rate limit fast on a large account).
router.post("/check-readmes", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const repos = await prisma.repository.findMany({
    where: { userId: user.id, status: "active" },
    take: 100, // safety cap per click, matching the GitHub API page size
  });

  let checked = 0;
  for (const r of repos) {
    const hasReadme = await checkReadmeExists(user.accessToken, r.fullName);
    await prisma.repository.update({
      where: { id: r.id },
      data: { hasReadme, readmeCheckedAt: new Date() },
    });
    checked += 1;
  }

  res.json({ checked });
});

export default router;
