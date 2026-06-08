import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { DeleteButton } from "../DeleteButton";

describe("DeleteButton", () => {
  it("uses the provided label for aria-label and title", () => {
    const { getByLabelText } = render(
      React.createElement(DeleteButton, { label: "remove row 2" }),
    );
    const btn = getByLabelText("remove row 2");
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("title")).toBe("remove row 2");
    cleanup();
  });

  it("fires onClick", () => {
    let clicks = 0;
    const { getByLabelText } = render(
      React.createElement(DeleteButton, {
        label: "delete",
        onClick: () => {
          clicks += 1;
        },
      }),
    );
    fireEvent.click(getByLabelText("delete"));
    expect(clicks).toBe(1);
    cleanup();
  });
});
