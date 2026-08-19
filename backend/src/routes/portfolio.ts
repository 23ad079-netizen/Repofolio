import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

// Public, unauthenticated — deliberately has no mutation endpoints and
// never returns accessToken or any other private field.
router.get("/:slug", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { publicSlug: req.params.slug } });
  if (!user || !user.isPublic) {
    return res.status(404).json({ error: "This portfolio doesn't exist or isn't public" });
  }

  const [folders, repositories] = await Promise.all([
    prisma.folder.findMany({ where: { userId: user.id }, select: { id: true, name: true, parentId: true } }),
    prisma.repository.findMany({
      where: { userId: user.id, status: "active", private: false },
      select: {
        id: true,
        name: true,
        description: true,
        htmlUrl: true,
        language: true,
        stars: true,
        folderId: true,
      },
    }),
  ]);

  res.json({
    user: { username: user.username, avatarUrl: user.avatarUrl },
    folders,
    repositories,
  });
});

export default router;
