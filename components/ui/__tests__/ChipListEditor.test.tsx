import React from "react";
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ChipListEditor } from "../ChipListEditor";

function setup(initial: string[]) {
  let current = initial;
  const onChange = (next: string[]) => {
    current = next;
  };
  const utils = render(
    React.createElement(ChipListEditor, {
      value: current,
      onChange,
      ariaLabel: "patterns",
    }),
  );
  return { utils, get: () => current };
}

describe("ChipListEditor", () => {
  it("renders a chip per value", () => {
    const { utils } = setup(["AMAZON", "TARGET"]);
    expect(utils.getByLabelText("remove AMAZON")).not.toBeNull();
    expect(utils.getByLabelText("remove TARGET")).not.toBeNull();
    cleanup();
  });

  it("adds a chip on Enter", () => {
    const { utils, get } = setup([]);
    const input = utils.getByLabelText("patterns");
    fireEvent.change(input, { target: { value: "UBER" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(get()).toEqual(["UBER"]);
    cleanup();
  });

  it("splits a pasted comma-separated string into multiple chips", () => {
    const { utils, get } = setup([]);
    const input = utils.getByLabelText("patterns");
    fireEvent.change(input, { target: { value: "A, B, C" } });
    expect(get()).toEqual(["A", "B", "C"]);
    cleanup();
  });

  it("drops blank and duplicate tokens", () => {
    const { utils, get } = setup(["A"]);
    const input = utils.getByLabelText("patterns");
    fireEvent.change(input, { target: { value: "A, , B" } });
    expect(get()).toEqual(["A", "B"]);
    cleanup();
  });

  it("removes a chip via its remove button", () => {
    const { utils, get } = setup(["A", "B"]);
    fireEvent.click(utils.getByLabelText("remove A"));
    expect(get()).toEqual(["B"]);
    cleanup();
  });

  it("removes the last chip on Backspace when the input is empty", () => {
    const { utils, get } = setup(["A", "B"]);
    fireEvent.keyDown(utils.getByLabelText("patterns"), { key: "Backspace" });
    expect(get()).toEqual(["A"]);
    cleanup();
  });
});
