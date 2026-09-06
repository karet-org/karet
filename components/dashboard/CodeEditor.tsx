"use client";

// YAML editor: transparent textarea over a highlighted, scroll-synced
// <pre>.

import { useEffect, useRef } from "react";

const LINE_RE =
  /^(\s*(?:- )?)([A-Za-z_][A-Za-z0-9_]*)(:)(.*)$/;

function classifyValue(v: string): string {
  const t = v.trim();
  if (t === "" || t === "|" || t === ">") return "";
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return "tok-num";
  if (/^(true|false|null|~)$/.test(t)) return "tok-kw";
  return "tok-str";
}

/** Line-based YAML highlighter. Exported for tests. */
export function highlightYaml(src: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    src
      .split("\n")
      .map((line) => {
        const comment = line.match(/^(\s*)(#.*)$/);
        if (comment) return `${comment[1]}<span class="tok-pun">${esc(comment[2])}</span>`;
        const m = line.match(LINE_RE);
        if (!m) {
          // Block-scalar continuation or list item value.
          const cls = classifyValue(line);
          return cls ? `<span class="${cls}">${esc(line)}</span>` : esc(line);
        }
        const [, indent, key, colon, rest] = m;
        const cls = classifyValue(rest);
        const value = cls ? `<span class="${cls}">${esc(rest)}</span>` : esc(rest);
        return `${indent}<span class="tok-key">${esc(key)}</span><span class="tok-pun">${colon}</span>${value}`;
      })
      .join("\n") + "\n"
  );
}

export default function CodeEditor({
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
    <div className="relative min-h-0 flex-1" data-testid="code-editor">
      <pre
        ref={preRef}
        aria-hidden
        className={`${shared} pointer-events-none text-[color:var(--color-ink)] [&_.tok-key]:text-[color:var(--color-carrot-deep)] [&_.tok-str]:text-[#93ce8c] [&_.tok-num]:text-[color:var(--color-amber-deep)] [&_.tok-kw]:text-[#6cb2ff] [&_.tok-pun]:text-[color:var(--color-ink-3)]`}
        dangerouslySetInnerHTML={{ __html: highlightYaml(value) }}
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
