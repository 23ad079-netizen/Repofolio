import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Folder as FolderIcon,
  FolderOpen,
  Package,
  ChevronRight,
  ChevronDown,
  Search,
  FolderPlus,
  Star,
  MoreVertical,
  X,
  ExternalLink,
  Pencil,
  Trash2,
  RefreshCw,
  LogOut,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  Share2,
  Bot,
  Boxes,
} from "lucide-react";
import api, { type Folder, type Repository } from "../api";
import SettingsModal from "../components/SettingsModal";
import SuggestionsModal from "../components/SuggestionsModal";
import HealthPanel from "../components/HealthPanel";
import AiSuggestionsModal from "../components/AiSuggestionsModal";
import { folderTabColor } from "../lib/folderTabColor";

const langColor: Record<string, string> = {
  Python: "bg-amber-400",
  TypeScript: "bg-sky-400",
  JavaScript: "bg-yellow-300",
  Java: "bg-orange-500",
  "C++": "bg-pink-400",
  Go: "bg-cyan-400",
  Rust: "bg-orange-700",
  HTML: "bg-red-400",
  CSS: "bg-[#8A7B9B]",
};

function isDescendant(folders: Folder[], candidateId: string, ancestorId: string): boolean {
  if (candidateId === ancestorId) return true;
  const byId = Object.fromEntries(folders.map((f) => [f.id, f]));
  let cur: Folder | undefined = byId[candidateId];
  while (cur && cur.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = byId[cur.parentId];
  }
  return false;
}

interface Props {
  user: { id: string; username: string; avatarUrl: string | null };
  onLogout: () => void;
}

type DragData = { type: "repo" | "folder"; id: string };
type CtxMenu = { x: number; y: number; type: "repo" | "folder"; id: string };
type Modal = { mode: "create" | "rename"; parentId?: string | null; folderId?: string; value: string };

