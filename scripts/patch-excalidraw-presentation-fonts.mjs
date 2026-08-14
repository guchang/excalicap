import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const EXPECTED_VERSION = "0.18.1";
const baseUrl = new URL("../node_modules/@excalidraw/excalidraw/", import.meta.url);
const CASCADE_FRAME_DELETE_MARKER = "excalicap-cascade-frame-delete";

function patchFrameDeletion(source) {
  if (source.includes(CASCADE_FRAME_DELETE_MARKER)) {
    return source;
  }

  const developmentSelectedChild =
    /(if \(el\.frameId && framesToBeDeleted\.has\(el\.frameId\)\) \{\s*shouldSelectEditingGroup = false;\s*selectedElementIds\[el\.id\] = true;)\s*return el;/;
  const developmentDetachedChild =
    "return newElementWith(el, { frameId: null });";
  if (
    developmentSelectedChild.test(source) &&
    source.includes(developmentDetachedChild)
  ) {
    return source
      .replace(
        developmentSelectedChild,
        `$1\n        /* ${CASCADE_FRAME_DELETE_MARKER} */\n        return newElementWith(el, { isDeleted: true });`,
      )
      .replace(
        developmentDetachedChild,
        "return newElementWith(el, { isDeleted: true });",
      );
  }

  const productionSelectedChild =
    "return m.frameId&&r.has(m.frameId)?(l=!1,n[m.id]=!0,m):";
  const productionDetachedChild =
    "return m.frameId&&r.has(m.frameId)?(l=!1,qe(m)||(n[m.id]=!0),q(m,{frameId:null})):";
  if (
    source.includes(productionSelectedChild) &&
    source.includes(productionDetachedChild)
  ) {
    return source
      .replace(
        productionSelectedChild,
        `return/*${CASCADE_FRAME_DELETE_MARKER}*/m.frameId&&r.has(m.frameId)?(l=!1,n[m.id]=!0,q(m,{isDeleted:!0})):`,
      )
      .replace(
        productionDetachedChild,
        "return m.frameId&&r.has(m.frameId)?(l=!1,qe(m)||(n[m.id]=!0),q(m,{isDeleted:!0})):",
      );
  }

  throw new Error("找不到 Excalidraw Frame 删除逻辑");
}

function replacePreset(source, testId, from, to) {
  const pattern = new RegExp(
    `(\\{[^{}]*?value:\\s*)${from}(?=[^{}]*?testId:\\s*"${testId}"[^{}]*?\\})`,
  );
  if (pattern.test(source)) {
    return source.replace(pattern, `$1${to}`);
  }
  if (
    new RegExp(
      `\\{[^{}]*?value:\\s*${to}(?=[^{}]*?testId:\\s*"${testId}"[^{}]*?\\})`,
    ).test(source)
  ) {
    return source;
  }
  throw new Error(`找不到 Excalidraw 字号预设 ${testId}`);
}

function findFontSizeAction(source) {
  return source.match(
    /(?:var\s+)?([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\(\{\s*name:\s*"changeFontSize"/,
  )?.[1];
}

export function patchExcalidrawJavaScript(source) {
  let patched = patchFrameDeletion(source);
  for (const [testId, from, to] of [
    ["fontSize-small", 16, 36],
    ["fontSize-medium", 20, 48],
    ["fontSize-large", 28, 64],
    ["fontSize-veryLarge", 36, 88],
  ]) {
    patched = replacePreset(patched, testId, from, to);
  }

  if (patched.includes("setFontSize:")) {
    return patched;
  }
  const actionName = findFontSizeAction(patched);
  if (!actionName) {
    throw new Error("找不到 Excalidraw changeFontSize action");
  }

  const developmentAnchor =
    /registerAction:\s*\(([A-Za-z_$][\w$]*)\)\s*=>\s*\{\s*this\.actionManager\.registerAction\(\1\);\s*\},/;
  if (developmentAnchor.test(patched)) {
    return patched.replace(
      developmentAnchor,
      (anchor) =>
        `${anchor}\n        setFontSize: (fontSize) => {\n          this.actionManager.executeAction(${actionName}, "api", fontSize);\n        },`,
    );
  }

  const productionAnchor = /registerAction:([A-Za-z_$][\w$]*)=>\{this\.actionManager\.registerAction\(\1\)\},/;
  if (productionAnchor.test(patched)) {
    return patched.replace(
      productionAnchor,
      (anchor) =>
        `${anchor}setFontSize:e=>{this.actionManager.executeAction(${actionName},"api",e)},`,
    );
  }
  throw new Error("找不到 Excalidraw imperative API 注册位置");
}

function patchTypes(source) {
  if (source.includes("setFontSize: (fontSize: number) => void;")) {
    return source;
  }
  const anchor = "    registerAction: (action: Action) => void;";
  if (!source.includes(anchor)) {
    throw new Error("找不到 ExcalidrawImperativeAPI.registerAction 类型");
  }
  return source.replace(
    anchor,
    `${anchor}\n    setFontSize: (fontSize: number) => void;`,
  );
}

async function patchInstalledPackage() {
  const packageJsonPath = fileURLToPath(new URL("package.json", baseUrl));
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (packageJson.version !== EXPECTED_VERSION) {
    throw new Error(
      `Excalidraw 版本为 ${packageJson.version}，预期 ${EXPECTED_VERSION}；请重新审核字号补丁`,
    );
  }

  for (const relativePath of ["dist/dev/index.js", "dist/prod/index.js"]) {
    const path = fileURLToPath(new URL(relativePath, baseUrl));
    const source = await readFile(path, "utf8");
    const patched = patchExcalidrawJavaScript(source);
    if (patched !== source) {
      await writeFile(path, patched);
    }
  }

  const typesPath = fileURLToPath(
    new URL("dist/types/excalidraw/types.d.ts", baseUrl),
  );
  const types = await readFile(typesPath, "utf8");
  const patchedTypes = patchTypes(types);
  if (patchedTypes !== types) {
    await writeFile(typesPath, patchedTypes);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await patchInstalledPackage();
}
