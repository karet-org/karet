import { describe, expect, it } from "vitest";
import { StateEffect } from "@codemirror/state";
import { carriesLintRefresh, lintRefresh } from "../CodeEditor";

const update = (effects: StateEffect<unknown>[]) => ({ transactions: [{ effects }] });

describe("carriesLintRefresh", () => {
  it("detects the marker effect", () => {
    expect(carriesLintRefresh(update([lintRefresh.of(null)]))).toBe(true);
  });

  it("ignores other transactions and effects", () => {
    expect(carriesLintRefresh(update([]))).toBe(false);
    expect(carriesLintRefresh(update([StateEffect.define<null>().of(null)]))).toBe(false);
    expect(carriesLintRefresh({ transactions: [] })).toBe(false);
  });
});
