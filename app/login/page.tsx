"use client";

// Sign-in page. Karet is single-admin and password-only; the credential
// is provisioned via the KARET_ADMIN_PASSWORD_HASH environment variable
// (see README), so there is no in-app setup or password-change flow.

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KaretLogo } from "@/components/icons";

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

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message || "Incorrect password");
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

  return (
    <PageShell>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[360px] rounded-[10px] border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] p-7 shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_12px_rgba(31,29,26,0.06)]"
        data-testid="login-form"
      >
        <div className="mb-6 flex items-center gap-2.5 text-[15px] font-semibold text-[color:var(--color-ink)]">
          <KaretLogo size={28} />
          Karet
        </div>
        <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-[color:var(--color-ink)]">
          Sign in
        </h2>
        <p className="mt-1 text-[13px] text-[color:var(--color-ink-3)]">
          Enter the admin password for this Karet instance.
        </p>

        <label className="mt-5 block text-[12px] font-medium text-[color:var(--color-ink-2)]">
          Password
        </label>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1.5 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 text-sm outline-none transition focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
          data-testid="login-password"
        />

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
          {submitting ? "…" : "Sign in"}
        </button>
      </form>
    </PageShell>
  );
}
