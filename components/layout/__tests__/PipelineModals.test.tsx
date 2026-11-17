import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { DeletePipelineModal, RenamePipelineModal } from "../PipelineModals";

function renderInRouter(element: ReactNode) {
  render(<RouterProvider router={createMemoryRouter([{ path: "/", element }])} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeletePipelineModal", () => {
  it("enables delete only once the exact name is typed", () => {
    renderInRouter(<DeletePipelineModal pipeline="p-1" displayName="Spending" onClose={() => {}} />);
    const submit = screen.getByTestId("delete-pipeline-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("delete-pipeline-confirm"), { target: { value: "Spend" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("delete-pipeline-confirm"), { target: { value: "Spending" } });
    expect(submit.disabled).toBe(false);
  });
});

describe("RenamePipelineModal", () => {
  it("refuses the current name without calling the API", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderInRouter(<RenamePipelineModal pipeline="p-1" displayName="Spending" onClose={() => {}} onRenamed={() => {}} />);
    fireEvent.click(screen.getByTestId("rename-pipeline-submit"));
    expect(screen.getByRole("alert").textContent).toBe("New name is the same as the current name");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the new name and reports it", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const onRenamed = vi.fn();
    const onClose = vi.fn();
    renderInRouter(<RenamePipelineModal pipeline="p-1" displayName="Spending" onClose={onClose} onRenamed={onRenamed} />);
    fireEvent.change(screen.getByTestId("rename-pipeline-input"), { target: { value: " Budget " } });
    fireEvent.click(screen.getByTestId("rename-pipeline-submit"));
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith("Budget"));
    expect(onClose).toHaveBeenCalled();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/pipelines/p-1");
    expect(JSON.parse(String(init.body))).toEqual({ name: "Budget" });
  });
});
