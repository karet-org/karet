import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ExpandableTextField } from "../ExpandableTextField";

describe("ExpandableTextField", () => {
  it("renders an inline input bound to value", () => {
    const { getByLabelText } = render(
      React.createElement(ExpandableTextField, {
        value: "upper(x)",
        onChange: () => {},
        ariaLabel: "expression",
      }),
    );
    const input = getByLabelText("expression") as HTMLInputElement;
    expect(input.value).toBe("upper(x)");
    cleanup();
  });

  it("propagates inline edits via onChange", () => {
    let latest = "";
    const { getByLabelText } = render(
      React.createElement(ExpandableTextField, {
        value: "",
        onChange: (v: string) => {
          latest = v;
        },
        ariaLabel: "expression",
      }),
    );
    fireEvent.change(getByLabelText("expression"), {
      target: { value: "x * 100" },
    });
    expect(latest).toBe("x * 100");
    cleanup();
  });

  it("opens a modal textarea sharing the same value", () => {
    const { getByLabelText, queryByLabelText } = render(
      React.createElement(ExpandableTextField, {
        value: "coalesce(a, b)",
        onChange: () => {},
        ariaLabel: "expression",
      }),
    );
    expect(queryByLabelText("expression (expanded)")).toBeNull();
    fireEvent.click(getByLabelText("Expand expression"));
    const textarea = getByLabelText("expression (expanded)") as HTMLTextAreaElement;
    expect(textarea.value).toBe("coalesce(a, b)");
    cleanup();
  });

  it("commits via onModalAction when the modal action button is clicked", () => {
    let committed = 0;
    const { getByLabelText, getByText } = render(
      React.createElement(ExpandableTextField, {
        value: "x",
        onChange: () => {},
        onModalAction: () => {
          committed += 1;
        },
        ariaLabel: "expression",
        modalActionLabel: "Done",
      }),
    );
    fireEvent.click(getByLabelText("Expand expression"));
    fireEvent.click(getByText("Done"));
    expect(committed).toBe(1);
    cleanup();
  });
});
