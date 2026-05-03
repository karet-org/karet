// Source_Container schema editor validation
//
// For any user edit to a Source_Container schema, the inline error
// indicator appears iff the resulting schema is invalid (missing name,
// empty columns list, duplicate column names, or unknown column type).
//
// Strategy: generate a Source_Container edit with name, path_prefix, and a
// 0..=5-column schema drawing from a mix of known and unknown types, plus
// occasional name collisions. Render the editor and assert the DOM error
// indicator's presence equals the predicate `validateSourceContainer`.

import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import type { ColumnSchema, SourceContainer } from "@/lib/types/config";
import {
  SourceContainerEditor,
  SOURCE_CONTAINER_EDITOR_ERROR_TESTID,
} from "../detail/SourceContainerEditor";
import {
  KNOWN_COLUMN_TYPES,
  validateSourceContainer,
} from "../detail/validation";

// Mix of known-valid and plausible-unknown column types so the generator
// actually stresses the "unknown type" branch.
const arbColumnType: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...KNOWN_COLUMN_TYPES),
  fc.constantFrom("blob", "text", "timestamp", "enum", ""),
);

// Column names draw from a tiny pool so duplicate names arise frequently.
const arbColumnName: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("a", "b", "c", "d", ""),
  fc.stringMatching(/^[a-z]{1,4}$/),
);

const arbColumn: fc.Arbitrary<ColumnSchema> = fc.record({
  name: arbColumnName,
  type: arbColumnType,
});

// Name occasionally empty to cover the "empty name" branch.
const arbName: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^[A-Za-z0-9 ]{1,8}$/),
);

const arbEdit: fc.Arbitrary<SourceContainer> = fc.record({
  id: fc.constant("sc"),
  name: arbName,
  path_prefix: fc.constant("raw/x/"),
  // minLength 0 so the "empty columns" branch is reachable.
  schema: fc.array(arbColumn, { minLength: 0, maxLength: 5 }),
});

describe("Source_Container schema editor validation", () => {
  it("inline-error visibility equals validity predicate", () => {
    fc.assert(
      fc.property(arbEdit, (edit) => {
        const { container } = render(
          React.createElement(SourceContainerEditor, {
            value: edit,
            onChange: () => {},
          }),
        );
        const errorEl = container.querySelector(
          `[data-testid="${SOURCE_CONTAINER_EDITOR_ERROR_TESTID}"]`,
        );
        const errorVisible = errorEl !== null;

        const predicted = validateSourceContainer(edit).errors.length > 0;

        cleanup();
        expect(errorVisible).toBe(predicted);
      }),
      { numRuns: 100 },
    );
  });
});
