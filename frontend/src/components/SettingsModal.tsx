import { useEffect, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import api from "../api";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [isPublic, setIsPublic] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setIsPublic(s.isPublic);
        setSlug(s.publicSlug || "");
        setSlugInput(s.publicSlug || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const portfolioUrl = slug ? `${window.location.origin}/portfolio/${slug}` : null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateSettings({ isPublic, publicSlug: slugInput || undefined });
      setIsPublic(updated.isPublic);
      setSlug(updated.publicSlug || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-96 rounded border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-text">Portfolio settings</span>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={15} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">
              A public, read-only page showing your folder structure. Only public repositories are
              ever shown — private repos never appear here even if organized into a folder.
            </p>

            <label className="flex items-center justify-between text-sm">
              <span>Make my portfolio public</span>
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            </label>

            <div>
              <label className="mb-1 block text-xs text-text-muted">Link slug</label>
              <input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="your-name"
                className="w-full rounded border border-line bg-ink px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent/50 transition-colors duration-120"
              />
            </div>

            {portfolioUrl && (
              <div className="flex items-center gap-2 rounded border border-line bg-ink px-2.5 py-1.5">
                <span className="flex-1 truncate font-mono text-xs text-text-muted">{portfolioUrl}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(portfolioUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                  className="text-text-muted hover:text-text transition-colors duration-120"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}

            <button
              onClick={save}
              disabled={saving}
              className="mt-1 rounded bg-accent px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-accent/85 transition-colors duration-120 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
