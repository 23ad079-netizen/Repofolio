import { useEffect, useMemo, useState } from "react";
import { X, ShieldCheck, FileWarning, RefreshCw, ExternalLink } from "lucide-react";
import api from "../api";

interface HealthRow {
  id: string;
  name: string;
  folderName: string;
  pushedAt: string | null;
  hasLicense: boolean;
  hasReadme: boolean | null;
  openIssuesCount: number;
  language: string | null;
  htmlUrl: string;
}

type SortKey = "name" | "folderName" | "pushedAt" | "openIssuesCount";

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default function HealthPanel({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("pushedAt");
  const [onlyStale, setOnlyStale] = useState(false);
  const [onlyMissingReadme, setOnlyMissingReadme] = useState(false);

  function load() {
    setLoading(true);
    api
      .health()
      .then(setRows)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function runReadmeCheck() {
    setChecking(true);
    try {
      await api.checkReadmes();
      load();
    } finally {
      setChecking(false);
    }
  }

  const filtered = useMemo(() => {
    let list = [...rows];
    if (onlyStale) list = list.filter((r) => (daysSince(r.pushedAt) ?? 0) >= 90);
    if (onlyMissingReadme) list = list.filter((r) => r.hasReadme === false);
    list.sort((a, b) => {
      if (sortKey === "name" || sortKey === "folderName") return a[sortKey].localeCompare(b[sortKey]);
      if (sortKey === "pushedAt") return (a.pushedAt || "").localeCompare(b.pushedAt || "");
      return a.openIssuesCount - b.openIssuesCount;
    });
    return list;
  }, [rows, sortKey, onlyStale, onlyMissingReadme]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[46rem] flex-col rounded border border-line bg-surface p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-text">
            <ShieldCheck size={15} className="text-success" />
            Repository health
          </span>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={15} />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyStale} onChange={(e) => setOnlyStale(e.target.checked)} />
            Stale 90+ days
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyMissingReadme} onChange={(e) => setOnlyMissingReadme(e.target.checked)} />
            Missing README
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-line bg-ink px-2 py-1 text-xs text-text-muted"
          >
            <option value="pushedAt">Sort: last commit</option>
            <option value="name">Sort: name</option>
            <option value="folderName">Sort: folder</option>
            <option value="openIssuesCount">Sort: open issues</option>
          </select>
          <button
            onClick={runReadmeCheck}
            disabled={checking}
            className="ml-auto flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs text-text-muted hover:bg-white/[0.04] transition-colors duration-120 disabled:opacity-50"
          >
            <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking READMEs…" : "Check READMEs"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto rounded border border-line">
          {loading ? (
            <p className="py-8 text-center text-sm text-text-muted">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">Nothing matches these filters</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Repo</th>
                  <th className="px-3 py-2 font-medium">Folder</th>
                  <th className="px-3 py-2 font-medium">Last commit</th>
                  <th className="px-3 py-2 font-medium">README</th>
                  <th className="px-3 py-2 font-medium">License</th>
                  <th className="px-3 py-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const days = daysSince(r.pushedAt);
                  const stale = days !== null && days >= 90;
                  return (
                    <tr key={r.id} className="border-t border-line/50">
                      <td className="px-3 py-2">
                        <a
                          href={r.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-text hover:text-accent transition-colors duration-120"
                        >
                          {r.name}
                          <ExternalLink size={10} className="text-text-muted/40" />
                        </a>
                      </td>
                      <td className="px-3 py-2 text-text-muted">{r.folderName}</td>
                      <td className={["px-3 py-2", stale ? "text-danger" : "text-text-muted"].join(" ")}>
                        {days === null ? "—" : `${days}d ago`}
                      </td>
                      <td className="px-3 py-2">
                        {r.hasReadme === null ? (
                          <span className="text-text-muted/40">not checked</span>
                        ) : r.hasReadme ? (
                          <span className="text-success">yes</span>
                        ) : (
                          <span className="flex items-center gap-1 text-danger">
                            <FileWarning size={11} /> missing
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.hasLicense ? <span className="text-success">yes</span> : <span className="text-text-muted/50">none</span>}
                      </td>
                      <td className="px-3 py-2 text-text-muted">{r.openIssuesCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
