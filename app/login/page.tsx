"use client";

// Login + first-run setup. The page asks `/api/auth/setup` whether an
// admin password has been set; if not, it renders the "Set admin password"
// form. Otherwise it renders the standard sign-in form. Karet is
// single-admin and password-only.

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

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        backgroundImage:
          "radial-gradient(800px 400px at 50% -20%, var(--color-carrot-soft), transparent 70%)",
      }}
    >
      {children}
    </main>
  );
}

function LoginFallback() {
  return (
    <PageShell>
      <p className="text-sm text-[color:var(--color-ink-3)]">Loading…</p>
    </PageShell>
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

  const title = mode === "setup" ? "Set admin password" : "Sign in";
  const submitLabel = mode === "setup" ? "Set password" : "Sign in";

  return (
    <PageShell>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[360px] rounded-[10px] border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] p-7 shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_12px_rgba(31,29,26,0.06)]"
        data-testid="login-form"
      >
        <div className="mb-6 flex items-center gap-2.5 text-[15px] font-semibold text-[color:var(--color-ink)]">
          <KaretLogo size={22} />
          Karet
        </div>
        <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-[color:var(--color-ink)]">
          {title}
        </h2>
        <p className="mt-1 text-[13px] text-[color:var(--color-ink-3)]">
          {mode === "setup"
            ? "No password is set yet. Choose one to lock down this Karet instance. Use at least 8 characters."
            : "Enter the admin password for this Karet instance."}
        </p>

        <label className="mt-5 block text-[12px] font-medium text-[color:var(--color-ink-2)]">
          Password
        </label>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          required
          className="mt-1.5 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-white px-3 text-sm outline-none transition focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
          data-testid="login-password"
        />

        {mode === "setup" ? (
          <>
            <label className="mt-4 block text-[12px] font-medium text-[color:var(--color-ink-2)]">
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className="mt-1.5 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-white px-3 text-sm outline-none transition focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
              data-testid="login-confirm"
            />
          </>
        ) : null}

        {error ? (
          <p
            className="mt-4 text-sm text-[color:var(--color-rose-deep)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-[color:var(--color-carrot)] px-4 text-[14px] font-medium text-white shadow-[0_1px_0_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
          data-testid="login-submit"
        >
          {submitting ? "…" : submitLabel}
        </button>
      </form>
    </PageShell>
  );
}
