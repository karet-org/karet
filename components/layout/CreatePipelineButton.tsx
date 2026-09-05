"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeSlug } from "@/lib/config/slug";
import Modal from "@/components/ui/Modal";
import { IconPlus } from "@/components/icons";

type TemplateId = "blank" | "spending";

const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  {
    id: "blank",
    name: "Blank",
    description: "An empty pipeline. Add your own data and steps.",
  },
  {
    id: "spending",
    name: "Spending tracker",
    description:
      "A personal-finance starter with a transactions table and an overview dashboard.",
  },
];

export default function CreatePipelineButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<TemplateId>("spending");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (submitting) return;
    setOpen(false);
    setName("");
    setTemplate("spending");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const slug = sanitizeSlug(name);
    if (!slug) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, template }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError(`Pipeline "${slug}" already exists`);
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.message || data.error || "Failed to create pipeline");
        return;
      }
      // Invalidate the App Router cache so when the user navigates back
      // to "/" they see the new pipeline in the list. `push` alone reuses
      // the cached server render of "/" from the moment they opened the
      // app, which won't include this slug.
      router.refresh();
      router.push(`/p/${data.pipeline}/graph`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[color:var(--color-carrot)] px-3.5 text-[13.5px] font-medium text-white shadow-[0_1px_0_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:bg-[color:var(--color-carrot-deep)]"
      >
        <IconPlus size={14} />
        New pipeline
      </button>

      {open ? (
        <Modal open={open} onClose={close}>
          <form onSubmit={submit}>
            <h2 className="text-[17px] font-semibold text-[color:var(--color-ink)]">
              Create a pipeline
            </h2>
            <p className="mt-1 text-[13px] text-[color:var(--color-ink-3)]">
              Pipelines hold your data, your graph, and your dashboards. You can
              rename or delete them later.
            </p>

            <label className="mt-5 block text-[12px] font-medium text-[color:var(--color-ink-2)]">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My pipeline"
              className="mt-1.5 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-ink)] outline-none transition focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
            />
            <p className="mt-1 text-[11px] text-[color:var(--color-ink-4)]">
              Saved as{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono">
                {sanitizeSlug(name) || "…"}
              </code>
            </p>

            <label className="mt-4 block text-[12px] font-medium text-[color:var(--color-ink-2)]">
              Start from a template
            </label>
            <div className="mt-2 space-y-2">
              {TEMPLATES.map((t) => {
                const checked = template === t.id;
                return (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                      checked
                        ? "border-[color:var(--color-carrot)] bg-[color:var(--color-carrot-soft)]"
                        : "border-[color:var(--color-rule)] hover:border-[color:var(--color-ink-4)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={checked}
                      onChange={() => setTemplate(t.id)}
                      className="sr-only"
                    />
                    <span
                      className={`mt-[2px] grid h-4 w-4 flex-none place-items-center rounded-full border-[1.5px] ${
                        checked
                          ? "border-[color:var(--color-carrot)]"
                          : "border-[color:var(--color-ink-4)]"
                      }`}
                      aria-hidden
                    >
                      {checked ? (
                        <span className="h-2 w-2 rounded-full bg-[color:var(--color-carrot)]" />
                      ) : null}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[13.5px] font-semibold text-[color:var(--color-ink)]">
                        {t.name}
                      </span>
                      <span className="mt-[2px] block text-[12.5px] text-[color:var(--color-ink-3)]">
                        {t.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {error ? (
              <p className="mt-3 text-sm text-[color:var(--color-rose-deep)]">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="rounded-md border border-transparent px-3.5 py-2 text-[13.5px] text-[color:var(--color-ink-2)] hover:border-[color:var(--color-rule)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-9 items-center rounded-md bg-[color:var(--color-carrot)] px-3.5 text-[13.5px] font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create pipeline"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
