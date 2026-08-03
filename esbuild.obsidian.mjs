import * as esbuild from "esbuild";
import { copyFile, cp, mkdir, rename } from "node:fs/promises";

const production = process.argv[2] === "production";
const result = await esbuild.build({
  entryPoints: { main: "src/obsidian/main.tsx" },
  bundle: true,
  conditions: [production ? "production" : "development"],
  external: ["obsidian", "electron"],
  format: "cjs",
  platform: "browser",
  target: "es2022",
  outdir: "obsidian-dist",
  entryNames: "[name]",
  assetNames: "assets/[name]-[hash]",
  loader: { ".woff2": "dataurl" },
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "info",
});

if (result.errors.length === 0) {
  await rename("obsidian-dist/main.css", "obsidian-dist/styles.css");
  await copyFile("manifest.json", "obsidian-dist/manifest.json");
  await mkdir("obsidian-dist/excalidraw-assets", { recursive: true });
  await cp(
    "public/excalidraw-assets/fonts",
    "obsidian-dist/excalidraw-assets/fonts",
    { recursive: true, force: true },
  );
}
