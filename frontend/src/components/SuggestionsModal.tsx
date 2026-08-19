import { useEffect, useRef, useState } from "react";
import { X, Sparkles, Plus, Trash2 } from "lucide-react";
import api from "../api";

interface RepoEntry {
  repoId: string;
  repoName: string;
  confidence: "high" | "medium";
  included: boolean;
}
interface Group {
  folderName: string;
  repos: RepoEntry[];
}

export default function SuggestionsModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState("");
  const dragRef = useRef<{ groupIndex: number; repoId: string } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<number | null>(null);

  useEffect(() => {
    api
      .suggestions()
      .then((s) => {
        const map = new Map<string, RepoEntry[]>();
        s.forEach((x) => {
          if (!map.has(x.suggestedFolderName)) map.set(x.suggestedFolderName, []);
          map.get(x.suggestedFolderName)!.push({
            repoId: x.repoId,
            repoName: x.repoName,
            confidence: x.confidence,
            included: true,
          });
        });
        setGroups(Array.from(map.entries()).map(([folderName, repos]) => ({ folderName, repos })));
      })
      .finally(() => setLoading(false));
  }, []);

  function renameGroup(i: number, name: string) {
    setGroups((gs) => gs.map((g, idx) => (idx === i ? { ...g, folderName: name } : g)));
  }
  function toggleRepo(gi: number, repoId: string) {
    setGroups((gs) =>
      gs.map((g, idx) =>
        idx === gi
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
    if (!drag || drag.groupIndex === targetIndex) return;
    setGroups((gs) => {
      const next = gs.map((g) => ({ ...g, repos: [...g.repos] }));
      const sourceRepos = next[drag.groupIndex].repos;
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
        className="flex max-h-[80vh] w-[32rem] flex-col rounded border border-line bg-surface p-4"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-text">
            <Sparkles size={15} className="text-accent" />
            Suggested organization
          </span>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={15} />
          </button>
        </div>
        <p className="mb-3 text-xs text-text-muted">
          Based on repo name, language, and topics. Edit any folder name, drag a repo onto a
          different folder to move it, or uncheck one to leave it in Uncategorized — nothing
          applies until you confirm.
        </p>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-text-muted">Analyzing repositories…</p>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">
              No confident suggestions right now — everything's either already organized or didn't
              match a known category.
            </p>
          ) : (
            <>
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
                        className="flex cursor-grab items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/[0.04] transition-colors duration-120"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input type="checkbox" checked={r.included} onChange={() => toggleRepo(gi, r.repoId)} />
                          <span className="truncate font-mono text-[13px]">{r.repoName}</span>
                        </span>
                        <span
                          className={[
                            "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-mono",
                            r.confidence === "high" ? "bg-success/15 text-success" : "bg-accent/15 text-accent",
                          ].join(" ")}
                        >
                          {r.confidence}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              ))}

              <div className="flex items-center gap-1.5">
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
            </>
          )}
        </div>

        {groups.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
