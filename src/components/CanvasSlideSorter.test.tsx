import { fireEvent, render, screen } from "@testing-library/react";
import { CanvasSlideSorter } from "./CanvasSlideSorter";

const slides = [
  { id: "slide-1", name: "Slide 1", x: 0, y: 0, width: 1080, height: 1440 },
  { id: "slide-2", name: "Slide 2", x: 1200, y: 0, width: 1080, height: 1440 },
  { id: "slide-3", name: "Slide 3", x: 2400, y: 0, width: 1080, height: 1440 },
];

describe("CanvasSlideSorter", () => {
  it("leaves space between a Slide handle and its Frame border", () => {
    render(
      <CanvasSlideSorter
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
      screen.getByRole("button", { name: "拖动 Slide 1 排序" }),
    ).toHaveStyle({ top: "76px" });
  });

  it("positions Slide handles in the product host coordinate space", () => {
    render(
      <CanvasSlideSorter
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
      screen.getByRole("button", { name: "拖动 Slide 1 排序" }),
    ).toHaveStyle({ left: "79px", top: "6px" });
  });

  it("moves a canvas Slide into the indicated horizontal gap", () => {
    const reordered: string[][] = [];
    render(
      <CanvasSlideSorter
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
      name: "拖动 Slide 2 排序",
    });
    expect(handle).toHaveTextContent("Slide 2");
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
  });

  it("keeps the insertion gap aligned with the pointer inside an offset host", () => {
    const reordered: string[][] = [];
    render(
      <CanvasSlideSorter
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
      name: "拖动 Slide 1 排序",
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

  it("does not show an insertion line for the Slide's original slot", () => {
    render(
      <CanvasSlideSorter
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
      screen.getByRole("button", { name: "拖动 Slide 2 排序" }),
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
      screen.queryByRole("button", { name: "拖动 Slide 1 排序" }),
    ).not.toBeInTheDocument();
  });

  it("handles move and release events that arrive before React rerenders", () => {
    const reordered: string[][] = [];
    render(
      <CanvasSlideSorter
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
      name: "拖动 Slide 2 排序",
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
});
