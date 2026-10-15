import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";

import { AvatarValidationError, processAvatar, processLogo } from "./avatar-image";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#3366cc" } });

describe("processAvatar", () => {
  it("accepts JPEG, PNG, and WebP and re-encodes to a 512×512 WebP", async () => {
    for (const encode of [
      (img: Sharp) => img.jpeg(),
      (img: Sharp) => img.png(),
      (img: Sharp) => img.webp(),
    ]) {
      const output = await processAvatar(await encode(solid(800, 600)).toBuffer());
      const meta = await sharp(output).metadata();
      expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
    }
  });

  it("strips EXIF metadata such as GPS location", async () => {
    const withExif = await solid(300, 300)
      .jpeg()
      .withExif({ IFD0: { Artist: "Secret Person" }, IFD3: { GPSLatitudeRef: "N" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const output = await processAvatar(withExif);
    const meta = await sharp(output).metadata();
    expect(meta.exif).toBeUndefined();
    expect(output.includes(Buffer.from("Secret Person"))).toBe(false);
  });

  it("rejects files whose contents are not an image, whatever their name claims", async () => {
    const fakes = [
      Buffer.from("<html><script>alert(1)</script></html>"),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      Buffer.from("%PDF-1.7 fake pdf"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]), // PNG magic, then junk
    ];
    for (const fake of fakes) {
      await expect(processAvatar(fake)).rejects.toThrow(AvatarValidationError);
    }
  });

  it("rejects GIF even though it is a real image", async () => {
    const gif = await solid(100, 100).gif().toBuffer();
    await expect(processAvatar(gif)).rejects.toThrow(/JPEG, PNG, or WebP/);
  });

  it("rejects empty and oversized files before decoding", async () => {
    await expect(processAvatar(new Uint8Array())).rejects.toThrow(/Choose an image/);
    await expect(processAvatar(new Uint8Array(2 * 1024 * 1024 + 1))).rejects.toThrow(
      /larger than 2 MB/,
    );
  });

  it("enforces minimum and maximum dimensions", async () => {
    await expect(processAvatar(await solid(40, 40).png().toBuffer())).rejects.toThrow(/too small/);
    const huge = await sharp({
      create: { width: 6500, height: 100, channels: 3, background: "#000" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(processAvatar(huge)).rejects.toThrow(/too large/);
  });
});

describe("processLogo", () => {
  it("keeps the aspect ratio and transparency, fitting within 512 px", async () => {
    const wide = await sharp({
      create: { width: 1200, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const meta = await sharp(await processLogo(wide)).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 171, hasAlpha: true });
  });

  it("does not enlarge small logos and still rejects disguised files", async () => {
    const small = await solid(100, 60).png().toBuffer();
    expect(await sharp(await processLogo(small)).metadata()).toMatchObject({
      width: 100,
      height: 60,
    });
    await expect(processLogo(Buffer.from("<svg onload=alert(1)>"))).rejects.toThrow(
      AvatarValidationError,
    );
  });
});
