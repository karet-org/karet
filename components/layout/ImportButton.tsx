"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconUpload } from "@/components/icons";
import { useCan } from "@/lib/client/use-current-user";
import { secondaryButtonClass } from "@/components/ui/controls";

export default function ImportButton() {
  const canImport = useCan("editor");
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const router = useRouter();

  async function handleFile(file: File) {
    setImporting(true);
    try {
      const displayName = file.name.replace(/\.zip$/i, "").trim();
      const res = await fetch(`/api/pipelines/import?name=${encodeURIComponent(displayName)}`, {
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

  // Importing writes a pipeline, so a viewer would only get a 403.
  if (!canImport) return null;

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
        className={secondaryButtonClass("gap-1.5")}
      >
        <IconUpload size={14} />
        {importing ? "Importing…" : "Import"}
      </button>
    </>
  );
}
