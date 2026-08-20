// In production, force a relative path ("") so requests go to Vercel (which proxies to Render).
// In development, we use VITE_API_URL or default to local backend port 4000.
const API_URL = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "http://localhost:4000");

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Repository {
  id: string;
  githubRepoId: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stars: number;
  private: boolean;
  status: "active" | "missing";
  folderId: string | null;
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  loginUrl: () => `${API_URL}/auth/github`,
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),

  folders: (): Promise<Folder[]> => request("/api/folders"),
  createFolder: (name: string, parentId: string | null): Promise<Folder> =>
    request("/api/folders", { method: "POST", body: JSON.stringify({ name, parentId }) }),
  renameFolder: (id: string, name: string): Promise<Folder> =>
    request(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  moveFolder: (id: string, parentId: string | null): Promise<Folder> =>
    request(`/api/folders/${id}/move`, { method: "PATCH", body: JSON.stringify({ parentId }) }),
  deleteFolder: (id: string) => request(`/api/folders/${id}`, { method: "DELETE" }),

  repositories: (): Promise<Repository[]> => request("/api/repositories"),
  moveRepository: (id: string, folderId: string | null): Promise<Repository> =>
    request(`/api/repositories/${id}/move`, { method: "PATCH", body: JSON.stringify({ folderId }) }),
  removeRepository: (id: string) => request(`/api/repositories/${id}`, { method: "DELETE" }),

  sync: (): Promise<{ created: number; updated: number; missing: number; total: number }> =>
    request("/api/sync", { method: "POST" }),

  // Portfolio mode
  getSettings: (): Promise<{ isPublic: boolean; publicSlug: string | null }> => request("/api/settings"),
  updateSettings: (data: { isPublic?: boolean; publicSlug?: string }) =>
    request("/api/settings", { method: "PATCH", body: JSON.stringify(data) }),
  portfolio: (slug: string): Promise<{
    user: { username: string; avatarUrl: string | null };
    folders: Folder[];
    repositories: (Pick<Repository, "id" | "name" | "description" | "htmlUrl" | "language" | "stars" | "folderId">)[];
  }> => request(`/api/portfolio/${slug}`),

  // Auto-categorization
  suggestions: (): Promise<
    { repoId: string; repoName: string; suggestedFolderName: string; confidence: "high" | "medium"; matchedKeywords: string[] }[]
  > => request("/api/categorize/suggestions"),
  applySuggestions: (items: { repoId: string; folderName: string }[]): Promise<{ applied: number }> =>
    request("/api/categorize/apply", { method: "POST", body: JSON.stringify({ items }) }),

  // Health dashboard
  health: (): Promise<
    {
      id: string;
      name: string;
      folderName: string;
      pushedAt: string | null;
      hasLicense: boolean;
      hasReadme: boolean | null;
      openIssuesCount: number;
      language: string | null;
      htmlUrl: string;
    }[]
  > => request("/api/health"),
  checkReadmes: (): Promise<{ checked: number }> => request("/api/health/check-readmes", { method: "POST" }),

  // AI categorization (Groq)
  aiStatus: (): Promise<{ enabled: boolean }> => request("/api/ai-categorize/status"),
  aiSuggestions: (
    includePrivate: boolean
  ): Promise<{
    folders: { folderName: string; repos: { repoId: string; repoName: string }[] }[];
    unassigned: { repoId: string; repoName: string }[];
    processed: number;
  }> => request("/api/ai-categorize/suggestions", { method: "POST", body: JSON.stringify({ includePrivate }) }),
};

export default api;
