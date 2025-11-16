import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, '../public/bubblelist.svg');
const publicPath = join(__dirname, '../public');

const svgBuffer = readFileSync(svgPath);

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

async function generateIcons() {
  console.log('Generating PWA icons...');

  for (const { name, size } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(publicPath, name));
    console.log(`✓ Generated ${name} (${size}x${size})`);
  }

  // Generate maskable icons with padding
  for (const size of [192, 512]) {
    const name = `icon-${size}-maskable.png`;
    // Maskable icons need safe zone padding (80% of total size for content)
    const contentSize = Math.floor(size * 0.8);
    const padding = Math.floor((size - contentSize) / 2);

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 118, g: 218, b: 218, alpha: 1 }, // theme color
      },
    })
      .composite([
        {
          input: await sharp(svgBuffer).resize(contentSize, contentSize).png().toBuffer(),
          top: padding,
          left: padding,
        },
      ])
      .png()
      .toFile(join(publicPath, name));
    console.log(`✓ Generated ${name} (${size}x${size} maskable)`);
  }

  console.log('✓ All icons generated successfully!');
}

generateIcons().catch(console.error);
