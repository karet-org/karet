"use client";

// "Account · Sign out" -- confirms an active session via /api/auth/me on
// mount, opens an Account modal for password edits, and hits
// /api/auth/logout on sign-out. Karet is single-admin and password-only,
// so no username is shown.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";

export default function UserMenu() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (cancelled) return;
        setAuthenticated(res.ok);
      } catch {
        // Stay silent -- the server-rendered page already required a session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authenticated) return null;

  return (
    <>
      <div className="flex items-center gap-1 text-[13px]">
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          className="rounded-md px-2.5 py-1.5 text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
          data-testid="user-menu-account"
        >
          Account
        </button>
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

      {accountOpen ? (
        <AccountModal onClose={() => setAccountOpen(false)} />
      ) : null}
    </>
  );
}

interface AccountModalProps {
  onClose: () => void;
}

function AccountModal({ onClose }: AccountModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  return (
    <Modal open onClose={() => { if (!submitting) onClose(); }}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);

          if (newPassword.length < 8) {
            setError("New password must be at least 8 characters.");
            return;
          }
          if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
          }
          if (!currentPassword) {
            setError("Enter your current password to confirm.");
            return;
          }

          setSubmitting(true);
          try {
            const res = await fetch("/api/auth/me", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ currentPassword, newPassword }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              const reason = body.error as string | undefined;
              const msg =
                reason === "wrong_password"
                  ? "Current password is incorrect."
                  : reason === "invalid_password"
                    ? "New password must be at least 8 characters."
                    : reason ?? `Update failed (${res.status})`;
              setError(msg);
              return;
            }
            // Show inline success briefly so the user sees the change
            // landed before the modal disappears.
            setSuccess(true);
            window.setTimeout(onClose, 1200);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h2 className="text-lg font-semibold">Change password</h2>
        <p className="mt-1 text-xs text-gray-500">
          Confirm with your current password to set a new one.
        </p>

        <label className="mt-4 block text-sm font-medium text-gray-700">
          Current password
        </label>
        <input
          autoFocus
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-white px-3 text-sm outline-none focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
          data-testid="account-current-password"
        />

        <label className="mt-4 block text-sm font-medium text-gray-700">
          New password
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          className="mt-1 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-white px-3 text-sm outline-none focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
          data-testid="account-new-password"
        />

        <label className="mt-3 block text-sm font-medium text-gray-700">
          Confirm new password
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className="mt-1 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-white px-3 text-sm outline-none focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
          data-testid="account-confirm-password"
        />

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            className="mt-3 text-sm text-emerald-600"
            role="status"
            data-testid="account-success"
          >
            Password updated.
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || success}
            className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || success}
            data-testid="account-submit"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {success ? "Updated" : submitting ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
