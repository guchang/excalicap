import { describe, expect, it } from "vitest";
import { patchExcalidrawJavaScript } from "./patch-excalidraw-presentation-fonts.mjs";

describe("patchExcalidrawJavaScript", () => {
  it("adds a font-size imperative API and replaces the four base presets", () => {
    const source = `
      const actionChangeFontSize = register({ name: "changeFontSize" });
      const api = {
        updateScene: this.updateScene,
        registerAction: (action) => {
          this.actionManager.registerAction(action);
        },
      };
      const nextElements = elements.map((el) => {
        if (appState.selectedElementIds[el.id]) {
          if (el.frameId && framesToBeDeleted.has(el.frameId)) {
            shouldSelectEditingGroup = false;
            selectedElementIds[el.id] = true;
            return el;
          }
          return newElementWith(el, { isDeleted: true });
        }
        if (el.frameId && framesToBeDeleted.has(el.frameId)) {
          shouldSelectEditingGroup = false;
          if (!isBoundToContainer(el)) {
            selectedElementIds[el.id] = true;
          }
          return newElementWith(el, { frameId: null });
        }
        return el;
      });
      options: [
        { value: 16, testId: "fontSize-small" },
        { value: 20, testId: "fontSize-medium" },
        { value: 28, testId: "fontSize-large" },
        { value: 36, testId: "fontSize-veryLarge" }
      ]
    `;

    const patched = patchExcalidrawJavaScript(source);

    expect(patched).toContain("setFontSize: (fontSize) =>");
    expect(patched).toContain("executeAction(actionChangeFontSize");
    expect(patched).toContain('value: 48, testId: "fontSize-medium"');
    expect(patched).toContain('value: 88, testId: "fontSize-veryLarge"');
    expect(patched).not.toContain("return el;\n          }");
    expect(patched).not.toContain("{ frameId: null }");
    expect(patched.match(/newElementWith\(el, \{ isDeleted: true \}\)/g)).toHaveLength(
      3,
    );
  });

  it("keeps Frame children inside the native delete and cut transaction in production", () => {
    const source = `
      var oC=(e,o,t)=>{let r=new Set,n={},l=!0,s=e.map(m=>{if(o.selectedElementIds[m.id]){return m.frameId&&r.has(m.frameId)?(l=!1,n[m.id]=!0,m):q(m,{isDeleted:!0})}return m.frameId&&r.has(m.frameId)?(l=!1,qe(m)||(n[m.id]=!0),q(m,{frameId:null})):m})};
      const actionChangeFontSize=register({name:"changeFontSize"});
      const api={registerAction:e=>{this.actionManager.registerAction(e)},};
      const options=[{value:16,testId:"fontSize-small"},{value:20,testId:"fontSize-medium"},{value:28,testId:"fontSize-large"},{value:36,testId:"fontSize-veryLarge"}];
    `;

    const patched = patchExcalidrawJavaScript(source);

    expect(patched).not.toContain("n[m.id]=!0,m)");
    expect(patched).not.toContain("q(m,{frameId:null})");
    expect(patched.match(/q\(m,\{isDeleted:!0\}\)/g)).toHaveLength(3);
  });
});
