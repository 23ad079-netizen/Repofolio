import { Router } from "express";
import { prisma } from "../db.js";
import { exchangeCodeForToken, fetchGithubUser } from "../lib/github.js";
import { signSession, requireAuth, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

// In production, frontend and backend live on different domains (e.g.
// vercel.app + onrender.com), so the cookie needs SameSite=None + Secure to
// be sent cross-site at all. Locally, frontend/backend share localhost and
// there's no HTTPS, so it needs the opposite (Lax, not Secure) or the
// browser drops it entirely.
const isProd = process.env.NODE_ENV === "production";
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  secure: isProd,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

// Step 1: send the user to GitHub's consent screen.
router.get("/github", (_req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID || "",
    redirect_uri: process.env.GITHUB_CALLBACK_URL || "",
    scope: "read:user repo",
    allow_signup: "true",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// Step 2: GitHub redirects back here with a one-time code.
router.get("/github/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).send("Missing authorization code");

  try {
    const accessToken = await exchangeCodeForToken(code);
    const ghUser = await fetchGithubUser(accessToken);

    const user = await prisma.user.upsert({
      where: { githubId: ghUser.id },
      update: { username: ghUser.login, avatarUrl: ghUser.avatar_url, accessToken },
      create: {
        githubId: ghUser.id,
        username: ghUser.login,
        avatarUrl: ghUser.avatar_url,
        accessToken,
      },
    });

    const token = signSession(user.id);
    res.cookie("session", token, sessionCookieOptions);
    res.redirect(process.env.FRONTEND_URL || "http://localhost:5173");
  } catch (err) {
    console.error("GitHub OAuth callback failed:", err);
    res.status(500).send("GitHub authentication failed. Check your backend .env values.");
  }
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ id: user.id, username: user.username, avatarUrl: user.avatarUrl });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("session", sessionCookieOptions);
  res.json({ ok: true });
});

export default router;
