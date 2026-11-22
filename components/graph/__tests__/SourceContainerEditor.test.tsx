// Unit tests for the Source_Container structural editor.
//
// Exercises the four validation branches:
//   - empty name
//   - empty columns list
//   - duplicate column names
//   - unknown column type
//
// Property coverage lives in `SourceContainerEditor.property.test.tsx`.

import React from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { SourceContainer } from "@/lib/types/config";
import SourceContainerEditor, {
  SOURCE_CONTAINER_EDITOR_ERROR_TESTID,
} from "../detail/SourceContainerEditor";

function makeHarness(initial: SourceContainer) {
  let current = initial;
  const set = (next: SourceContainer) => {
    current = next;
    rerender();
  };
  const rerender = () => {
    utils.rerender(
      React.createElement(SourceContainerEditor, {
        value: current,
        onChange: set,
      }),
    );
  };
  const utils = render(
    React.createElement(SourceContainerEditor, {
      value: current,
      onChange: set,
    }),
  );
  return {
    ...utils,
    get value() {
      return current;
    },
    set(next: SourceContainer) {
      set(next);
    },
  };
}

describe("SourceContainerEditor", () => {
  it("hides the error indicator for a valid edit", () => {
    const { container } = makeHarness({
      id: "a",
      name: "Valid",
      path_prefix: "raw/a/",
      schema: [{ name: "x", type: "string" }],
    });
    expect(
      container.querySelector(
        `[data-testid="${SOURCE_CONTAINER_EDITOR_ERROR_TESTID}"]`,
      ),
    ).toBeNull();
    cleanup();
  });

  it("shows an error when name is empty", () => {
    const { container } = makeHarness({
      id: "a",
      name: "",
      path_prefix: "raw/a/",
      schema: [{ name: "x", type: "string" }],
    });
    expect(
      container.querySelector(
        `[data-testid="${SOURCE_CONTAINER_EDITOR_ERROR_TESTID}"]`,
      ),
    ).not.toBeNull();
    cleanup();
  });

  it("shows an error when the columns list is empty", () => {
    const { container } = makeHarness({
      id: "a",
      name: "Valid",
      path_prefix: "raw/a/",
      schema: [],
    });
    expect(
      container.querySelector(
        `[data-testid="${SOURCE_CONTAINER_EDITOR_ERROR_TESTID}"]`,
      ),
    ).not.toBeNull();
    cleanup();
  });

  it("shows an error on duplicate column names", () => {
    const { container } = makeHarness({
      id: "a",
      name: "Valid",
      path_prefix: "raw/a/",
      schema: [
        { name: "x", type: "string" },
        { name: "x", type: "number" },
      ],
    });
    expect(
      container.querySelector(
        `[data-testid="${SOURCE_CONTAINER_EDITOR_ERROR_TESTID}"]`,
      ),
    ).not.toBeNull();
    cleanup();
  });

  it("shows an error on unknown column type", () => {
    const { container } = makeHarness({
      id: "a",
      name: "Valid",
      path_prefix: "raw/a/",
      // `blob` is not in KNOWN_COLUMN_TYPES.
      schema: [{ name: "x", type: "blob" }],
    });
    expect(
      container.querySelector(
        `[data-testid="${SOURCE_CONTAINER_EDITOR_ERROR_TESTID}"]`,
      ),
    ).not.toBeNull();
    cleanup();
  });

  it("adds a new column via the + button and propagates edits", () => {
    const harness = makeHarness({
      id: "a",
      name: "Valid",
      path_prefix: "raw/a/",
      schema: [{ name: "x", type: "string" }],
    });
    const addBtn = harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="source-container-editor-add-column"]',
    );
    expect(addBtn).not.toBeNull();
    act(() => {
      fireEvent.click(addBtn!);
    });
    expect(harness.value.schema.length).toBe(2);
    cleanup();
  });

  it("shows an error when raw file retention is under 1 day or not whole", () => {
    for (const retention_days of [0, 1.5]) {
      const { container } = makeHarness({
        id: "a",
        name: "Valid",
        path_prefix: "raw/a/",
        schema: [{ name: "x", type: "string" }],
        retention_days,
      });
      expect(
        container.querySelector(`[data-testid="${SOURCE_CONTAINER_EDITOR_ERROR_TESTID}"]`),
      ).not.toBeNull();
      cleanup();
    }
  });

  it("sets raw file retention from the days field and unsets it when cleared", () => {
    const harness = makeHarness({
      id: "a",
      name: "Valid",
      path_prefix: "raw/a/",
      schema: [{ name: "x", type: "string" }],
    });
    const days = harness.getByLabelText("raw file retention days");
    fireEvent.change(days, { target: { value: "30" } });
    expect(harness.value.retention_days).toBe(30);
    expect(
      harness.container.querySelector(`[data-testid="${SOURCE_CONTAINER_EDITOR_ERROR_TESTID}"]`),
    ).toBeNull();
    fireEvent.change(days, { target: { value: "" } });
    expect(harness.value.retention_days).toBeUndefined();
    cleanup();
  });
});
