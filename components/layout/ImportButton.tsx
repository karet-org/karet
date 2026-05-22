"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeSlug } from "@/lib/config/slug";
import { IconUpload } from "@/components/icons";

export default function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const router = useRouter();

  async function handleFile(file: File) {
    setImporting(true);
    try {
      const slug = sanitizeSlug(file.name.replace(/\.zip$/i, ""));
      const res = await fetch(`/api/pipelines/import?name=${encodeURIComponent(slug)}`, {
        method: "POST",
        body: file,
      });
      const data = await res.json();
      if (data.ok) {
        // Invalidate the App Router cache so the home page reflects the
        // new pipeline next time the user navigates there.
        router.refresh();
        router.push(`/p/${data.pipeline}/graph`);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--color-rule)] bg-white px-3.5 text-[13.5px] font-medium text-[color:var(--color-ink)] transition hover:border-[color:var(--color-ink-4)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
      >
        <IconUpload size={14} />
        {importing ? "Importing…" : "Import"}
      </button>
    </>
  );
}
