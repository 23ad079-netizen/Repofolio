import { useEffect, useRef, useState } from "react";
import { Folder as FolderIcon, Package, ExternalLink, Star, FolderOpen } from "lucide-react";
import api, { type Folder } from "../api";
import { folderTabColor } from "../lib/folderTabColor";

type PortfolioRepo = {
  id: string;
  name: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  stars: number;
  folderId: string | null;
};

export default function Portfolio({ slug }: { slug: string }) {
  const [data, setData] = useState<{ user: { username: string; avatarUrl: string | null }; folders: Folder[]; repositories: PortfolioRepo[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    api
      .portfolio(slug)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this portfolio"));
  }, [slug]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-paper text-ink-on-paper">
        <p className="text-sm">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <div className="flex h-screen items-center justify-center bg-paper text-sm text-ink-on-paper/50">Loading…</div>;
  }

  const byParent: Record<string, Folder[]> = {};
  data.folders.forEach((f) => {
    const key = f.parentId ?? "root";
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(f);
  });
  const reposByFolder: Record<string, PortfolioRepo[]> = {};
  data.repositories.forEach((r) => {
    const key = r.folderId ?? "root";
    if (!reposByFolder[key]) reposByFolder[key] = [];
    reposByFolder[key].push(r);
  });

  // Track sequential index for stagger animations
  let sectionIndex = 0;
  const shouldAnimate = !hasAnimated.current;

  function renderFolder(folder: Folder, depth: number) {
    const children = byParent[folder.id] || [];
    const repos = reposByFolder[folder.id] || [];
    if (children.length === 0 && repos.length === 0) return null;
    const thisSectionIndex = sectionIndex++;
    const tabColor = folderTabColor(folder.name);
    return (
      <div
        key={folder.id}
        style={{
          marginLeft: depth * 24,
          ...(shouldAnimate ? { animationDelay: `${thisSectionIndex * 60}ms` } : {}),
        }}
        className={`mb-8 ${shouldAnimate ? "portfolio-stagger-enter" : ""}`}
      >
        <div className="mb-3 flex items-center gap-2.5 border-b border-rule pb-2">
          <span
            className="inline-block w-[3px] self-stretch rounded-full shrink-0"
            style={{ backgroundColor: tabColor }}
          />
          <FolderOpen size={16} className="text-accent shrink-0" />
          <span className="text-sm font-medium text-ink-on-paper">{folder.name}</span>
          <span className="font-mono text-[11px] text-ink-on-paper/40 ml-auto">
            {repos.length} item{repos.length === 1 ? "" : "s"}
          </span>
        </div>
        {repos.length > 0 && (
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {repos.map((r, i) => (
              <RepoCard key={r.id} repo={r} entryNumber={i + 1} />
            ))}
          </div>
        )}
        {children.map((c) => renderFolder(c, depth + 1))}
      </div>
    );
  }

  const rootRepos = reposByFolder["root"] || [];
  const rootFolders = byParent["root"] || [];

  // Mark that we've animated on this render
  if (shouldAnimate) {
    // Use requestAnimationFrame so the flag is set after the animation classes are applied
    requestAnimationFrame(() => {
      hasAnimated.current = true;
    });
  }

  return (
    <div className="min-h-screen bg-paper px-6 py-10 text-ink-on-paper">
      <div className="mx-auto max-w-3xl">
        {/* Header — editorial moment with Fraunces */}
        <div className="mb-10 flex items-center gap-4">
          {data.user.avatarUrl && <img src={data.user.avatarUrl} alt="" className="h-14 w-14 rounded-full ring-2 ring-rule" />}
          <div>
            <h1 className="font-voice text-2xl font-semibold text-ink-on-paper">{data.user.username}</h1>
            <p className="text-sm text-ink-on-paper/50">Repositories, organized</p>
          </div>
        </div>

        {rootRepos.length > 0 && (
          <div
            className={`mb-8 ${shouldAnimate ? "portfolio-stagger-enter" : ""}`}
            style={shouldAnimate ? { animationDelay: `${sectionIndex++ * 60}ms` } : {}}
          >
            <div className="mb-3 flex items-center gap-2 border-b border-rule pb-2">
              <Package size={14} className="text-ink-on-paper/40" />
              <span className="text-sm font-medium text-ink-on-paper/70">Uncategorized</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {rootRepos.map((r, i) => (
                <RepoCard key={r.id} repo={r} entryNumber={i + 1} />
              ))}
            </div>
          </div>
        )}
        {rootFolders.map((f) => renderFolder(f, 0))}

        {rootRepos.length === 0 && rootFolders.length === 0 && (
          <div className="flex flex-col items-center py-16 text-ink-on-paper/40">
            <FolderIcon size={28} className="mb-2 opacity-40" />
            <p className="text-sm">Nothing to show yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RepoCard({ repo, entryNumber }: { repo: PortfolioRepo; entryNumber: number }) {
  return (
    <a
      href={repo.htmlUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex flex-col gap-1.5 rounded border border-rule bg-paper-raised px-3 py-2.5 transition-colors duration-150 hover:border-accent/40"
    >
      {/* Entry number — sequential position within the folder */}
      <span className="absolute top-2 right-2.5 font-mono text-[10px] text-ink-on-paper/20">
        {String(entryNumber).padStart(3, "0")}
      </span>
      <div className="flex items-center justify-between gap-2 pr-6">
        <span className="flex items-center gap-2 truncate text-sm font-mono font-medium text-ink-on-paper">
          {repo.name}
        </span>
        <ExternalLink size={12} className="shrink-0 text-ink-on-paper/25" />
      </div>
      {repo.description && <p className="line-clamp-2 text-xs text-ink-on-paper/55">{repo.description}</p>}
      <div className="flex items-center gap-3 text-xs text-ink-on-paper/40">
        {repo.language && <span>{repo.language}</span>}
        <span className="flex items-center gap-1">
          <Star size={11} />
          {repo.stars}
        </span>
      </div>
    </a>
  );
}
