import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL(
    "../node_modules/@excalidraw/excalidraw/dist/prod/fonts",
    import.meta.url,
  ),
);
const target = fileURLToPath(
  new URL("../public/excalidraw-assets/fonts", import.meta.url),
);

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });
