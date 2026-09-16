// Dimension editor rejects empty patterns
//
// For any Dimension edited in the detail panel, the inline error
// indicator appears iff at least one row has an empty `patterns`
// array or contains an empty-string pattern.
//
// Strategy: generate dimension edits whose rows mix (a) patterns sampled from
// a pool including the empty string, and (b) occasionally-empty
// `patterns` arrays. Render the editor and assert the inline-error
// indicator's presence equals `validateDimension(entity).errors.length > 0`.

import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import type { Dimension, InlineDimensionRow } from "@/lib/types/config";
import DimensionEditor, {
  DIMENSION_EDITOR_ERROR_TESTID,
} from "../detail/DimensionEditor";
import { validateDimension } from "../detail/validation";

// Pattern pool biased to include empty strings and short ASCII so both
// branches (empty array, empty-string pattern) are frequently hit.
const arbPattern: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^[A-Za-z0-9]{1,4}$/),
);

const arbRow: fc.Arbitrary<InlineDimensionRow> = fc.record(
  {
    // minLength 0 so the "empty patterns" branch is reachable.
    patterns: fc.array(arbPattern, { minLength: 0, maxLength: 3 }),
    values: fc.array(fc.stringMatching(/^[A-Za-z]{1,4}$/), { minLength: 1, maxLength: 1 }),
    priority: fc.option(fc.integer({ min: -10, max: 10 }), { nil: undefined }),
  },
  { requiredKeys: ["patterns", "values"] },
);

const arbEdit: fc.Arbitrary<Dimension> = fc.record({
  id: fc.constant("L"),
  rows: fc.record({
    values: fc.constant(["v"]),
    rows: fc.array(arbRow, { minLength: 0, maxLength: 4 }),
  }),
});

describe("Dimension editor rejects empty patterns", () => {
  it("inline-error visibility equals the emptiness predicate", () => {
    fc.assert(
      fc.property(arbEdit, (edit) => {
        const { container } = render(
          React.createElement(DimensionEditor, {
            value: edit,
            onChange: () => {},
          }),
        );
        const errorVisible =
          container.querySelector(
            `[data-testid="${DIMENSION_EDITOR_ERROR_TESTID}"]`,
          ) !== null;

        const predictedInvalid =
          validateDimension(edit).errors.length > 0;

        cleanup();
        expect(errorVisible).toBe(predictedInvalid);
      }),
      { numRuns: 100 },
    );
  });
});
