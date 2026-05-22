// Unit tests for the Lookup_Mapping structural editor.
//
// Exercises the two validation branches:
//   - any row has an empty `input_patterns` array
//   - any row contains an empty-string pattern
//
// Property coverage lives in `LookupMappingEditor.property.test.tsx`.

import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { LookupMapping } from "@/lib/types/config";
import {
  LookupMappingEditor,
  LOOKUP_MAPPING_EDITOR_ERROR_TESTID,
} from "../detail/LookupMappingEditor";

function renderEditor(value: LookupMapping) {
  return render(
    React.createElement(LookupMappingEditor, {
      value,
      onChange: () => {},
    }),
  );
}

describe("LookupMappingEditor", () => {
  it("hides the error indicator for a valid edit", () => {
    const { container } = renderEditor({
      id: "L",
      rows: [{ input_patterns: ["A"], output: "X" }],
    });
    expect(
      container.querySelector(
        `[data-testid="${LOOKUP_MAPPING_EDITOR_ERROR_TESTID}"]`,
      ),
    ).toBeNull();
    cleanup();
  });

  it("hides the error indicator when no rows exist", () => {
    // Vacuously true -- no row violates the predicate.
    const { container } = renderEditor({ id: "L", rows: [] });
    expect(
      container.querySelector(
        `[data-testid="${LOOKUP_MAPPING_EDITOR_ERROR_TESTID}"]`,
      ),
    ).toBeNull();
    cleanup();
  });

  it("shows the error indicator when a row has empty input_patterns", () => {
    const { container } = renderEditor({
      id: "L",
      rows: [{ input_patterns: [], output: "X" }],
    });
    expect(
      container.querySelector(
        `[data-testid="${LOOKUP_MAPPING_EDITOR_ERROR_TESTID}"]`,
      ),
    ).not.toBeNull();
    cleanup();
  });

  it("shows the error indicator when a row contains an empty-string pattern", () => {
    const { container } = renderEditor({
      id: "L",
      rows: [{ input_patterns: ["A", ""], output: "X" }],
    });
    expect(
      container.querySelector(
        `[data-testid="${LOOKUP_MAPPING_EDITOR_ERROR_TESTID}"]`,
      ),
    ).not.toBeNull();
    cleanup();
  });
});
