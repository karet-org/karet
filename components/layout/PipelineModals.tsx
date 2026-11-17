// The rename and delete dialogs opened from the pipeline menu in SideNav.

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "@/lib/client/navigation";
import { invalidateCached } from "@/lib/client/fetch-cache";
import Modal from "@/components/ui/Modal";

const codeClass = "rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[11px]";
const inputClass =
  "mt-1 w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2";

function PipelineDialog({
  busy,
  error,
  onClose,
  onSubmit,
  submitLabel,
  submitClass,
  submitDisabled,
  submitTestId,
  children,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  submitLabel: string;
  submitClass: string;
  submitDisabled: boolean;
  submitTestId: string;
  children: ReactNode;
}) {
  return (
    <Modal open onClose={() => !busy && onClose()}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        {children}
        {error ? (
          <p className="mt-3 text-sm text-[color:var(--color-rose-deep)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || submitDisabled}
            data-testid={submitTestId}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${submitClass}`}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeletePipelineModal({
  pipeline,
  displayName,
  onClose,
}: {
  pipeline: string;
  displayName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (confirm.trim() !== displayName) {
      setError(`Type "${displayName}" exactly to confirm deletion.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipelines/${encodeURIComponent(pipeline)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Delete failed: ${body.message ?? body.error ?? res.statusText}`);
        return;
      }
      onClose();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PipelineDialog
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={busy ? "Deleting…" : "Delete pipeline"}
      submitClass="bg-[color:var(--color-rose-deep)] hover:opacity-90"
      submitDisabled={confirm.trim() !== displayName}
      submitTestId="delete-pipeline-submit"
    >
      <h2 className="text-lg font-semibold text-[color:var(--color-rose-deep)]">Delete pipeline</h2>
      <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
        This permanently removes the config, dashboards, Parquet output, and job history for{" "}
        <code className={codeClass}>{displayName}</code>. Cannot be undone.
      </p>
      <div className="mt-4 rounded-md border border-[color:var(--color-amber-soft)] bg-[color:var(--color-amber-soft)] px-3 py-2 text-xs text-[color:var(--color-amber-deep)]">
        Want a backup first?{" "}
        <a href={`/api/p/${pipeline}/export`} download className="font-medium underline">
          Download a .zip
        </a>{" "}
        of this pipeline before deleting.
      </div>
      <label className="mt-4 block text-sm font-medium text-[color:var(--color-ink-2)]">
        Type <code className={codeClass}>{displayName}</code> to confirm
      </label>
      <input
        autoFocus
        type="text"
        data-testid="delete-pipeline-confirm"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="off"
        className={`${inputClass} font-mono focus:border-[color:var(--color-rose-deep)] focus:ring-[color:var(--color-rose-soft)]`}
      />
    </PipelineDialog>
  );
}

export function RenamePipelineModal({
  pipeline,
  displayName,
  onClose,
  onRenamed,
}: {
  pipeline: string;
  displayName: string;
  onClose: () => void;
  onRenamed: (name: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const newName = value.trim();
    if (!newName) {
      setError("Name is required");
      return;
    }
    if (newName === displayName) {
      setError("New name is the same as the current name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipelines/${encodeURIComponent(pipeline)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message ?? data.error ?? `Rename failed (${res.status})`);
        return;
      }
      onRenamed(newName);
      invalidateCached(`/api/p/${pipeline}/config`);
      onClose();
      router.refresh();
    } catch (err) {
      setError(
        (err as Error).name === "TimeoutError"
          ? "Rename timed out. Check your connection and try again."
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PipelineDialog
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={busy ? "Renaming…" : "Rename"}
      submitClass="bg-[color:var(--color-carrot)] hover:bg-[color:var(--color-carrot-deep)]"
      submitDisabled={false}
      submitTestId="rename-pipeline-submit"
    >
      <h2 className="text-lg font-semibold">Rename pipeline</h2>
      <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
        Changes the display name only. The URL and stored data keep the id{" "}
        <code className={codeClass}>{pipeline}</code>, so links keep working.
      </p>
      <label className="mt-4 block text-sm font-medium text-[color:var(--color-ink-2)]">New name</label>
      <input
        autoFocus
        type="text"
        data-testid="rename-pipeline-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${inputClass} focus:border-[color:var(--color-carrot)] focus:ring-[color:var(--color-carrot-soft)]`}
      />
    </PipelineDialog>
  );
}
