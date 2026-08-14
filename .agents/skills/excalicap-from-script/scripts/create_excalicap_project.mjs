#!/usr/bin/env node

import { randomInt, randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function usage() {
  return [
    "Usage:",
    "  node create_excalicap_project.mjs --output FILE [options]",
    "",
    "Options:",
    "  --slides N       Slide count (default: 3)",
    "  --width PX       Slide width (default: 1080)",
    "  --height PX      Slide height (default: 1440)",
    "  --gap PX         Horizontal gap (default: 120)",
    "  --source URL     Excalidraw source URL (default: local Excalicap)",
  ].join("\n");
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid arguments.\n${usage()}`);
    }
    values.set(key.slice(2), value);
  }
  return values;
}

function positiveInteger(value, fallback, label) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function frameElement(index, width, height, gap) {
  return {
    id: randomUUID(),
    type: "frame",
    x: index * (width + gap),
    y: 0,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: `a${index}`,
    roundness: null,
    seed: randomInt(1, 2_147_483_647),
    version: 1,
    versionNonce: randomInt(1, 2_147_483_647),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: true,
    name: `Slide ${index + 1}`,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const outputArgument = args.get("output");
  if (!outputArgument) {
    throw new Error(`--output is required.\n${usage()}`);
  }

  const output = resolve(outputArgument);
  if (!output.endsWith(".excalidraw")) {
    throw new Error("--output must end with .excalidraw.");
  }
  if (existsSync(output)) {
    throw new Error(`Refusing to overwrite existing file: ${output}`);
  }

  const slides = positiveInteger(args.get("slides"), 3, "slides");
  const width = positiveInteger(args.get("width"), 1080, "width");
  const height = positiveInteger(args.get("height"), 1440, "height");
  const gap = positiveInteger(args.get("gap"), 120, "gap");
  const source = args.get("source") ?? "http://127.0.0.1:5173";
  const elements = Array.from({ length: slides }, (_, index) =>
    frameElement(index, width, height, gap),
  );
  const project = {
    type: "excalidraw",
    version: 2,
    source,
    elements,
    appState: {
      gridSize: 20,
      gridStep: 5,
      gridModeEnabled: false,
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  };

  writeFileSync(output, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({ output, slides, width, height, gap })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
