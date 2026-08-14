import { fireEvent, render, screen } from "@testing-library/react";
import { CanvasSlideSorter } from "./CanvasSlideSorter";

const slides = [
  { id: "slide-1", name: "Slide 1", x: 0, y: 0, width: 1080, height: 1440 },
  { id: "slide-2", name: "Slide 2", x: 1200, y: 0, width: 1080, height: 1440 },
  { id: "slide-3", name: "Slide 3", x: 2400, y: 0, width: 1080, height: 1440 },
];

const defaultSelectionProps = {
  currentSlideId: null,
  onSelect: () => undefined,
};

describe("CanvasSlideSorter", () => {
  it("uses the whole Slide title as the click and drag target", () => {
    const selected: string[] = [];
    const reordered: string[][] = [];
    const onPreview = vi.fn(async () => null);
    render(
      <CanvasSlideSorter
        currentSlideId="slide-2"
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 100,
        }}
        onAutoPan={() => undefined}
        onPreview={onPreview}
        onReorder={(ids) => reordered.push(ids)}
        onSelect={(slideId) => selected.push(slideId)}
      />,
    );

    const dragButton = screen.getByRole("button", {
      name: "选择或拖动 Slide 1",
    });
    const title = screen.getByText("Slide 1");

    expect(dragButton).toContainElement(title);
    expect(title).toHaveClass("canvas-slide-title-text");
    fireEvent.pointerDown(title, {
      button: 0,
      clientX: 25,
      clientY: 85,
      pointerId: 3,
    });
    expect(onPreview).not.toHaveBeenCalled();
    fireEvent.pointerMove(title, {
      clientX: 28,
      clientY: 85,
      pointerId: 3,
    });
    expect(onPreview).not.toHaveBeenCalled();
    fireEvent.pointerUp(title, {
      clientX: 28,
      clientY: 85,
      pointerId: 3,
    });
    expect(selected).toEqual(["slide-1"]);
    expect(reordered).toEqual([]);
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("leaves space between a Slide handle and its Frame border", () => {
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 100,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={() => undefined}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "选择或拖动 Slide 1" })
        .closest(".canvas-slide-drag-handle"),
    ).toHaveStyle({ top: "76px" });
  });

  it("positions Slide handles in the product host coordinate space", () => {
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        hostOrigin={{ left: 40, top: 70 }}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 120,
          offsetTop: 100,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={() => undefined}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "选择或拖动 Slide 1" })
        .closest(".canvas-slide-drag-handle"),
    ).toHaveStyle({ left: "79px", top: "6px" });
  });

  it("moves a canvas Slide into the indicated horizontal gap", () => {
    const reordered: string[][] = [];
    const selected: string[] = [];
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 0,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={(ids) => reordered.push(ids)}
        onSelect={(slideId) => selected.push(slideId)}
      />,
    );

    const handle = screen.getByRole("button", {
      name: "选择或拖动 Slide 2",
    });
    expect(screen.getByText("Slide 2")).toBeInTheDocument();
    expect(handle).not.toHaveClass("canvas-slide-number-pill");
    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 348,
      clientY: 10,
      pointerId: 7,
    });
    fireEvent.pointerMove(handle, {
      clientX: 700,
      clientY: 10,
      pointerId: 7,
    });
    expect(document.querySelector(".canvas-slide-insertion-line")).toBeTruthy();
    fireEvent.pointerUp(handle, {
      clientX: 700,
      clientY: 10,
      pointerId: 7,
    });

    expect(reordered).toEqual([["slide-1", "slide-3", "slide-2"]]);
    expect(selected).toEqual([]);
  });

  it("keeps the insertion gap aligned with the pointer inside an offset host", () => {
    const reordered: string[][] = [];
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        hostOrigin={{ left: 500, top: 70 }}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 580,
          offsetTop: 170,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={(ids) => reordered.push(ids)}
      />,
    );

    const handle = screen.getByRole("button", {
      name: "选择或拖动 Slide 1",
    });
    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 600,
      clientY: 180,
      pointerId: 12,
    });
    fireEvent.pointerMove(handle, {
      clientX: 610,
      clientY: 180,
      pointerId: 12,
    });
    expect(document.querySelector(".canvas-slide-insertion-line")).toBeNull();

    fireEvent.pointerMove(handle, {
      clientX: 1000,
      clientY: 180,
      pointerId: 12,
    });
    expect(document.querySelector(".canvas-slide-insertion-line")).toHaveStyle({
      left: "548px",
    });
    fireEvent.pointerUp(handle, {
      clientX: 1000,
      clientY: 180,
      pointerId: 12,
    });

    expect(reordered).toEqual([["slide-2", "slide-1", "slide-3"]]);
  });

  it("keeps the leading insertion line half a Slide gap from the first Slide", () => {
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 0,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={() => undefined}
      />,
    );

    const handle = screen.getByRole("button", {
      name: "选择或拖动 Slide 3",
    });
    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 500,
      clientY: 10,
      pointerId: 13,
    });
    fireEvent.pointerMove(handle, {
      clientX: 0,
      clientY: 10,
      pointerId: 13,
    });

    expect(document.querySelector(".canvas-slide-insertion-line")).toHaveStyle({
      left: "-12px",
    });
  });

  it("keeps the trailing insertion line half a Slide gap from the last Slide", () => {
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 0,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={() => undefined}
      />,
    );

    const handle = screen.getByRole("button", {
      name: "选择或拖动 Slide 1",
    });
    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 20,
      clientY: 10,
      pointerId: 14,
    });
    fireEvent.pointerMove(handle, {
      clientX: 800,
      clientY: 10,
      pointerId: 14,
    });

    expect(document.querySelector(".canvas-slide-insertion-line")).toHaveStyle({
      left: "708px",
    });
  });

  it("does not show an insertion line for the Slide's original slot", () => {
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 0,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={() => undefined}
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "选择或拖动 Slide 2" }),
      {
        button: 0,
        clientX: 348,
        clientY: 10,
        pointerId: 8,
      },
    );

    expect(document.querySelector(".canvas-slide-insertion-line")).toBeNull();
  });

  it("does not expose drag handles while sorting is disabled", () => {
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 1,
          offsetLeft: 0,
          offsetTop: 0,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={() => undefined}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "选择或拖动 Slide 1" }),
    ).not.toBeInTheDocument();
  });

  it("handles move and release events that arrive before React rerenders", () => {
    const reordered: string[][] = [];
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 0,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={(ids) => reordered.push(ids)}
      />,
    );

    const handle = screen.getByRole("button", {
      name: "选择或拖动 Slide 2",
    });
    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 348,
      clientY: 85,
      pointerId: 11,
    });
    fireEvent.pointerMove(handle, {
      clientX: 700,
      clientY: 85,
      pointerId: 11,
    });
    fireEvent.pointerUp(handle, {
      clientX: 700,
      clientY: 85,
      pointerId: 11,
    });

    expect(reordered).toEqual([["slide-1", "slide-3", "slide-2"]]);
    expect(document.querySelector(".canvas-slide-drag-preview")).toBeNull();
  });

  it("drops into the displayed slot when the release coordinate jitters", () => {
    const reordered: string[][] = [];
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 0,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={(ids) => reordered.push(ids)}
      />,
    );

    const handle = screen.getByRole("button", {
      name: "选择或拖动 Slide 2",
    });
    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 348,
      clientY: 85,
      pointerId: 15,
    });
    fireEvent.pointerMove(handle, {
      clientX: 700,
      clientY: 85,
      pointerId: 15,
    });
    expect(document.querySelector(".canvas-slide-insertion-line")).toBeTruthy();

    fireEvent.pointerUp(handle, {
      clientX: 348,
      clientY: 85,
      pointerId: 15,
    });

    expect(reordered).toEqual([["slide-1", "slide-3", "slide-2"]]);
  });

  it("finishes the drag when move and release leave the source handle", () => {
    const reordered: string[][] = [];
    render(
      <CanvasSlideSorter
        {...defaultSelectionProps}
        disabled={false}
        slides={slides}
        viewport={{
          scrollX: 0,
          scrollY: 0,
          zoom: 0.2,
          offsetLeft: 0,
          offsetTop: 0,
        }}
        onAutoPan={() => undefined}
        onPreview={async () => null}
        onReorder={(ids) => reordered.push(ids)}
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "选择或拖动 Slide 2" }),
      {
        button: 0,
        clientX: 348,
        clientY: 85,
        pointerId: 16,
      },
    );
    fireEvent.pointerMove(window, {
      clientX: 700,
      clientY: 85,
      pointerId: 16,
    });
    expect(document.querySelector(".canvas-slide-insertion-line")).toBeTruthy();

    fireEvent.pointerUp(window, {
      clientX: 348,
      clientY: 85,
      pointerId: 16,
    });

    expect(reordered).toEqual([["slide-1", "slide-3", "slide-2"]]);
  });
});
