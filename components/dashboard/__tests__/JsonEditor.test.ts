import { describe, expect, it } from "vitest";
import { highlightJson } from "@/components/dashboard/JsonEditor";

describe("highlightJson", () => {
  it("classifies keys, strings, numbers, keywords, punctuation", () => {
    const out = highlightJson('{"a": "x", "n": -1.5e3, "ok": true, "z": null}');
    expect(out).toContain('<span class="tok-key">"a"</span>:');
    expect(out).toContain('<span class="tok-str">"x"</span>');
    expect(out).toContain('<span class="tok-num">-1.5e3</span>');
    expect(out).toContain('<span class="tok-kw">true</span>');
    expect(out).toContain('<span class="tok-kw">null</span>');
    expect(out).toContain('<span class="tok-pun">{</span>');
  });

  it("escapes HTML inside strings", () => {
    const out = highlightJson('{"t": "<img src=x>"}');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x>");
  });

  it("handles escaped quotes in strings", () => {
    const out = highlightJson('{"q": "say \\"hi\\""}');
    expect(out).toContain("tok-str");
  });
});
