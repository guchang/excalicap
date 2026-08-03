import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const installStyles = () => {
  const hostStyles = document.createElement("style");
  hostStyles.textContent = `
    .obsidian-host button {
      border: 2px solid #111 !important;
      background-color: #222 !important;
      background-image: linear-gradient(#222, #000) !important;
      box-shadow: 0 2px 8px #000 !important;
      color: #fff !important;
    }
  `;
  document.head.append(hostStyles);

  const startMarker = "/* Obsidian product button isolation: start */";
  const endMarker = "/* Obsidian product button isolation: end */";
  const start = styles.indexOf(startMarker);
  const end = styles.indexOf(endMarker);
  if (start === -1 || end === -1) {
    throw new Error("Missing Obsidian product button isolation styles");
  }
  const appStyles = document.createElement("style");
  appStyles.textContent = styles.slice(start, end + endMarker.length);
  document.head.append(appStyles);
};

const renderButtons = (theme: "light" | "dark") => {
  document.body.innerHTML = `
    <div class="obsidian-host excalicap-obsidian-view">
      <main class="product-shell" data-theme="${theme}">
        <button class="result-close" data-testid="result-close">返回白板</button>
        <button class="secondary-action" data-testid="secondary">取消</button>
        <button class="primary-action" data-testid="primary">保存</button>
        <button class="settings-dialog-close" data-testid="dialog-close">关闭</button>
        <div class="slide-delete-actions">
          <button data-testid="delete-cancel">取消</button>
          <button class="slide-delete-confirm" data-testid="delete-confirm">删除</button>
        </div>
        <div class="preparation-device-actions">
          <button data-testid="device-action">更换设备</button>
        </div>
        <div class="background-swatches">
          <button
            data-testid="background-swatch"
            style="--excalicap-swatch-background: #ffffff"
          ></button>
        </div>
        <button
          class="teleprompter-resize-handle"
          data-testid="teleprompter-resize"
        ></button>
      </main>
    </div>
  `;
};

const colorsOf = (testId: string) => {
  const element = document.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (!element) {
    throw new Error(`Missing fixture button: ${testId}`);
  }
  const style = getComputedStyle(element);
  return {
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    borderColor: style.borderColor,
    boxShadow: style.boxShadow,
    color: style.color,
  };
};

const customPropertyOf = (testId: string, property: string) => {
  const element = document.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (!element) {
    throw new Error(`Missing fixture button: ${testId}`);
  }
  return getComputedStyle(element).getPropertyValue(property).trim();
};

describe("Obsidian product button styling", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    installStyles();
  });

  it("preserves the browser light-theme button palette", () => {
    renderButtons("light");

    expect(colorsOf("result-close")).toMatchObject({
      backgroundColor: "rgb(240, 240, 243)",
      backgroundImage: "none",
      borderColor: "rgba(0, 0, 0, 0)",
      boxShadow: "none",
      color: "rgb(69, 72, 82)",
    });
    expect(colorsOf("primary")).toMatchObject({
      backgroundColor: "rgb(105, 101, 219)",
      color: "rgb(255, 255, 255)",
    });
    expect(colorsOf("dialog-close")).toMatchObject({
      backgroundColor: "rgb(244, 244, 246)",
      color: "rgb(85, 88, 101)",
    });
    expect(colorsOf("delete-confirm")).toMatchObject({
      backgroundColor: "rgb(197, 44, 58)",
      color: "rgb(255, 255, 255)",
    });
    expect(colorsOf("device-action")).toMatchObject({
      backgroundColor: "rgb(255, 255, 255)",
      color: "rgb(85, 89, 101)",
    });
    expect(colorsOf("background-swatch")).toMatchObject({
      backgroundImage: "none",
      borderColor: "rgb(255, 255, 255)",
    });
    expect(
      customPropertyOf(
        "background-swatch",
        "--excalicap-swatch-background",
      ),
    ).toBe("#ffffff");
    expect(colorsOf("teleprompter-resize")).toMatchObject({
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderColor: "rgba(0, 0, 0, 0)",
      boxShadow: "none",
    });
    expect(colorsOf("teleprompter-resize").backgroundImage).not.toBe(
      "linear-gradient(rgb(34, 34, 34), rgb(0, 0, 0))",
    );
  });

  it("preserves the browser dark-theme neutral button palette", () => {
    renderButtons("dark");

    expect(colorsOf("result-close")).toMatchObject({
      backgroundColor: "rgb(55, 55, 62)",
      color: "rgb(225, 225, 230)",
    });
    expect(colorsOf("secondary")).toMatchObject({
      backgroundColor: "rgb(55, 55, 62)",
      color: "rgb(225, 225, 230)",
    });
  });
});
