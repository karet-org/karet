// Lookup_Mapping editor rejects empty input_patterns
//
// For any Lookup_Mapping edited in the detail panel, the inline error
// indicator appears iff at least one row has an empty `input_patterns`
// array or contains an empty-string pattern.
//
// Strategy: generate lookup edits whose rows mix (a) patterns sampled from
// a pool including the empty string, and (b) occasionally-empty
// `input_patterns` arrays. Render the editor and assert the inline-error
// indicator's presence equals `validateLookupMapping(entity).errors.length > 0`.

import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import type { LookupMapping, LookupRow } from "@/lib/types/config";
import {
  LOOKUP_MAPPING_EDITOR_ERROR_TESTID,
  LookupMappingEditor,
} from "../detail/LookupMappingEditor";
import { validateLookupMapping } from "../detail/validation";

// Pattern pool biased to include empty strings and short ASCII so both
// branches (empty array, empty-string pattern) are frequently hit.
const arbPattern: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^[A-Za-z0-9]{1,4}$/),
);

const arbRow: fc.Arbitrary<LookupRow> = fc.record(
  {
    // minLength 0 so the "empty patterns" branch is reachable.
    input_patterns: fc.array(arbPattern, { minLength: 0, maxLength: 3 }),
    output: fc.stringMatching(/^[A-Za-z]{1,4}$/),
    parent_output: fc.option(fc.stringMatching(/^[A-Za-z]{1,4}$/), {
      nil: undefined,
    }),
  },
  { requiredKeys: ["input_patterns", "output"] },
);

const arbEdit: fc.Arbitrary<LookupMapping> = fc.record({
  id: fc.constant("L"),
  rows: fc.array(arbRow, { minLength: 0, maxLength: 4 }),
});

describe("Lookup_Mapping editor rejects empty input_patterns", () => {
  it("inline-error visibility equals the emptiness predicate", () => {
    fc.assert(
      fc.property(arbEdit, (edit) => {
        const { container } = render(
          React.createElement(LookupMappingEditor, {
            value: edit,
            onChange: () => {},
          }),
        );
        const errorVisible =
          container.querySelector(
            `[data-testid="${LOOKUP_MAPPING_EDITOR_ERROR_TESTID}"]`,
          ) !== null;

        const predictedInvalid =
          validateLookupMapping(edit).errors.length > 0;

        cleanup();
        expect(errorVisible).toBe(predictedInvalid);
      }),
      { numRuns: 100 },
    );
  });
});
