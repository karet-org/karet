"use client";

// JSON editor with syntax highlighting: a transparent-text textarea over
// a highlighted <pre>, scroll-synced. Editing stays native; the overlay
// only renders color.

import { useEffect, useRef } from "react";

const TOKEN_RE =
  /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+\.?\d*(?:[eE][+-]?\d+)?|[{}[\],:]/g;

/** Tokenizes JSON source into highlighted HTML. Exported for tests. */
export function highlightJson(src: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    src.replace(TOKEN_RE, (m, str, colon, kw) => {
      if (str) {
        const cls = colon ? "tok-key" : "tok-str";
        return `<span class="${cls}">${esc(str)}</span>${colon ?? ""}`;
      }
      if (kw) return `<span class="tok-kw">${m}</span>`;
      if (/^[{}[\],:]$/.test(m)) return `<span class="tok-pun">${m}</span>`;
      return `<span class="tok-num">${m}</span>`;
    }) + "\n"
  );
}

export default function JsonEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const sync = () => {
    if (!taRef.current || !preRef.current) return;
    preRef.current.scrollTop = taRef.current.scrollTop;
    preRef.current.scrollLeft = taRef.current.scrollLeft;
  };
  useEffect(sync, [value]);

  const shared =
    "absolute inset-0 m-0 whitespace-pre overflow-auto p-3.5 font-mono text-[12px] leading-[1.75]";

  return (
    <div className="relative min-h-0 flex-1" data-testid="json-editor">
      <pre
        ref={preRef}
        aria-hidden
        className={`${shared} pointer-events-none text-[color:var(--color-ink)] [&_.tok-key]:text-[color:var(--color-carrot-deep)] [&_.tok-str]:text-[#93ce8c] [&_.tok-num]:text-[color:var(--color-amber-deep)] [&_.tok-kw]:text-[#6cb2ff] [&_.tok-pun]:text-[color:var(--color-ink-3)]`}
        dangerouslySetInnerHTML={{ __html: highlightJson(value) }}
      />
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        spellCheck={false}
        aria-label={ariaLabel}
        className={`${shared} resize-none border-0 bg-transparent text-transparent caret-[color:var(--color-ink)] outline-none`}
      />
    </div>
  );
}
