import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ColumnEditCard } from "../detail/inspector";
import { useDismiss } from "@/lib/client/use-dismiss";

afterEach(cleanup);

function card(overrides: { column?: { name: string; type: string }; deleteLabel?: string } = {}) {
  const props = {
    index: 2,
    column: { name: "amount", type: "float64" },
    testId: "card",
    deleteLabel: "delete",
    onChange: vi.fn(),
    onDelete: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
  render(<ColumnEditCard {...props} />);
  return props;
}

describe("ColumnEditCard", () => {
  it("sends the new name and the new type as separate patches", () => {
    const { onChange } = card();
    fireEvent.change(screen.getByLabelText("column 2 name"), { target: { value: "total" } });
    fireEvent.change(screen.getByLabelText("column 2 type"), { target: { value: "int64" } });
    expect(onChange.mock.calls).toEqual([[{ name: "total" }], [{ type: "int64" }]]);
  });

  it("keeps an unknown type as an option so the select shows it", () => {
    card({ column: { name: "geo", type: "geometry" } });
    expect((screen.getByLabelText("column 2 type") as HTMLSelectElement).value).toBe("geometry");
  });

  it("labels the delete button with the editor's verb and calls onDelete and onDone", () => {
    const { onDelete, onDone } = card({ deleteLabel: "remove" });
    fireEvent.click(screen.getByLabelText("remove column 2"));
    fireEvent.click(screen.getByText("Done"));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });
});

function Popover() {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div>
      <button type="button">outside</button>
      {open && (
        <div ref={ref}>
          <button type="button">inside</button>
        </div>
      )}
    </div>
  );
}

describe("useDismiss", () => {
  it("stays open on a press inside and closes on a press outside", () => {
    render(<Popover />);
    fireEvent.mouseDown(screen.getByText("inside"));
    expect(screen.queryByText("inside")).not.toBeNull();
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("closes on Escape", () => {
    render(<Popover />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("inside")).toBeNull();
  });
});
