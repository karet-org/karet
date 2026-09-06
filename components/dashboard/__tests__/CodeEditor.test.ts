import { describe, expect, it } from "vitest";
import { highlightYaml } from "@/components/dashboard/CodeEditor";

describe("highlightYaml", () => {
  it("classifies keys, strings, numbers, keywords, comments", () => {
    const out = highlightYaml(
      "version: 2\nname: Spending\nflag: true\n# a comment\n  - kind: bar",
    );
    expect(out).toContain('<span class="tok-key">version</span>');
    expect(out).toContain('<span class="tok-num"> 2</span>');
    expect(out).toContain('<span class="tok-str"> Spending</span>');
    expect(out).toContain('<span class="tok-kw"> true</span>');
    expect(out).toContain('<span class="tok-pun"># a comment</span>');
    expect(out).toContain('<span class="tok-key">kind</span>');
  });

  it("escapes HTML", () => {
    const out = highlightYaml("name: <img src=x>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x>");
  });
});
