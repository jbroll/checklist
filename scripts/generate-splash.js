import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPLASH_WIDTH = 2732;
const SPLASH_HEIGHT = 2732;
const ICON_SIZE = 512;
const BG_COLOR = '#76daDA';

async function generateSplash() {
  const iconPath = path.join(__dirname, '..', 'public', 'icon-512.png');
  const outputPath = path.join(__dirname, '..', 'resources', 'splash.png');
  
  // Create a splash screen with centered icon
  const background = sharp({
    create: {
      width: SPLASH_WIDTH,
      height: SPLASH_HEIGHT,
      channels: 3,
      background: BG_COLOR,
    },
  });

  // Resize icon and composite onto background
  const icon = await sharp(iconPath)
    .resize(ICON_SIZE, ICON_SIZE)
    .toBuffer();

  await background
    .composite([
      {
        input: icon,
        top: Math.round((SPLASH_HEIGHT - ICON_SIZE) / 2),
        left: Math.round((SPLASH_WIDTH - ICON_SIZE) / 2),
      },
    ])
    .png()
    .toFile(outputPath);

  console.log('Splash screen generated:', outputPath);
}

generateSplash().catch(console.error);
