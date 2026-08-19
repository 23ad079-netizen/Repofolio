import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Explorer from "./pages/Explorer";
import api from "./api";

export default function App() {
  const [status, setStatus] = useState<"loading" | "guest" | "authed">("loading");
  const [user, setUser] = useState<{ id: string; username: string; avatarUrl: string | null } | null>(
    null
  );

  useEffect(() => {
    api
      .me()
      .then((u) => {
        setUser(u);
        setStatus("authed");
      })
      .catch(() => setStatus("guest"));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-ink text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  if (status === "guest") return <Login />;

  return (
    <Explorer
      user={user!}
      onLogout={async () => {
        await api.logout();
        setUser(null);
        setStatus("guest");
      }}
    />
  );
}
