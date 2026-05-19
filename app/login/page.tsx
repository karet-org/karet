"use client";

// Login + first-run setup. The page asks `/api/auth/setup` whether an
// admin password has been set; if not, it renders the "Set admin password"
// form. Otherwise it renders the standard sign-in form. Karet is
// single-admin and password-only — no usernames.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KaretLogo } from "@/components/icons";

type Mode = "loading" | "login" | "setup";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50">
      <p className="text-sm text-gray-500">Loading…</p>
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params?.get("next") || "/";

  const [mode, setMode] = useState<Mode>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/setup", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { needsSetup: boolean };
          setMode(body.needsSetup ? "setup" : "login");
        } else {
          setMode("login");
        }
      } catch {
        if (!cancelled) setMode("login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "setup") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match");
        return;
      }
    }

    setSubmitting(true);
    try {
      const url = mode === "setup" ? "/api/auth/setup" : "/api/auth/login";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          body.message ||
            (mode === "setup"
              ? "Could not set admin password"
              : "Incorrect password"),
        );
        return;
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "loading") {
    return <LoginFallback />;
  }

  const title = mode === "setup" ? "Set admin password" : "Sign in to Karet";
  const submitLabel = mode === "setup" ? "Set password" : "Sign in";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
        data-testid="login-form"
      >
        <div className="mb-6 flex items-center gap-3">
          <KaretLogo size={32} />
          <h1 className="text-xl font-bold text-gray-900">Karet</h1>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {mode === "setup" ? (
          <p className="mt-1 text-xs text-gray-500">
            No password is set yet. Choose one to lock down this Karet
            instance — at least 8 characters.
          </p>
        ) : null}

        <label className="mt-6 block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          required
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
          data-testid="login-password"
        />

        {mode === "setup" ? (
          <>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
              data-testid="login-confirm"
            />
          </>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          data-testid="login-submit"
        >
          {submitting ? "…" : submitLabel}
        </button>
      </form>
    </main>
  );
}
