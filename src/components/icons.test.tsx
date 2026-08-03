import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./icons";

describe("source-matched product icons", () => {
  it("renders the original settings icon as a circle and gear outline", () => {
    const { container } = render(<Icon name="settings" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("fill", "none");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect(svg?.querySelector("circle")).toHaveAttribute("r", "3");
    expect(svg?.querySelector("path")).toHaveAttribute(
      "d",
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
    );
  });

  it("renders the original file-text teleprompter icon", () => {
    const { container } = render(<Icon name="script" />);
    const svg = container.querySelector("svg");

    expect(svg?.querySelectorAll("path")).toHaveLength(1);
    expect(svg?.querySelectorAll("polyline")).toHaveLength(1);
    expect(svg?.querySelectorAll("line")).toHaveLength(3);
    expect(svg?.querySelector("path")).toHaveAttribute(
      "d",
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    );
  });

  it("renders the original Excalidraw open-book library icon", () => {
    const { container } = render(<Icon name="library" />);
    const svg = container.querySelector("svg");

    expect(svg?.querySelectorAll("path")).toHaveLength(3);
    expect(svg?.querySelectorAll("line")).toHaveLength(3);
    expect(svg?.querySelectorAll("path")[1]).toHaveAttribute(
      "d",
      "M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0",
    );
  });

  it("uses the original compact plus and delete marks in the slide rail", () => {
    const plus = render(<Icon name="plus" />).container.querySelector("svg");
    const remove = render(<Icon name="delete" />).container.querySelector("svg");

    expect(plus).toHaveAttribute("viewBox", "0 0 14 14");
    expect(plus?.querySelectorAll("line")).toHaveLength(2);
    expect(remove).toHaveAttribute("viewBox", "0 0 8 8");
    expect(remove?.querySelectorAll("line")).toHaveLength(2);
  });
});
