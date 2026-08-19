import { useRef, useState } from "react";
import { X, Sparkles, ShieldAlert, Plus, Trash2 } from "lucide-react";
import api from "../api";

interface RepoEntry {
  repoId: string;
  repoName: string;
  included: boolean;
}
interface Group {
  folderName: string;
  repos: RepoEntry[];
}

type DragSource = { groupIndex: number; repoId: string } | { groupIndex: "unassigned"; repoId: string };

export default function AiSuggestionsModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: () => void;
}) {
  const [includePrivate, setIncludePrivate] = useState(false);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [unassigned, setUnassigned] = useState<{ repoId: string; repoName: string }[]>([]);
  const [processed, setProcessed] = useState(0);
  const [applying, setApplying] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState("");
  const dragRef = useRef<DragSource | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<number | "unassigned" | null>(null);

  async function runScan() {
    setStatus("scanning");
    setError(null);
    try {
      const result = await api.aiSuggestions(includePrivate);
      setGroups(
        result.folders
          .filter((f) => f.repos.length > 0)
          .map((f) => ({
            folderName: f.folderName,
            repos: f.repos.map((r) => ({ ...r, included: true })),
          }))
      );
      setUnassigned(result.unassigned);
      setProcessed(result.processed);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI scan failed");
      setStatus("error");
    }
  }

  function renameGroup(i: number, name: string) {
    setGroups((gs) => gs.map((g, idx) => (idx === i ? { ...g, folderName: name } : g)));
  }
  function toggleRepo(groupIndex: number, repoId: string) {
    setGroups((gs) =>
      gs.map((g, idx) =>
        idx === groupIndex
          ? { ...g, repos: g.repos.map((r) => (r.repoId === repoId ? { ...r, included: !r.included } : r)) }
          : g
      )
    );
  }
  function addFolder() {
    if (!newFolderInput.trim()) return;
    setGroups((gs) => [...gs, { folderName: newFolderInput.trim(), repos: [] }]);
    setNewFolderInput("");
  }
  function removeGroup(i: number) {
    setGroups((gs) => (gs[i].repos.length > 0 ? gs : gs.filter((_, idx) => idx !== i)));
  }

  function onDropOnGroup(targetIndex: number) {
    setDragOverGroup(null);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (drag.groupIndex === "unassigned") {
      const entry = unassigned.find((r) => r.repoId === drag.repoId);
      if (!entry) return;
      setUnassigned((u) => u.filter((r) => r.repoId !== drag.repoId));
      setGroups((gs) =>
        gs.map((g, idx) => (idx === targetIndex ? { ...g, repos: [...g.repos, { ...entry, included: true }] } : g))
      );
      return;
    }

    if (drag.groupIndex === targetIndex) return;
    setGroups((gs) => {
      const next = gs.map((g) => ({ ...g, repos: [...g.repos] }));
      const sourceRepos = next[drag.groupIndex as number].repos;
      const idx = sourceRepos.findIndex((r) => r.repoId === drag.repoId);
      if (idx === -1) return gs;
      const [moved] = sourceRepos.splice(idx, 1);
      next[targetIndex].repos.push(moved);
      return next;
    });
  }

  async function apply() {
    setApplying(true);
    try {
      const items = groups.flatMap((g) =>
        g.repos.filter((r) => r.included).map((r) => ({ repoId: r.repoId, folderName: g.folderName.trim() || g.folderName }))
      );
      await api.applySuggestions(items);
      onApplied();
      onClose();
    } finally {
      setApplying(false);
    }
  }

  const selectedCount = groups.reduce((n, g) => n + g.repos.filter((r) => r.included).length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[34rem] flex-col rounded border border-line bg-surface p-4"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-text">
            <Sparkles size={15} className="text-accent" />
            AI organize
          </span>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={15} />
          </button>
        </div>

        {status === "idle" || status === "error" ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-xs text-text-muted">
              Reads each Uncategorized repo's name, description, topics, README, and root file
              listing (not full source code) and asks an AI model to propose folders, reusing your
              existing folder names where they fit. Nothing is applied until you review and confirm
              below. Processes up to 20 repos per run.
            </p>
            <label className="flex items-start gap-2 rounded border border-danger/30 bg-danger/5 p-2.5 text-xs text-text">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={includePrivate}
                onChange={(e) => setIncludePrivate(e.target.checked)}
              />
              <span>
                <span className="flex items-center gap-1 font-medium">
                  <ShieldAlert size={12} /> Include private repos
                </span>
                Off by default. If checked, private repo content is sent to the AI provider for
                this scan only.
              </span>
            </label>
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              onClick={runScan}
              className="rounded bg-accent px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-accent/85 transition-colors duration-120"
            >
              Run AI scan
            </button>
          </div>
        ) : status === "scanning" ? (
          <p className="py-8 text-center text-sm text-text-muted">
            Reading repositories and asking the model to organize them…
          </p>
        ) : groups.length === 0 && unassigned.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            Nothing to organize — no Uncategorized repos matched (processed {processed}).
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-text-muted">
              Processed {processed} repos. Edit any folder name, drag a repo to move it between
              folders — including out of "not confident" below — or uncheck one to skip it.
            </p>
            <div className="flex-1 overflow-y-auto">
              {groups.map((g, gi) => (
                <div
                  key={gi}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverGroup(gi);
                  }}
                  onDragLeave={() => setDragOverGroup((v) => (v === gi ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDropOnGroup(gi);
                  }}
                  className={[
                    "mb-4 rounded p-1",
                    dragOverGroup === gi ? "bg-accent/5 ring-1 ring-accent" : "",
                  ].join(" ")}
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <input
                      value={g.folderName}
                      onChange={(e) => renameGroup(gi, e.target.value)}
                      className="flex-1 rounded border border-line bg-ink px-2 py-1 font-mono text-xs font-medium uppercase tracking-wider text-text-muted outline-none focus:border-accent/50 transition-colors duration-120"
                    />
                    <button
                      onClick={() => removeGroup(gi)}
                      disabled={g.repos.length > 0}
                      title={g.repos.length > 0 ? "Move repos out first" : "Remove folder"}
                      className="text-text-muted/40 hover:text-danger disabled:opacity-25 disabled:hover:text-text-muted/40"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {g.repos.length === 0 ? (
                    <div className="rounded border border-dashed border-line py-2 text-center text-[11px] text-text-muted/50">
                      Drop a repo here
                    </div>
                  ) : (
                    g.repos.map((r) => (
                      <label
                        key={r.repoId}
                        draggable
                        onDragStart={() => {
                          dragRef.current = { groupIndex: gi, repoId: r.repoId };
                        }}
                        className="flex cursor-grab items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/[0.04] transition-colors duration-120"
                      >
                        <input type="checkbox" checked={r.included} onChange={() => toggleRepo(gi, r.repoId)} />
                        <span className="truncate font-mono text-[13px]">{r.repoName}</span>
                      </label>
                    ))
                  )}
                </div>
              ))}

              <div className="mb-3 flex items-center gap-1.5">
                <input
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFolder()}
                  placeholder="New folder name"
                  className="flex-1 rounded border border-line bg-ink px-2 py-1 text-xs text-text outline-none focus:border-accent/50 transition-colors duration-120"
                />
                <button
                  onClick={addFolder}
                  className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-text-muted hover:bg-white/[0.04] transition-colors duration-120"
                >
                  <Plus size={12} /> Add
                </button>
              </div>

              {unassigned.length > 0 && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverGroup("unassigned");
                  }}
                  onDragLeave={() => setDragOverGroup((v) => (v === "unassigned" ? null : v))}
                  className={[
                    "mb-2 rounded border p-2.5",
                    dragOverGroup === "unassigned" ? "border-accent bg-accent/5" : "border-line bg-ink",
                  ].join(" ")}
                >
                  <div className="mb-1.5 text-xs font-medium text-text-muted">
                    {unassigned.length} repo{unassigned.length === 1 ? "" : "s"} the model wasn't confident about
                    — drag one onto a folder above to place it manually, or leave it Uncategorized:
                  </div>
                  {unassigned.map((r) => (
                    <div
                      key={r.repoId}
                      draggable
                      onDragStart={() => {
                        dragRef.current = { groupIndex: "unassigned", repoId: r.repoId };
                      }}
                      className="cursor-grab truncate rounded px-2 py-1 font-mono text-[13px] text-text-muted hover:bg-white/[0.04] transition-colors duration-120"
                    >
                      {r.repoName}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-text-muted">{selectedCount} selected</span>
              <button
                onClick={apply}
                disabled={applying || selectedCount === 0}
                className="rounded bg-accent px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-accent/85 transition-colors duration-120 disabled:opacity-50"
              >
                {applying ? "Applying…" : `Apply ${selectedCount} repo${selectedCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
