import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { wouldCreateCycle } from "../lib/cycle.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthedRequest, res) => {
  const folders = await prisma.folder.findMany({ where: { userId: req.userId! } });
  res.json(folders);
});

router.post("/", async (req: AuthedRequest, res) => {
  const { name, parentId } = req.body as { name: string; parentId: string | null };
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
  if (parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: parentId, userId: req.userId! } });
    if (!parent) return res.status(404).json({ error: "Parent folder not found" });
  }
  const folder = await prisma.folder.create({
    data: { name: name.trim(), parentId: parentId || null, userId: req.userId! },
  });
  res.status(201).json(folder);
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!folder) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.folder.update({ where: { id: folder.id }, data: { name: name.trim() } });
  res.json(updated);
});

router.patch("/:id/move", async (req: AuthedRequest, res) => {
  const { parentId } = req.body as { parentId: string | null };
  const all = await prisma.folder.findMany({ where: { userId: req.userId! } });
  const folder = all.find((f: { id: string }) => f.id === req.params.id);
  if (!folder) return res.status(404).json({ error: "Not found" });
  if (parentId) {
    const target = all.find((f: { id: string }) => f.id === parentId);
    if (!target) return res.status(404).json({ error: "Target folder not found" });
  }
  if (wouldCreateCycle(all, folder.id, parentId || null)) {
    return res.status(400).json({ error: "Cannot move a folder into its own subfolder" });
  }
  const updated = await prisma.folder.update({
    where: { id: folder.id },
    data: { parentId: parentId || null },
  });
  res.json(updated);
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!folder) return res.status(404).json({ error: "Not found" });
  // Children folders and repos reparent to this folder's parent — nothing is orphaned or deleted.
  await prisma.$transaction([
    prisma.folder.updateMany({ where: { parentId: folder.id }, data: { parentId: folder.parentId } }),
    prisma.repository.updateMany({ where: { folderId: folder.id }, data: { folderId: folder.parentId } }),
    prisma.folder.delete({ where: { id: folder.id } }),
  ]);
  res.json({ ok: true });
});

export default router;
