"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Lock } from "lucide-react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        setError("Неверный пароль");
        setPassword("");
      }
    } catch {
      setError("Ошибка подключения к серверу");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen mountain-bg flex items-center justify-center p-4">
      <div className="glass rounded-xl p-8 w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-primary-400" />
          <h1 className="font-display text-xl font-semibold text-neutral-100">
            Панель управления
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-neutral-500 mb-1.5 block uppercase tracking-wide">
              Пароль
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                className="w-full bg-surface-card border border-surface-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-neutral-100 focus:outline-none focus:border-primary-500 placeholder:text-neutral-600"
                placeholder="Введите пароль"
              />
            </div>
          </div>

          {error && <p className="text-sm text-status-down">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-surface-page font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Проверка..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
