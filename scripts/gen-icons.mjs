// Renders public/logo-mark.svg into the full favicon / PWA icon set.
import { readFile } from "fs/promises";
import sharp from "sharp";

const svg = await readFile("public/logo-mark.svg");

const targets = [
  ["src/app/icon.png", 32],
  ["src/app/apple-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
];

for (const [out, size] of targets) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("wrote", out, size + "x" + size);
}
