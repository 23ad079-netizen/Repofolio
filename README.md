# Repofolio

Organize your GitHub repositories into unlimited nested folders — like a normal
file explorer. Nothing on GitHub itself is ever touched: your repos stay exactly
where they are, and this app just keeps a private "which folder is this repo in"
map in its own database.

### 🔗 [Try it live → repofolio-sigma.vercel.app](https://repofolio-sigma.vercel.app)

```
Browser (React)  <-->  Backend (Express)  <-->  GitHub API
                             |
                             v
                         Postgres (Neon)
                     (folders, repos, users)
```

## What's in here

- `backend/` — Express + TypeScript API. Handles GitHub OAuth, syncs your repo
  list from GitHub, and stores your folder structure in a database via Prisma.
- `frontend/` — React + TypeScript + Tailwind app. The actual explorer UI:
  sidebar folder tree, drag-and-drop, right-click menus, search, breadcrumbs.

Both were type-checked and build-tested while I put this together, so you
shouldn't hit compile errors — the one step I genuinely can't test for you is
the live GitHub OAuth round-trip, since that needs real credentials tied to
your GitHub account.

---

## Step 1 — Register a GitHub OAuth App

This is the one manual step only you can do.

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - **Application name**: `Repofolio (local)` (anything you want)
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:4000/auth/github/callback`
3. Click **Register application**
4. Copy the **Client ID**, then click **Generate a new client secret** and copy
   that too — you won't be able to see the secret again later.

## Step 2 — Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in the two values from Step 1:

```
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
JWT_SECRET=any_long_random_string_you_make_up
DATABASE_URL=postgresql://user:password@host/dbname
```

Create the database and start the API:

```bash
npx prisma migrate dev --name init
npm run dev
```

You should see `Repofolio API listening on :4000`. Leave this running.

## Step 3 — Frontend setup

Open a **second terminal**:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

You should see Vite print a local URL — `http://localhost:5173`. Leave this
running too.

## Step 4 — Test it, step by step

1. **Open** `http://localhost:5173` — you should see the "Continue with GitHub"
   login screen.
2. **Click "Continue with GitHub"** — you're sent to GitHub's real consent
   screen, showing exactly what this app is asking for (read your profile,
   read your repos).
3. **Authorize it.** GitHub redirects you back and you land in the Explorer,
   empty, on the "All repositories" (Uncategorized) view.
4. **Click "Sync from GitHub"** in the sidebar. This pulls your actual repo
   list from GitHub's API and drops every repo into Uncategorized. A toast
   confirms how many were created/updated.
5. **Create a folder**: click "New folder", name it, confirm it appears in the
   sidebar and as a card in the main panel.
6. **Create a nested folder**: open that folder, click "New folder" again —
   confirm it nests under the first one in the sidebar tree.
7. **Drag a repo card** from the grid onto a folder (either in the sidebar or
   another folder card) — confirm it moves and the toast confirms the
   destination.
8. **Drag a folder into its own child** on purpose — confirm you get the
   "Can't move a folder into its own subfolder" toast and nothing changes.
   This is the cycle-prevention check.
9. **Right-click a folder** → Rename, and a repo → **Open on GitHub** (confirm
   it opens the real repo page in a new tab — proof this app reads real data).
10. **Right-click a folder with repos in it → Delete folder** — confirm the
    repos reappear one level up (its parent), not vanished. Check both
    "Uncategorized" (if it was a top-level folder) and the new **"All
    repositories"** flat view in the sidebar — that view lists every repo
    regardless of folder and is the reliable way to confirm nothing got lost.
11. **Search** for part of a repo name in the top-right box — confirm it shows
    the full folder path for each match.
12. **Refresh the page** (`F5`) — confirm you're still logged in and your
    folder structure is still there. This is the real persistence check: it's
    coming from the database now, not from memory.
13. **Log out** (bottom-left), then go to GitHub → **Settings → Applications →
    Authorized OAuth Apps** and confirm "Repofolio (local)" is listed
    there — that's GitHub's own record that access was actually granted, not
    faked.
14. **Log back in** — your folders and repo placement should still be exactly
    as you left them.

If any step doesn't behave as described, that's a real bug to fix — tell me
which step and what happened.

## Step 5 — Test the three new features

These build on everything above — make sure you've already synced some repos
(Step 4) before testing these.

### Portfolio mode

