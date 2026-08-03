import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const installStyles = () => {
  const hostStyles = document.createElement("style");
  hostStyles.textContent = `
    .obsidian-host button,
    .obsidian-host a {
      width: 18px !important;
      height: 18px !important;
      font-size: 8px !important;
    }
  `;
  document.head.append(hostStyles);

  const startMarker = "/* Obsidian Excalidraw control sizing: start */";
  const endMarker = "/* Obsidian Excalidraw control sizing: end */";
  const start = styles.indexOf(startMarker);
  const end = styles.indexOf(endMarker);
  if (start === -1 || end === -1) {
    throw new Error("Missing Obsidian Excalidraw control sizing styles");
  }
  const appStyles = document.createElement("style");
  appStyles.textContent = styles.slice(start, end + endMarker.length);
  document.head.append(appStyles);
};

const renderControls = (wrapperClass: string) => {
  document.body.innerHTML = `
    <div class="obsidian-host ${wrapperClass}">
      <div class="excalidraw">
        <div class="App-toolbar-container">
          <button class="ToolIcon__icon" data-testid="toolbar-more"><svg /></button>
          <button
            class="dropdown-menu-button App-toolbar__extra-tools-trigger"
            data-testid="toolbar-extra-tools"
          ><svg /></button>
        </div>
        <div class="default-sidebar">
          <div class="sidebar-triggers">
            <button class="sidebar-tab-trigger" data-testid="library-tab"><svg /></button>
          </div>
          <div class="sidebar__header__buttons">
            <button data-testid="library-header-action"><svg /></button>
          </div>
        </div>
        <div class="layer-ui__library">
          <div class="library-menu-dropdown-container">
            <button class="dropdown-menu-button" data-testid="library-import-menu"><svg /></button>
          </div>
          <a class="library-menu-browse-button" data-testid="library-browse">浏览素材库</a>
        </div>
      </div>
    </div>
  `;
};

const sizeOf = (testId: string) => {
  const element = document.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (!element) {
    throw new Error(`Missing fixture element: ${testId}`);
  }
  const style = getComputedStyle(element);
  return {
    fontSize: style.fontSize,
    height: style.height,
    width: style.width,
  };
};

const iconSizeOf = (testId: string) => {
  const icon = document.querySelector<SVGElement>(
    `[data-testid="${testId}"] svg`,
  );
  if (!icon) {
    throw new Error(`Missing fixture icon: ${testId}`);
  }
  const style = getComputedStyle(icon);
  return { height: style.height, width: style.width };
};

describe("Obsidian Excalidraw control sizing", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    installStyles();
  });

  it("keeps toolbar and library controls comfortably clickable", () => {
    renderControls("excalicap-obsidian-view");

    expect(sizeOf("toolbar-more")).toMatchObject({
      height: "36px",
      width: "36px",
    });
    expect(sizeOf("library-tab")).toMatchObject({
      height: "36px",
      width: "36px",
    });
    expect(sizeOf("library-header-action")).toMatchObject({
      height: "36px",
      width: "36px",
    });
    expect(sizeOf("toolbar-extra-tools")).toMatchObject({
      height: "36px",
      width: "36px",
    });
    expect(sizeOf("library-import-menu")).toMatchObject({
      height: "36px",
      width: "36px",
    });
    expect(sizeOf("library-browse")).toMatchObject({
      fontSize: "12px",
      height: "36px",
    });
    expect(iconSizeOf("toolbar-more")).toEqual({
      height: "16px",
      width: "16px",
    });
    expect(iconSizeOf("library-header-action")).toEqual({
      height: "16px",
      width: "16px",
    });
    expect(iconSizeOf("toolbar-extra-tools")).toEqual({
      height: "16px",
      width: "16px",
    });
    expect(iconSizeOf("library-import-menu")).toEqual({
      height: "16px",
      width: "16px",
    });
  });

  it("does not change Excalidraw controls outside the Obsidian view", () => {
    renderControls("");

    expect(sizeOf("toolbar-more")).toMatchObject({
      height: "18px",
      width: "18px",
    });
    expect(sizeOf("library-browse")).toMatchObject({
      fontSize: "8px",
      height: "18px",
    });
  });
});
