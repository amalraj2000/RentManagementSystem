// Generates iOS launch images (white background, app icon centred) and the maskable Android icon. Run: npx tsx scripts/generate-splash.ts
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { SPLASH_SIZES, splashUrl } from "../src/lib/splash-sizes";

async function main() {
  const icon = "public/icon-512.png";
  mkdirSync("public/splash", { recursive: true });
  for (const [w, h] of SPLASH_SIZES) {
    const size = Math.round(Math.min(w, h) * 0.28);
    const logo = await sharp(icon).resize(size, size).toBuffer();
    await sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } })
      .composite([{ input: logo, gravity: "centre" }])
      .png({ compressionLevel: 9 })
      .toFile(`public${splashUrl(w, h)}`);
  }
  // Maskable icon: full-bleed brand colour with the logo inside the 80% safe zone.
  const { data } = await sharp(icon).extract({ left: 256, top: 30, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const logo = await sharp(icon).resize(380, 380).toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: data[0], g: data[1], b: data[2] } } }).composite([{ input: logo, gravity: "centre" }]).png().toFile("public/icon-maskable-512.png");
  console.log(`Wrote ${SPLASH_SIZES.length} splash images and the maskable icon`);
}
main().catch((e) => { console.error(e); process.exit(1); });
