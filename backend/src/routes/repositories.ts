import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthedRequest, res) => {
  const repos = await prisma.repository.findMany({
    where: { userId: req.userId! },
    orderBy: { name: "asc" },
  });
  res.json(repos);
});

router.patch("/:id/move", async (req: AuthedRequest, res) => {
  const { folderId } = req.body as { folderId: string | null };
  const repo = await prisma.repository.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!repo) return res.status(404).json({ error: "Not found" });
  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, userId: req.userId! } });
    if (!folder) return res.status(404).json({ error: "Target folder not found" });
  }
  const updated = await prisma.repository.update({
    where: { id: repo.id },
    data: { folderId: folderId || null },
  });
  res.json(updated);
});

// Only removes the local record (e.g. a repo GitHub says is gone) — never touches GitHub.
router.delete("/:id", async (req: AuthedRequest, res) => {
  const repo = await prisma.repository.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!repo) return res.status(404).json({ error: "Not found" });
  await prisma.repository.delete({ where: { id: repo.id } });
  res.json({ ok: true });
});

export default router;
