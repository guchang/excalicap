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

    .obsidian-host .library-menu-control-buttons {
      display: flex;
      flex-direction: column;
    }

    .obsidian-host .excalidraw .App-bottom-bar {
      position: absolute;
      inset: 0;
      left: 50%;
      display: flex;
      width: calc(100% - 28px);
      max-width: 450px;
      margin: 0 14px 14px;
      transform: translateX(-50%);
      flex-direction: column;
      justify-content: center;
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
      <div class="excalidraw excalidraw--mobile">
        <div class="App-toolbar-container">
          <button class="ToolIcon__icon" data-testid="toolbar-more"><svg /></button>
          <button
            class="dropdown-menu-button App-toolbar__extra-tools-trigger"
            data-testid="toolbar-extra-tools"
          ><svg><g style="stroke-width: 1.5"><path /></g></svg></button>
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
          <div class="library-menu-control-buttons" data-testid="library-controls">
            <a class="library-menu-browse-button" data-testid="library-browse">浏览素材库</a>
            <div class="library-menu-dropdown-container">
              <button class="dropdown-menu-button" data-testid="library-import-menu">
                <svg><g><circle cx="12" cy="5" r="1" /></g></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="App-bottom-bar" data-testid="mobile-bottom-bar">
          <div class="Island"><footer class="App-toolbar" /></div>
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

const iconDetailOf = (testId: string, selector: string) => {
  const element = document.querySelector<SVGElement>(
    `[data-testid="${testId}"] ${selector}`,
  );
  if (!element) {
    throw new Error(`Missing fixture icon detail: ${testId} ${selector}`);
  }
  const style = getComputedStyle(element);
  return {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
  };
};

const flexDirectionOf = (testId: string) => {
  const element = document.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (!element) {
    throw new Error(`Missing fixture element: ${testId}`);
  }
  return getComputedStyle(element).flexDirection;
};

const layoutOf = (testId: string) => {
  const element = document.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (!element) {
    throw new Error(`Missing fixture element: ${testId}`);
  }
  const style = getComputedStyle(element);
  return {
    flexDirection: style.flexDirection,
    justifyContent: style.justifyContent,
    left: style.left,
    margin: style.margin,
    maxWidth: style.maxWidth,
    right: style.right,
    transform: style.transform,
    width: style.width,
  };
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
      height: "20px",
      width: "20px",
    });
    expect(iconSizeOf("library-import-menu")).toEqual({
      height: "20px",
      width: "20px",
    });
    expect(iconDetailOf("toolbar-extra-tools", "svg g")).toMatchObject({
      strokeWidth: "1.5",
    });
    expect(flexDirectionOf("library-controls")).toBe("row");
    expect(iconDetailOf("library-import-menu", "svg circle")).toMatchObject({
      fill: "rgb(0, 0, 0)",
      stroke: "rgba(0, 0, 0, 0)",
    });
  });

  it("keeps the mobile bottom toolbar inside the Excalicap pane", () => {
    renderControls("excalicap-obsidian-view");

    expect(layoutOf("mobile-bottom-bar")).toEqual({
      flexDirection: "row",
      justifyContent: "flex-start",
      left: "0px",
      margin: "0px",
      maxWidth: "none",
      right: "0px",
      transform: "none",
      width: "100%",
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
    expect(flexDirectionOf("library-controls")).toBe("column");
    expect(layoutOf("mobile-bottom-bar")).toMatchObject({
      flexDirection: "column",
      justifyContent: "center",
      left: "50%",
      maxWidth: "450px",
      transform: "translateX(-50%)",
    });
  });
});