export default function Explorer({ user, onLogout }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"folder" | "all">("folder");
  const [search, setSearch] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const dragDataRef = useRef<DragData | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  async function loadAll() {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([api.folders(), api.repositories()]);
      setFolders(f);
      setRepos(r);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    api.aiStatus().then((s) => setAiEnabled(s.enabled)).catch(() => setAiEnabled(false));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  const byParent = useMemo(() => {
    const map: Record<string, Folder[]> = {};
    folders.forEach((f) => {
      const key = f.parentId ?? "root";
      if (!map[key]) map[key] = [];
      map[key].push(f);
    });
    return map;
  }, [folders]);

  const folderById = useMemo(() => Object.fromEntries(folders.map((f) => [f.id, f])), [folders]);

  function pathTo(folderId: string | null) {
    const path: Folder[] = [];
    let cur = folderId ? folderById[folderId] : null;
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? folderById[cur.parentId] : null;
    }
    return path;
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function goToFolder(id: string | null) {
    setViewMode("folder");
    setCurrentFolderId(id);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await api.sync();
      showToast(
        `Synced: ${result.created} new, ${result.updated} updated${
          result.missing ? `, ${result.missing} no longer on GitHub` : ""
        }`
      );
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // ---------- Drag & drop ----------
  function onDragStartRepo(e: React.DragEvent, repo: Repository) {
    dragDataRef.current = { type: "repo", id: repo.id };
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragStartFolder(e: React.DragEvent, folder: Folder) {
    dragDataRef.current = { type: "folder", id: folder.id };
    e.dataTransfer.effectAllowed = "move";
  }
  async function onDropOnFolder(e: React.DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    setDragOverId(null);
    const data = dragDataRef.current;
    dragDataRef.current = null;
    if (!data) return;

    if (data.type === "repo") {
      const prev = repos;
      setRepos((rs) => rs.map((r) => (r.id === data.id ? { ...r, folderId: targetFolderId } : r)));
      try {
        await api.moveRepository(data.id, targetFolderId);
        showToast(`Moved to ${targetFolderId ? folderById[targetFolderId]?.name : "Uncategorized"}`);
      } catch (err) {
        setRepos(prev);
        showToast(err instanceof Error ? err.message : "Move failed");
      }
    } else {
      if (data.id === targetFolderId) return;
      if (targetFolderId && isDescendant(folders, targetFolderId, data.id)) {
        showToast("Can't move a folder into its own subfolder");
        return;
      }
      const prev = folders;
      setFolders((fs) => fs.map((f) => (f.id === data.id ? { ...f, parentId: targetFolderId } : f)));
      try {
        await api.moveFolder(data.id, targetFolderId);
        showToast(`Moved "${folderById[data.id]?.name}"`);
      } catch (err) {
        setFolders(prev);
        showToast(err instanceof Error ? err.message : "Move failed");
      }
    }
  }

  // ---------- Folder CRUD ----------
  async function createFolder(parentId: string | null | undefined, name: string) {
    if (!name.trim()) return;
    try {
      const folder = await api.createFolder(name.trim(), parentId ?? null);
      setFolders((fs) => [...fs, folder]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create folder");
    }
  }
  async function renameFolder(folderId: string | undefined, name: string) {
    if (!folderId || !name.trim()) return;
    try {
      const updated = await api.renameFolder(folderId, name.trim());
      setFolders((fs) => fs.map((f) => (f.id === folderId ? updated : f)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not rename folder");
    }
  }
  async function deleteFolder(folderId: string) {
    const target = folderById[folderId];
    const parentId = target ? target.parentId : null;
    try {
      await api.deleteFolder(folderId);
      setFolders((fs) => fs.filter((f) => f.id !== folderId).map((f) => (f.parentId === folderId ? { ...f, parentId } : f)));
      setRepos((rs) => rs.map((r) => (r.folderId === folderId ? { ...r, folderId: parentId } : r)));
      if (currentFolderId === folderId) setCurrentFolderId(parentId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not delete folder");
    }
  }
  async function removeMissingRepo(repoId: string) {
    try {
      await api.removeRepository(repoId);
      setRepos((rs) => rs.filter((r) => r.id !== repoId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not remove repository");
    }
  }

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return repos
      .filter((r) => r.name.toLowerCase().includes(q))
      .map((r) => ({ repo: r, path: pathTo(r.folderId) }));
  }, [search, repos, folders]);

  const visibleFolders = byParent[currentFolderId ?? "root"] || [];
  const visibleRepos = repos.filter((r) => (r.folderId ?? null) === currentFolderId);
  const crumbs = pathTo(currentFolderId);
  const rootFolders = byParent["root"] || [];

  function TreeNode({ folder, depth }: { folder: Folder; depth: number }) {
    const isOpen = expanded.has(folder.id);
    const children = byParent[folder.id] || [];
    const isCurrent = currentFolderId === folder.id;
    const isDragOver = dragOverId === folder.id;
    const tabColor = folderTabColor(folder.name);
    return (
      <div>
        <div
          draggable
          onDragStart={(e) => onDragStartFolder(e, folder)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId(folder.id);
          }}
          onDragLeave={() => setDragOverId((id) => (id === folder.id ? null : id))}
          onDrop={(e) => onDropOnFolder(e, folder.id)}
          onClick={() => goToFolder(folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folder.id });
          }}
          style={{ paddingLeft: 10 + depth * 16 }}
          className={[
            "group flex items-center gap-1.5 py-1.5 pr-2 rounded cursor-pointer select-none text-sm transition-colors duration-120",
            isCurrent ? "bg-accent/10 text-text" : "text-text-muted hover:bg-white/[0.04] hover:text-text",
            isDragOver ? "ring-1 ring-accent bg-accent/5" : "",
          ].join(" ")}
        >
          {/* Folder tab color bar */}
          <span
            className="inline-block w-[3px] self-stretch rounded-full shrink-0"
            style={{ backgroundColor: tabColor }}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(folder.id);
            }}
            className="text-text-muted hover:text-text shrink-0"
          >
            {children.length > 0 ? (
              isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />
            ) : (
              <span className="inline-block w-[13px]" />
            )}
          </button>
          {isOpen ? (
            <FolderOpen size={15} className="text-accent shrink-0" />
          ) : (
            <FolderIcon size={15} className="text-accent shrink-0" />
          )}
          <span className="truncate">{folder.name}</span>
        </div>
        {isOpen && children.map((child) => <TreeNode key={child.id} folder={child} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-ink text-text"
      onClick={() => setCtxMenu(null)}
    >
      {/* Sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-line">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-accent/15 text-accent">
            <FolderOpen size={14} />
          </div>
          <span className="text-[13px] font-semibold tracking-wide text-text">Repofolio</span>
        </div>

        <div
          onClick={() => goToFolder(null)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId("root");
          }}
          onDragLeave={() => setDragOverId((id) => (id === "root" ? null : id))}
          onDrop={(e) => onDropOnFolder(e, null)}
          className={[
            "mx-2 mt-2 flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors duration-120",
            viewMode === "folder" && currentFolderId === null ? "bg-accent/10 text-text" : "text-text-muted hover:bg-white/[0.04] hover:text-text",
            dragOverId === "root" ? "ring-1 ring-accent" : "",
          ].join(" ")}
        >
          <Package size={14} className="text-text-muted" />
          Uncategorized
        </div>

        <div
          onClick={() => setViewMode("all")}
          className={[
            "mx-2 mt-0.5 flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors duration-120",
            viewMode === "all" ? "bg-accent/10 text-text" : "text-text-muted hover:bg-white/[0.04] hover:text-text",
          ].join(" ")}
        >
          <Boxes size={14} className="text-text-muted" />
          All repositories
        </div>

        <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
          {rootFolders.map((f) => (
            <TreeNode key={f.id} folder={f} depth={0} />
          ))}
        </div>

        <div className="border-t border-line p-2 space-y-0.5">
          <button
            onClick={() => setModal({ mode: "create", parentId: currentFolderId, value: "" })}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-text-muted hover:bg-white/[0.04] hover:text-text transition-colors duration-120"
          >
            <FolderPlus size={14} />
            New folder
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-text-muted hover:bg-white/[0.04] hover:text-text transition-colors duration-120 disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync repositories"}
          </button>
          <button
            onClick={() => setShowSuggestions(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-text-muted hover:bg-white/[0.04] hover:text-text transition-colors duration-120"
          >
            <Sparkles size={14} />
            Suggest organization
          </button>
          <button
            onClick={() => aiEnabled && setShowAiSuggestions(true)}
            disabled={!aiEnabled}
            title={aiEnabled ? undefined : "Set GROQ_API_KEY in the backend .env to enable this"}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-text-muted hover:bg-white/[0.04] hover:text-text transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Bot size={14} />
            AI organize
          </button>
          <button
            onClick={() => setShowHealth(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-text-muted hover:bg-white/[0.04] hover:text-text transition-colors duration-120"
          >
            <ShieldCheck size={14} />
            Repository health
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-text-muted hover:bg-white/[0.04] hover:text-text transition-colors duration-120"
          >
            <Share2 size={14} />
            Share portfolio
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {user.avatarUrl && (
              <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
            )}
            <span className="truncate text-[13px] text-text-muted">{user.username}</span>
          </div>
          <button onClick={onLogout} className="text-text-muted hover:text-text transition-colors duration-120">
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Main panel */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          {/* Breadcrumbs — styled as call numbers */}
          <div className="flex min-w-0 flex-1 items-center gap-1 font-mono text-[12px] text-text-muted uppercase tracking-wider">
            {viewMode === "all" && !search ? (
              <span className="text-text normal-case tracking-normal text-[13px] font-sans">All repositories</span>
            ) : (
              <>
                <span onClick={() => goToFolder(null)} className="cursor-pointer hover:text-text">
                  Root
                </span>
                {crumbs.map((c) => (
                  <React.Fragment key={c.id}>
                    <ChevronRight size={12} className="text-line" />
                    <span onClick={() => goToFolder(c.id)} className="cursor-pointer truncate hover:text-text">
                      {c.name}
                    </span>
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
          <div className="relative w-56 shrink-0">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories…"
              className="w-full rounded border border-line bg-surface py-1.5 pl-7 pr-2 text-[13px] text-text placeholder:text-text-muted/60 outline-none focus:border-accent/50 transition-colors duration-120"
            />
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => onDropOnFolder(e, currentFolderId)}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">Loading…</div>
          ) : searchResults ? (
            <div>
              <div className="mb-3 font-mono text-xs uppercase tracking-wider text-text-muted">
                {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
              </div>
              <div className="flex flex-col gap-1">
                {searchResults.map(({ repo, path }) => (
                  <div
                    key={repo.id}
                    onClick={() => {
                      setSearch("");
                      goToFolder(repo.folderId ?? null);
                    }}
                    className="flex cursor-pointer items-center justify-between rounded border border-line px-3 py-2 hover:border-text-muted/30 transition-colors duration-120"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Package size={14} className="text-accent shrink-0" />
                      <span className="truncate text-sm font-mono">{repo.name}</span>
                    </div>
                    <span className="truncate pl-3 font-mono text-xs text-text-muted">
                      {path.length ? path.map((p) => p.name).join(" / ") : "Uncategorized"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : viewMode === "all" ? (
            <div>
              <div className="mb-3 font-mono text-xs uppercase tracking-wider text-text-muted">
                {repos.length} repositor{repos.length === 1 ? "y" : "ies"} — every repo, regardless of folder
              </div>
              <div className="flex flex-col gap-1">
                {repos.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => goToFolder(r.folderId ?? null)}
                    className="flex cursor-pointer items-center justify-between rounded border border-line px-3 py-2 hover:border-text-muted/30 transition-colors duration-120"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {r.status === "missing" ? (
                        <AlertTriangle size={14} className="text-danger shrink-0" />
                      ) : (
                        <Package size={14} className="text-accent shrink-0" />
                      )}
                      <span className="truncate text-sm font-mono">{r.name}</span>
                    </div>
                    <span className="truncate pl-3 font-mono text-xs text-text-muted">
                      {pathTo(r.folderId).length ? pathTo(r.folderId).map((p) => p.name).join(" / ") : "Uncategorized"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {visibleFolders.length === 0 && visibleRepos.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-text-muted">
                  <FolderIcon size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">
                    {repos.length === 0 && folders.length === 0
                      ? "Nothing here yet. Sync your repositories from GitHub to get started."
                      : "This folder is empty"}
                  </p>
                  <p className="text-xs mt-1">Drag a repository in, or create a subfolder</p>
                </div>
              )}

              {visibleFolders.length > 0 && (
                <div className="mb-5 grid grid-cols-3 gap-2.5">
                  {visibleFolders.map((f) => {
                    const tabColor = folderTabColor(f.name);
                    return (
                      <div
                        key={f.id}
                        draggable
                        onDragStart={(e) => onDragStartFolder(e, f)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverId(f.id);
                        }}
                        onDragLeave={() => setDragOverId((id) => (id === f.id ? null : id))}
                        onDrop={(e) => {
                          e.stopPropagation();
                          onDropOnFolder(e, f.id);
                        }}
                        onDoubleClick={() => goToFolder(f.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCtxMenu({ x: e.clientX, y: e.clientY, type: "folder", id: f.id });
                        }}
                        className={[
                          "flex cursor-pointer items-center gap-2 rounded border px-3 py-2.5 text-sm transition-colors duration-120",
                          dragOverId === f.id ? "border-accent bg-accent/5" : "border-line bg-surface hover:border-text-muted/30",
                        ].join(" ")}
                      >
                        {/* Folder tab bar */}
                        <span
                          className="inline-block w-[3px] self-stretch rounded-full shrink-0"
                          style={{ backgroundColor: tabColor }}
                        />
                        <FolderIcon size={16} className="text-accent shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {visibleRepos.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5">
                  {visibleRepos.map((r) => (
                    <div
                      key={r.id}
                      draggable={r.status === "active"}
                      onDragStart={(e) => onDragStartRepo(e, r)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCtxMenu({ x: e.clientX, y: e.clientY, type: "repo", id: r.id });
                      }}
                      className={[
                        "group flex flex-col gap-2 rounded border px-3 py-2.5 transition-colors duration-120",
                        r.status === "missing"
                          ? "border-line/60 bg-surface/50 opacity-60"
                          : "border-line bg-surface hover:border-text-muted/30",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {r.status === "missing" ? (
                            <AlertTriangle size={15} className="text-danger shrink-0" />
                          ) : (
                            <Package size={15} className="text-accent shrink-0" />
                          )}
                          <span className="truncate text-sm font-mono font-medium">{r.name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCtxMenu({ x: e.clientX, y: e.clientY, type: "repo", id: r.id });
                          }}
                          className="shrink-0 text-text-muted/40 opacity-0 hover:text-text group-hover:opacity-100 transition-opacity duration-120"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>
                      {r.status === "missing" ? (
                        <span className="text-xs text-danger">No longer on GitHub</span>
                      ) : (
                        <div className="flex items-center gap-3 text-xs text-text-muted">
                          {r.language && (
                            <span className="flex items-center gap-1">
                              <span className={`h-2 w-2 rounded-full ${langColor[r.language] || "bg-text-muted/40"}`} />
                              {r.language}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Star size={11} />
                            {r.stars}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          className="fixed z-50 w-48 overflow-hidden rounded border border-line bg-surface py-1 text-[13px] shadow-lg shadow-black/30"
        >
          {ctxMenu.type === "repo" ? (
            (() => {
              const repo = repos.find((r) => r.id === ctxMenu.id);
              if (!repo) return null;
              if (repo.status === "missing") {
                return (
                  <MenuItem
                    icon={Trash2}
                    label="Remove from explorer"
                    danger
                    onClick={() => {
                      removeMissingRepo(repo.id);
                      setCtxMenu(null);
                    }}
                  />
                );
              }
              return (
                <>
                  <MenuItem
                    icon={ExternalLink}
                    label="Open on GitHub"
                    onClick={() => {
                      window.open(repo.htmlUrl, "_blank", "noopener");
                      setCtxMenu(null);
                    }}
                  />
                  <MenuItem
                    icon={Trash2}
                    label="Remove from folder"
                    danger
                    onClick={async () => {
                      setCtxMenu(null);
                      await api.moveRepository(repo.id, null);
                      setRepos((rs) => rs.map((x) => (x.id === repo.id ? { ...x, folderId: null } : x)));
                    }}
                  />
                </>
              );
            })()
          ) : (
            <>
              <MenuItem
                icon={FolderPlus}
                label="New subfolder"
                onClick={() => {
                  setModal({ mode: "create", parentId: ctxMenu.id, value: "" });
                  setCtxMenu(null);
                }}
              />
              <MenuItem
                icon={Pencil}
                label="Rename"
                onClick={() => {
                  setModal({ mode: "rename", folderId: ctxMenu.id, value: folderById[ctxMenu.id]?.name || "" });
                  setCtxMenu(null);
                }}
              />
              <MenuItem
                icon={FolderOpen}
                label="Open"
                onClick={() => {
                  goToFolder(ctxMenu.id);
                  setCtxMenu(null);
                }}
              />
              <MenuItem
                icon={Trash2}
                label="Delete folder"
                danger
                onClick={() => {
                  deleteFolder(ctxMenu.id);
                  setCtxMenu(null);
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Create / rename modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-72 rounded border border-line bg-surface p-4 animate-[modalIn_150ms_ease-out]"
            style={{ animationName: "modalIn" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-text">
                {modal.mode === "create" ? "New folder" : "Rename folder"}
              </span>
              <button onClick={() => setModal(null)} className="text-text-muted hover:text-text">
                <X size={15} />
              </button>
            </div>
            <input
              autoFocus
              value={modal.value}
              onChange={(e) => setModal({ ...modal, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (modal.mode === "create") createFolder(modal.parentId, modal.value);
                  else renameFolder(modal.folderId, modal.value);
                  setModal(null);
                }
              }}
              placeholder="Folder name"
              className="w-full rounded border border-line bg-ink px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent/50 transition-colors duration-120"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded px-3 py-1.5 text-[13px] text-text-muted hover:bg-white/[0.04]">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (modal.mode === "create") createFolder(modal.parentId, modal.value);
                  else renameFolder(modal.folderId, modal.value);
                  setModal(null);
                }}
                className="rounded bg-accent px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-accent/85 transition-colors duration-120"
              >
                {modal.mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-line bg-surface px-3 py-1.5 text-[13px] text-text shadow-lg shadow-black/30">
          {toast}
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showSuggestions && (
        <SuggestionsModal
          onClose={() => setShowSuggestions(false)}
          onApplied={() => {
            loadAll();
            showToast("Suggestions applied");
          }}
        />
      )}
      {showHealth && <HealthPanel onClose={() => setShowHealth(false)} />}
      {showAiSuggestions && (
        <AiSuggestionsModal
          onClose={() => setShowAiSuggestions(false)}
          onApplied={() => {
            loadAll();
            showToast("AI suggestions applied");
          }}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={["flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.04] transition-colors duration-120", danger ? "text-danger" : "text-text"].join(" ")}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}
