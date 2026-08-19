import { Github, FolderOpen } from "lucide-react";
import api from "../api";

export default function Login() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-ink px-6 text-text">
      <div className="flex items-center gap-2">
        <FolderOpen className="text-accent" size={28} />
        <span className="text-xl font-semibold">Repofolio</span>
      </div>
      <p className="max-w-sm text-center text-sm text-text-muted">
        Organize your GitHub repositories into unlimited nested folders — like a normal file
        explorer. Nothing changes on GitHub itself; this is a private layer only you can see.
      </p>
      <a
        href={api.loginUrl()}
        className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink transition-colors duration-120 hover:bg-accent/85"
      >
        <Github size={16} />
        Continue with GitHub
      </a>
    </div>
  );
}
