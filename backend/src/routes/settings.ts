import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

router.get("/", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ isPublic: user.isPublic, publicSlug: user.publicSlug });
});

router.patch("/", async (req: AuthedRequest, res) => {
  const { isPublic, publicSlug } = req.body as { isPublic?: boolean; publicSlug?: string };
  const data: { isPublic?: boolean; publicSlug?: string } = {};

  if (typeof isPublic === "boolean") data.isPublic = isPublic;

  if (typeof publicSlug === "string") {
    const slug = slugify(publicSlug);
    if (!slug) return res.status(400).json({ error: "Slug can't be empty" });
    const existing = await prisma.user.findUnique({ where: { publicSlug: slug } });
    if (existing && existing.id !== req.userId) {
      return res.status(409).json({ error: "That link is already taken" });
    }
    data.publicSlug = slug;
  }

  const updated = await prisma.user.update({ where: { id: req.userId! }, data });
  res.json({ isPublic: updated.isPublic, publicSlug: updated.publicSlug });
});

export default router;
