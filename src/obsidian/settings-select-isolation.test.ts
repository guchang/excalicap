import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const renderSettingsSelect = (theme: "light" | "dark" = "light") => {
  document.head.innerHTML = `
    <style>
      .obsidian-host select {
        appearance: auto !important;
        height: 22px !important;
        min-height: 22px !important;
        padding: 0 4px !important;
        border-radius: 2px !important;
        background-image: none !important;
      }
    </style>
    <style>${styles}</style>
  `;
  document.body.innerHTML = `
    <div class="obsidian-host excalicap-obsidian-view">
      <div class="product-shell" data-theme="${theme}">
        <form class="settings-form">
          <label>
            <span>摄像头设备</span>
            <select aria-label="摄像头设备"><option>系统默认</option></select>
          </label>
        </form>
      </div>
    </div>
  `;

  const select = document.querySelector("select");
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("Missing settings select fixture");
  }
  return getComputedStyle(select);
};

describe("Obsidian settings select isolation", () => {
  it("keeps the recording settings select at the intended control size", () => {
    const style = renderSettingsSelect();

    expect(style.height).toBe("40px");
    expect(style.minHeight).toBe("40px");
    expect(style.paddingRight).toBe("36px");
    expect(style.borderRadius).toBe("9px");
  });

  it("renders an explicit dropdown arrow instead of inheriting the host select", () => {
    const style = renderSettingsSelect("dark");

    expect(style.appearance).toBe("none");
    expect(style.backgroundImage).not.toBe("none");
    // jsdom does not compute the valid three-value background position syntax.
    expect(styles).toContain(
      "background-position: right 12px center !important;",
    );
  });
});
