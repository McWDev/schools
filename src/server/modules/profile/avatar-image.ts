import "server-only";

import sharp, { type Metadata } from "sharp";

export const AVATAR_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  minDimension: 64,
  maxDimension: 6000,
  outputSize: 512,
  /** Formats accepted after decoding the actual bytes. SVG, GIF, HEIC, etc. are rejected. */
  formats: ["jpeg", "png", "webp"] as const,
} as const;

export class AvatarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarValidationError";
  }
}

// limitInputPixels guards against decompression bombs; failOn rejects corrupt data.
const SHARP_OPTIONS = { limitInputPixels: 40_000_000, failOn: "error" as const };

/**
 * Decode an upload by its real contents (never the filename or MIME header) and check format,
 * size, dimensions, and animation. Throws AvatarValidationError with a user-safe message.
 */
async function validateImage(input: Uint8Array, minDimension: number): Promise<void> {
  if (input.byteLength === 0) throw new AvatarValidationError("Choose an image file to upload.");
  if (input.byteLength > AVATAR_LIMITS.maxBytes) {
    throw new AvatarValidationError("The image is larger than 2 MB. Choose a smaller file.");
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input, SHARP_OPTIONS).metadata();
  } catch {
    throw new AvatarValidationError("This file is not a supported image. Use JPEG, PNG, or WebP.");
  }

  const format = metadata.format as string | undefined;
  if (!format || !(AVATAR_LIMITS.formats as readonly string[]).includes(format)) {
    throw new AvatarValidationError("This file is not a supported image. Use JPEG, PNG, or WebP.");
  }
  const { width = 0, height = 0 } = metadata;
  if (width < minDimension || height < minDimension) {
    throw new AvatarValidationError(
      `The image is too small. Use at least ${minDimension} × ${minDimension} pixels.`,
    );
  }
  if (width > AVATAR_LIMITS.maxDimension || height > AVATAR_LIMITS.maxDimension) {
    throw new AvatarValidationError("The image is too large. Use at most 6000 × 6000 pixels.");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new AvatarValidationError("Animated images are not supported.");
  }
}

async function encode(pipeline: () => Promise<Buffer>): Promise<Buffer> {
  try {
    return await pipeline();
  } catch {
    throw new AvatarValidationError("This image could not be processed. Try a different file.");
  }
}

/**
 * Profile photo: validated, then re-encoded to a 512×512 WebP. Re-encoding drops all metadata,
 * including EXIF GPS location, and neutralizes anything hidden in the original file.
 */
export async function processAvatar(input: Uint8Array): Promise<Buffer> {
  await validateImage(input, AVATAR_LIMITS.minDimension);
  return encode(() =>
    sharp(input, SHARP_OPTIONS)
      .rotate() // apply EXIF orientation before metadata is discarded
      .resize(AVATAR_LIMITS.outputSize, AVATAR_LIMITS.outputSize, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer(),
  );
}

/**
 * School logo: validated the same way, but keeps its aspect ratio and transparency, fitted
 * within 512×512 without enlarging small logos.
 */
export async function processLogo(input: Uint8Array): Promise<Buffer> {
  await validateImage(input, 32);
  return encode(() =>
    sharp(input, SHARP_OPTIONS)
      .rotate()
      .resize(AVATAR_LIMITS.outputSize, AVATAR_LIMITS.outputSize, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer(),
  );
}
