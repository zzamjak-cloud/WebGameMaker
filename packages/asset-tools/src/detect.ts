export type DetectedImageFormat = "png" | "jpg" | "webp" | "svg";

export interface DetectedImage {
  format: DetectedImageFormat;
  mimeType: string;
  extension: string;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class AssetFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetFormatError";
  }
}

/** 파일 signature와 MIME 기대값을 교차 검사한다. */
export function detectImageFormat(bytes: Uint8Array): DetectedImage {
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(PNG)) {
    return { format: "png", mimeType: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { format: "jpg", mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return { format: "webp", mimeType: "image/webp", extension: "webp" };
  }

  const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512)))
    .toString("utf8")
    .trimStart()
    .toLowerCase();
  if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) {
    return { format: "svg", mimeType: "image/svg+xml", extension: "svg" };
  }

  throw new AssetFormatError("지원하지 않는 이미지 형식이거나 signature가 일치하지 않습니다.");
}

export function assertMimeMatchesFormat(
  mimeType: string,
  format: DetectedImageFormat,
): void {
  const expected: Record<DetectedImageFormat, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  if (mimeType !== expected[format]) {
    throw new AssetFormatError(
      `MIME(${mimeType})과 signature(${format})가 일치하지 않습니다.`,
    );
  }
}