1. Click **"Share portfolio"** in the sidebar.
2. Toggle **"Make my portfolio public"** on, set a link slug (e.g. your name),
   click **Save**. A shareable link appears — copy it.
3. Open that link (`http://localhost:5173/portfolio/your-slug`) in a new
   **incognito/private window** — this confirms it's really public and
   doesn't rely on your login cookie.
4. Confirm: you see your folder structure, but with no drag-and-drop, no
   right-click menu, no "New folder" button — read-only, as intended.
5. If you have any **private** repos organized into a folder, confirm they do
   **not** appear on the portfolio page — only public repos should show.
6. Back in the main app, toggle "Make my portfolio public" off, save, and
   confirm the link now returns "This portfolio doesn't exist or isn't public."

### Auto-categorization

1. Move a few repos back to Uncategorized first (right-click → "Remove from
   folder") so there's something for it to suggest on.
2. Click **"Suggest organization"** in the sidebar.
3. Confirm repos are grouped by suggested category (e.g. "AI / ML", "DSA")
   with a confidence badge (`high` / `medium`) and are pre-checked.
4. Uncheck one repo you disagree with, then click **"Apply N suggestions."**
5. Confirm: the unchecked repo stayed in Uncategorized, the rest moved into
   newly created (or matched) top-level folders.
6. Click "Suggest organization" again — confirm the repos you just placed no
   longer show up (suggestions only ever consider Uncategorized repos).

### Repository health

1. Click **"Repository health"** in the sidebar.
2. Confirm the table lists every active repo with last-commit time, license,
   and open issue count — these came from your last sync, no extra API calls.
3. Click **"Check READMEs"** — this makes one GitHub API call per repo, so
   give it a few seconds on a larger account. Confirm the README column
   updates from "not checked" to "yes"/"missing".
4. Toggle **"Stale 90+ days"** and **"Missing README"** filters, confirm the
   table narrows correctly. Try the sort dropdown on a couple of columns.
5. Click a repo name — confirm it opens the real GitHub page in a new tab.

### AI organize (optional — Groq)

1. Get a free API key at https://console.groq.com
2. Add to `backend/.env`:
   ```
   GROQ_API_KEY=your_key_here
   GROQ_MODEL=openai/gpt-oss-120b
   ```
   (If this 404s with `model_not_found`, Groq has likely changed their lineup
   again — list what's actually available to your key:
   `curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer YOUR_KEY"`,
   then update `GROQ_MODEL` to a valid id from that response.)
3. Restart the backend (`npm run dev`). The **"AI organize"** button in the
   sidebar goes from greyed-out to clickable — that's the `enabled` flag from
   `GET /api/ai-categorize/status` flipping to true.
4. Click **"AI organize"**. Leave "Include private repos" unchecked for a
   first test, click **Run AI scan**.
5. Confirm: it reads each Uncategorized repo's README + root file listing
   (not full source), proposes folders — reusing your existing folder names
   where they fit — and shows them grouped with editable folder-name inputs.
6. Try dragging a repo from one proposed folder to another, and dragging one
   out of the "not confident" list into a folder — confirm it moves in the
   preview. Edit one folder name, uncheck one repo, click **Apply** — confirm
   only what's checked moved, under the names you actually set.
7. Confirm nothing was sent to GitHub — this only ever moves repos between
   your local folders, same as the other two organizing features.

**On safety, concretely:**
- The Groq API key lives only in `backend/.env`, read server-side, never
  returned in any API response or sent to the frontend.
- Private repos are excluded from every AI scan unless you explicitly check
  "Include private repos" for that run.
- Only metadata + README text + a root file-name listing is sent to Groq —
  never actual file contents, never your GitHub access token.
- Nothing is applied anywhere until you review the suggestions and click Apply.

## Notes on how it actually stays "safe"

- The OAuth scope requested is `read:user repo` — enough to list your repos
  and read metadata. Nothing in this codebase calls a GitHub endpoint that
  creates, modifies, or deletes anything on your account.
- Your GitHub access token is stored server-side only (in the database), never
  sent to the browser. The browser only ever holds a signed session cookie for
  *this app*, not your GitHub token.
- Moving a repo between folders is a single `folderId` update in this app's
  own database — it never calls any GitHub write endpoint.
- If a repo is deleted on GitHub, the next sync marks it "missing" here rather
  than silently deleting your organizational record of it — you choose when to
  remove it from the Explorer.
