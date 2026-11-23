import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { AnalyticTable } from "@/lib/types/config";
import AnalyticTableEditor, {
  ANALYTIC_TABLE_EDITOR_ERROR_TESTID,
} from "../detail/AnalyticTableEditor";

function makeHarness(initial: AnalyticTable) {
  let current = initial;
  const element = () =>
    React.createElement(AnalyticTableEditor, {
      value: current,
      onChange: (next: AnalyticTable) => {
        current = next;
        utils.rerender(element());
      },
    });
  const utils = render(element());
  return {
    ...utils,
    get value() {
      return current;
    },
    hasError: () =>
      utils.container.querySelector(`[data-testid="${ANALYTIC_TABLE_EDITOR_ERROR_TESTID}"]`) !==
      null,
  };
}

const table: AnalyticTable = {
  id: "t",
  name: "T",
  schema: [
    { name: "day", type: "date" },
    { name: "path", type: "string" },
  ],
};

afterEach(cleanup);

describe("AnalyticTableEditor row retention", () => {
  it("offers only date columns and defaults to 365 days", () => {
    const harness = makeHarness(table);
    const select = harness.getByLabelText("row retention column") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "day"]);
    fireEvent.change(select, { target: { value: "day" } });
    expect(harness.value.retention).toEqual({ column: "day", days: 365 });
    expect(harness.hasError()).toBe(false);
    fireEvent.change(select, { target: { value: "" } });
    expect(harness.value.retention).toBeUndefined();
  });

  it("shows an error when the column is not a date or the days are under 1", () => {
    expect(makeHarness({ ...table, retention: { column: "path", days: 30 } }).hasError()).toBe(
      true,
    );
    cleanup();
    expect(makeHarness({ ...table, retention: { column: "day", days: 0 } }).hasError()).toBe(true);
  });

  it("follows a rename of the retention column and clears on its delete", () => {
    const harness = makeHarness({ ...table, retention: { column: "day", days: 30 } });
    fireEvent.click(harness.getAllByTestId("schema-column-row")[0]);
    fireEvent.change(harness.getByLabelText("column 0 name"), { target: { value: "when" } });
    expect(harness.value.retention).toEqual({ column: "when", days: 30 });
    fireEvent.click(harness.getByLabelText("delete column 0"));
    expect(harness.value.retention).toBeUndefined();
  });
});
