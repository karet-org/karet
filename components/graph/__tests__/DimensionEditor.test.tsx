// Unit tests for the Dimension structural editor.
//
// Exercises the two validation branches:
//   - any row has an empty `patterns` array
//   - any row contains an empty-string pattern
//
// Property coverage lives in `DimensionEditor.property.test.tsx`.

import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Dimension } from "@/lib/types/config";
import DimensionEditor, {
  DIMENSION_EDITOR_ERROR_TESTID,
} from "../detail/DimensionEditor";

function renderEditor(value: Dimension) {
  return render(
    React.createElement(DimensionEditor, {
      value,
      onChange: () => {},
    }),
  );
}

describe("DimensionEditor", () => {
  it("hides the error indicator for a valid edit", () => {
    const { container } = renderEditor({
      id: "L",
      rows: { values: ["v"], rows: [{ patterns: ["A"], values: ["X"] }] },
    });
    expect(
      container.querySelector(
        `[data-testid="${DIMENSION_EDITOR_ERROR_TESTID}"]`,
      ),
    ).toBeNull();
    cleanup();
  });

  it("hides the error indicator when no rows exist", () => {
    // Vacuously true, no row violates the predicate.
    const { container } = renderEditor({ id: "L", rows: { values: ["v"], rows: [] } });
    expect(
      container.querySelector(
        `[data-testid="${DIMENSION_EDITOR_ERROR_TESTID}"]`,
      ),
    ).toBeNull();
    cleanup();
  });

  it("shows the error indicator when a row has empty patterns", () => {
    const { container } = renderEditor({
      id: "L",
      rows: { values: ["v"], rows: [{ patterns: [], values: ["X"] }] },
    });
    expect(
      container.querySelector(
        `[data-testid="${DIMENSION_EDITOR_ERROR_TESTID}"]`,
      ),
    ).not.toBeNull();
    cleanup();
  });

  it("shows the error indicator when a row contains an empty-string pattern", () => {
    const { container } = renderEditor({
      id: "L",
      rows: { values: ["v"], rows: [{ patterns: ["A", ""], values: ["X"] }] },
    });
    expect(
      container.querySelector(
        `[data-testid="${DIMENSION_EDITOR_ERROR_TESTID}"]`,
      ),
    ).not.toBeNull();
    cleanup();
  });

  it("renders a priority input for each row, reflecting the current value", () => {
    const { getByLabelText, getAllByTestId } = renderEditor({
      id: "L",
      rows: { values: ["v"], rows: [{ patterns: ["A"], values: ["X"], priority: 7 }] },
    });
    // Rows render quietly; the fields appear once the row is opened.
    fireEvent.click(getAllByTestId("dimension-editor-row")[0]);
    const input = getByLabelText("row 0 priority") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("7");
    cleanup();
  });

  it("propagates an edited priority as an integer", () => {
    let latest: Dimension | undefined;
    const value: Dimension = {
      id: "L",
      rows: { values: ["v"], rows: [{ patterns: ["A"], values: ["X"] }] },
    };
    const { getByLabelText, getAllByTestId } = render(
      React.createElement(DimensionEditor, {
        value,
        onChange: (next: Dimension) => {
          latest = next;
        },
      }),
    );
    fireEvent.click(getAllByTestId("dimension-editor-row")[0]);
    fireEvent.change(getByLabelText("row 0 priority"), {
      target: { value: "5" },
    });
    expect(latest && !("path_prefix" in latest.rows) ? latest.rows.rows[0].priority : undefined).toBe(5);
    cleanup();
  });
  it("edits a file-backed dimension without inline rules", () => {
    const { getByLabelText, queryAllByTestId } = renderEditor({
      id: "L",
      rows: { path_prefix: "iso/", key: "code", values: ["name"] },
    });
    expect(queryAllByTestId("dimension-editor-row")).toHaveLength(0);
    expect((getByLabelText("key column") as HTMLInputElement).value).toBe("code");
    expect((getByLabelText("row source") as HTMLSelectElement).value).toBe("file");
    cleanup();
  });

  it("reports missing folder and key for a file-backed dimension", () => {
    const { container } = renderEditor({
      id: "L",
      rows: { path_prefix: "", key: "", values: ["name"] },
    });
    expect(
      container.querySelector(`[data-testid="${DIMENSION_EDITOR_ERROR_TESTID}"]`),
    ).not.toBeNull();
    cleanup();
  });

  it("keeps row values aligned when a value column is added", () => {
    let latest: Dimension | undefined;
    const { getByLabelText } = render(
      React.createElement(DimensionEditor, {
        value: {
          id: "L",
          rows: { values: ["a"], rows: [{ patterns: ["P"], values: ["X"] }] },
        } as Dimension,
        onChange: (next: Dimension) => {
          latest = next;
        },
      }),
    );
    const input = getByLabelText("value columns") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const rows = latest && !("path_prefix" in latest.rows) ? latest.rows : undefined;
    expect(rows?.values).toEqual(["a", "b"]);
    expect(rows?.rows[0].values).toEqual(["X", ""]);
    cleanup();
  });
});
