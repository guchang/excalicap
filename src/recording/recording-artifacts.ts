export interface RecordingFileNames {
  readonly composite: string;
  readonly materials: string;
  readonly whiteboard: string;
  readonly camera: string;
  readonly audio: string;
}

export interface ZipEntry {
  readonly name: string;
  readonly blob: Blob;
}

function timestamp(now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function mediaExtension(type: string) {
  if (type.startsWith("audio/mp4")) {
    return "m4a";
  }
  if (type.includes("mp4")) {
    return "mp4";
  }
  return "webm";
}

function projectBaseName(fileName: string | null) {
  const withoutExtension = (fileName ?? "Excalicap").replace(/\.[^.]+$/, "");
  return (
    withoutExtension
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/-$/, "")
      .trim() || "Excalicap"
  );
}

export function createRecordingFileNames(
  projectFileName: string | null,
  compositeType: string,
  videoType: string,
  audioType: string,
  now = new Date(),
): RecordingFileNames {
  const base = projectBaseName(projectFileName);
  const stamp = timestamp(now);
  return {
    composite: `${base}-合成成片-${stamp}.${mediaExtension(compositeType)}`,
    materials: `${base}-原始素材-${stamp}.zip`,
    whiteboard: `${base}-白板激光笔-${stamp}.${mediaExtension(videoType)}`,
    camera: `${base}-摄像头-${stamp}.${mediaExtension(videoType)}`,
    audio: `${base}-声音-${stamp}.${mediaExtension(audioType)}`,
  };
}

function updateCrc32(crc: number, bytes: Uint8Array) {
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc;
}

async function crc32(blob: Blob) {
  let crc = 0xffffffff;
  if (typeof blob.stream !== "function") {
    crc = updateCrc32(crc, new Uint8Array(await blob.arrayBuffer()));
    return (crc ^ 0xffffffff) >>> 0;
  }
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return (crc ^ 0xffffffff) >>> 0;
    }
    crc = updateCrc32(crc, value);
  }
}

function uint16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value: number) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

export async function createStoredZip(entries: readonly ZipEntry[]) {
  const zip32Max = 0xffffffff;
  if (entries.length > 0xffff) {
    throw new Error("原始素材文件数量超过 ZIP32 限制");
  }
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.blob.size;
    if (size > zip32Max || offset + 30 + name.byteLength + size > zip32Max) {
      throw new Error("原始素材超过 4 GiB，当前版本无法生成 ZIP");
    }
    const checksum = await crc32(entry.blob);
    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      ...uint16(20),
      ...uint16(0x0800),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(checksum),
      ...uint32(size),
      ...uint32(size),
      ...uint16(name.byteLength),
      ...uint16(0),
    ]);
    localParts.push(localHeader, name, entry.blob);

    const centralHeader = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,
      ...uint16(20),
      ...uint16(20),
      ...uint16(0x0800),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(checksum),
      ...uint32(size),
      ...uint32(size),
      ...uint16(name.byteLength),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
    ]);
    centralParts.push(centralHeader, name);
    offset += localHeader.byteLength + name.byteLength + size;
  }

  const centralSize = centralParts.reduce(
    (size, part) => size + (part instanceof Uint8Array ? part.byteLength : 0),
    0,
  );
  if (centralSize > zip32Max || offset + centralSize > zip32Max) {
    throw new Error("原始素材超过 4 GiB，当前版本无法生成 ZIP");
  }
  const end = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    ...uint16(0),
    ...uint16(0),
    ...uint16(entries.length),
    ...uint16(entries.length),
    ...uint32(centralSize),
    ...uint32(offset),
    ...uint16(0),
  ]);
  return new Blob([...localParts, ...centralParts, end], {
    type: "application/zip",
  });
}
