"use client";

// "Sign out" control. Confirms an active session via /api/auth/me on
// mount and hits /api/auth/logout on sign-out. Karet is single-admin and
// password-only, so no username is shown; the credential is provisioned
// via KARET_ADMIN_PASSWORD_HASH (an operator action), so there is no
// in-app account management.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function UserMenu() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (cancelled) return;
        setAuthenticated(res.ok);
      } catch {
        // Stay silent, the server-rendered page already required a session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authenticated) return null;

  return (
    <div className="flex items-center gap-1 text-[13px]">
      <button
        type="button"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } finally {
            router.push("/login");
            router.refresh();
          }
        }}
        className="rounded-md px-2.5 py-1.5 text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] disabled:opacity-50"
        data-testid="user-menu-logout"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
