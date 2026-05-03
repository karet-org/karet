"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeSlug } from "@/lib/config/slug";
import Modal from "@/components/ui/Modal";

type TemplateId = "blank" | "spending";

const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  { id: "blank", name: "Blank", description: "Empty pipeline - add your own sources, mappings, and tables." },
  { id: "spending", name: "Spending Tracker", description: "Personal spending pipeline with transactions table and overview dashboard." },
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
        className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700"
      >
        + New pipeline
      </button>

      {open ? (
        <Modal open={open} onClose={close}>
          <form onSubmit={submit}>
            <h2 className="text-lg font-semibold text-gray-900">Create pipeline</h2>

            <label className="mt-4 block text-sm font-medium text-gray-700">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My pipeline"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              Will be saved as <code className="rounded bg-gray-100 px-1">{sanitizeSlug(name) || "…"}</code>
            </p>

            <label className="mt-4 block text-sm font-medium text-gray-700">Template</label>
            <div className="mt-2 space-y-2">
              {TEMPLATES.map((t) => (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    template === t.id ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={t.id}
                    checked={template === t.id}
                    onChange={() => setTemplate(t.id)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.description}</div>
                  </div>
                </label>
              ))}
            </div>

            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
