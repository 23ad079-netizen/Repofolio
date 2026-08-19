// Thin wrapper around the GitHub REST API. Only ever called from the
// backend — the access token never reaches the browser.

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(data.error_description || "GitHub token exchange failed");
  }
  return data.access_token;
}

export async function fetchGithubUser(accessToken: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "repofolio-app",
    },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub user");
  return res.json() as Promise<{ id: number; login: string; avatar_url: string }>;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  private: boolean;
  pushed_at: string | null;
  open_issues_count: number;
  license: { key: string; name: string } | null;
}

// Cheap existence check — a HEAD-style GET against the readme endpoint.
// 200 = has a README, 404 = doesn't. Only called when the user explicitly
// asks for a health check, never during a normal sync, to keep API usage predictable.
export async function checkReadmeExists(accessToken: string, fullName: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "repofolio-app" },
  });
  return res.status === 200;
}

export async function fetchAllRepos(accessToken: string): Promise<GithubRepo[]> {
  const all: GithubRepo[] = [];
  let page = 1;
  // Safety cap at 2000 repos (20 pages x 100) so a runaway account can't loop forever.
  while (page <= 20) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,collaborator&sort=updated`,
      { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "repofolio-app" } }
    );
    if (!res.ok) throw new Error("Failed to fetch repositories from GitHub");
    const data = (await res.json()) as GithubRepo[];
    all.push(...data);
    if (data.length < 100) break;
    page += 1;
  }
  return all;
}

// Full README text (not just existence) — used for AI categorization context.
// Returns "" on any failure (missing README, private-repo edge cases) rather
// than throwing, since a missing README is a normal, expected case here.
export async function fetchReadmeText(accessToken: string, fullName: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "repofolio-app",
      Accept: "application/vnd.github.raw+json",
    },
  });
  if (!res.ok) return "";
  return res.text();
}

// Root-level file/folder names only (e.g. "package.json", "src", "requirements.txt")
// — strong signal for categorization without pulling any file's actual contents.
export async function fetchRootFileNames(accessToken: string, fullName: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${fullName}/contents`, {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "repofolio-app" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data.map((item) => (item as { name?: string }).name).filter((n): n is string => !!n);
}
