import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicPath = join(__dirname, '../public');

// Theme colors
const themeColor = { r: 118, g: 218, b: 218 };
const darkGreen = { r: 22, g: 163, b: 74 };
const white = { r: 255, g: 255, b: 255 };
const neutralBg = { r: 250, g: 250, b: 250 };

async function generateScreenshots() {
  console.log('Generating PWA screenshots...');

  // Mobile screenshot (390x844 - iPhone 13/14/15 size)
  const mobileWidth = 390;
  const mobileHeight = 844;

  await sharp({
    create: {
      width: mobileWidth,
      height: mobileHeight,
      channels: 4,
      background: neutralBg,
    },
  })
    .composite([
      // Header bar with theme color
      {
        input: await sharp({
          create: {
            width: mobileWidth,
            height: 80,
            channels: 4,
            background: white,
          },
        })
          .png()
          .toBuffer(),
        top: 0,
        left: 0,
      },
      // Main content area placeholder
      {
        input: await sharp({
          create: {
            width: mobileWidth - 48,
            height: 500,
            channels: 4,
            background: white,
          },
        })
          .png()
          .toBuffer(),
        top: 120,
        left: 24,
      },
      // Bottom accent
      {
        input: await sharp({
          create: {
            width: 200,
            height: 60,
            channels: 4,
            background: darkGreen,
          },
        })
          .png()
          .toBuffer(),
        top: mobileHeight - 120,
        left: (mobileWidth - 200) / 2,
      },
    ])
    .png()
    .toFile(join(publicPath, 'screenshot-mobile.png'));

  console.log(`✓ Generated screenshot-mobile.png (${mobileWidth}x${mobileHeight})`);

  // Desktop screenshot (1920x1080 - standard desktop size)
  const desktopWidth = 1920;
  const desktopHeight = 1080;

  await sharp({
    create: {
      width: desktopWidth,
      height: desktopHeight,
      channels: 4,
      background: neutralBg,
    },
  })
    .composite([
      // Header bar
      {
        input: await sharp({
          create: {
            width: desktopWidth,
            height: 100,
            channels: 4,
            background: white,
          },
        })
          .png()
          .toBuffer(),
        top: 0,
        left: 0,
      },
      // Main content area
      {
        input: await sharp({
          create: {
            width: 1200,
            height: 800,
            channels: 4,
            background: white,
          },
        })
          .png()
          .toBuffer(),
        top: 150,
        left: (desktopWidth - 1200) / 2,
      },
      // Accent elements
      {
        input: await sharp({
          create: {
            width: 400,
            height: 80,
            channels: 4,
            background: darkGreen,
          },
        })
          .png()
          .toBuffer(),
        top: 200,
        left: (desktopWidth - 400) / 2,
      },
      {
        input: await sharp({
          create: {
            width: 600,
            height: 60,
            channels: 4,
            background: themeColor,
          },
        })
          .png()
          .toBuffer(),
        top: 350,
        left: (desktopWidth - 600) / 2,
      },
    ])
    .png()
    .toFile(join(publicPath, 'screenshot-desktop.png'));

  console.log(`✓ Generated screenshot-desktop.png (${desktopWidth}x${desktopHeight})`);

  console.log('✓ All screenshots generated successfully!');
  console.log('\n💡 Tip: Replace these placeholder screenshots with actual app screenshots for better user experience.');
}

generateScreenshots().catch(console.error);
