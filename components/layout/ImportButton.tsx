"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeSlug } from "@/lib/config/slug";

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
        className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 transition hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
      >
        {importing ? "Importing…" : "Import pipeline (.zip)"}
      </button>
    </>
  );
}
