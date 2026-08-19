import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { fetchAllRepos } from "../lib/github.js";

const router = Router();
router.use(requireAuth);

// Pulls the user's current repo list from GitHub and reconciles it against
// our DB. New repos land in Uncategorized (folderId: null). Repos that no
// longer exist on GitHub are marked "missing", never silently deleted —
// that would lose the user's folder placement for no reason.
router.post("/", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const ghRepos = await fetchAllRepos(user.accessToken);
  const seenIds = new Set<number>();
  let created = 0;
  let updated = 0;

  for (const r of ghRepos) {
    seenIds.add(r.id);
    const existing = await prisma.repository.findUnique({
      where: { userId_githubRepoId: { userId: user.id, githubRepoId: r.id } },
    });
    const shared = {
      name: r.name,
      fullName: r.full_name,
      htmlUrl: r.html_url,
      description: r.description,
      language: r.language,
      topics: (r.topics || []).join(","),
      stars: r.stargazers_count,
      private: r.private,
      pushedAt: r.pushed_at ? new Date(r.pushed_at) : null,
      openIssuesCount: r.open_issues_count,
      hasLicense: !!r.license,
    };

    if (existing) {
      await prisma.repository.update({
        where: { id: existing.id },
        data: { ...shared, status: "active", lastSyncedAt: new Date() },
      });
      updated += 1;
    } else {
      await prisma.repository.create({
        data: { ...shared, userId: user.id, githubRepoId: r.id, folderId: null, status: "active" },
      });
      created += 1;
    }
  }

  const existingRepos = await prisma.repository.findMany({ where: { userId: user.id } });
  const missing = existingRepos.filter(
    (r: { githubRepoId: number; status: string }) => !seenIds.has(r.githubRepoId) && r.status !== "missing"
  );
  for (const m of missing) {
    await prisma.repository.update({ where: { id: m.id }, data: { status: "missing" } });
  }

  res.json({ created, updated, missing: missing.length, total: ghRepos.length });
});

export default router;
