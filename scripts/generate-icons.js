import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Crisp Vector SVG for Cadastral Parcel Subdivision & Merge App
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="50%" stop-color="#0b132b"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="polyGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.6"/>
    </linearGradient>
    <linearGradient id="polyGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#047857" stop-opacity="0.6"/>
    </linearGradient>
    <linearGradient id="polyGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.65"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background Base -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  
  <!-- Subtle Cadastral Grid Lines -->
  <path d="M 64 0 L 64 512 M 128 0 L 128 512 M 192 0 L 192 512 M 256 0 L 256 512 M 320 0 L 320 512 M 384 0 L 384 512 M 448 0 L 448 512" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1.5"/>
  <path d="M 0 64 L 512 64 M 0 128 L 512 128 M 0 192 L 512 192 M 0 256 L 512 256 M 0 320 L 512 320 M 0 384 L 512 384 M 0 448 L 512 448" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1.5"/>

  <!-- Cadastral Main Boundary Outer Glow Outline -->
  <polygon points="100,140 380,90 430,340 310,430 130,400" fill="none" stroke="#60a5fa" stroke-opacity="0.3" stroke-width="8" filter="url(#glow)"/>

  <!-- Parcel Subdivision 1 (Top / Blue) -->
  <polygon points="100,140 380,90 310,230 110,260" fill="url(#polyGrad1)" stroke="#93c5fd" stroke-width="3.5" stroke-linejoin="round"/>
  
  <!-- Parcel Subdivision 2 (Bottom Left / Emerald) -->
  <polygon points="110,260 310,230 240,418 130,400" fill="url(#polyGrad2)" stroke="#6ee7b7" stroke-width="3.5" stroke-linejoin="round"/>

  <!-- Parcel Subdivision 3 (Bottom Right / Amber) -->
  <polygon points="310,230 380,90 430,340 310,430 240,418" fill="url(#polyGrad3)" stroke="#fcd34d" stroke-width="3.5" stroke-linejoin="round"/>

  <!-- Dynamic Subdivision Cutting Axis Line (Dotted Red / Rose) -->
  <line x1="70" y1="265" x2="450" y2="215" stroke="#f43f5e" stroke-width="4.5" stroke-dasharray="10,8" stroke-linecap="round"/>

  <!-- Parcel Vertex Nodes (Points) -->
  <circle cx="100" cy="140" r="7" fill="#ffffff" stroke="#3b82f6" stroke-width="3.5"/>
  <circle cx="380" cy="90" r="7" fill="#ffffff" stroke="#3b82f6" stroke-width="3.5"/>
  <circle cx="430" cy="340" r="7" fill="#ffffff" stroke="#f59e0b" stroke-width="3.5"/>
  <circle cx="310" cy="430" r="7" fill="#ffffff" stroke="#f59e0b" stroke-width="3.5"/>
  <circle cx="130" cy="400" r="7" fill="#ffffff" stroke="#10b981" stroke-width="3.5"/>
  <circle cx="110" cy="260" r="8" fill="#f43f5e" stroke="#ffffff" stroke-width="3"/>
  <circle cx="310" cy="230" r="8" fill="#f43f5e" stroke="#ffffff" stroke-width="3"/>

  <!-- Modern Label Text "İFRAZ" Badge in Bottom Left -->
  <rect x="70" y="434" width="100" height="28" rx="14" fill="#0f172a" fill-opacity="0.85" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/>
  <text x="120" y="453" fill="#38bdf8" font-family="-apple-system, system-ui, sans-serif" font-size="13" font-weight="800" text-anchor="middle" letter-spacing="2">İFRAZ</text>
</svg>`;

// Maskable SVG with safe margin padding (centered in 80% circle)
const maskableSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGradM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="50%" stop-color="#0b132b"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="polyGrad1M" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.6"/>
    </linearGradient>
    <linearGradient id="polyGrad2M" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#047857" stop-opacity="0.6"/>
    </linearGradient>
    <linearGradient id="polyGrad3M" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.65"/>
    </linearGradient>
  </defs>

  <!-- Full-bleed background for maskable icon -->
  <rect width="512" height="512" fill="url(#bgGradM)"/>

  <!-- Scaled down to 78% and centered for Android maskable safe-zone -->
  <g transform="translate(56, 56) scale(0.78)">
    <!-- Subdivision 1 -->
    <polygon points="100,140 380,90 310,230 110,260" fill="url(#polyGrad1M)" stroke="#93c5fd" stroke-width="4.5" stroke-linejoin="round"/>
    
    <!-- Subdivision 2 -->
    <polygon points="110,260 310,230 240,418 130,400" fill="url(#polyGrad2M)" stroke="#6ee7b7" stroke-width="4.5" stroke-linejoin="round"/>

    <!-- Subdivision 3 -->
    <polygon points="310,230 380,90 430,340 310,430 240,418" fill="url(#polyGrad3M)" stroke="#fcd34d" stroke-width="4.5" stroke-linejoin="round"/>

    <!-- Axis Line -->
    <line x1="70" y1="265" x2="450" y2="215" stroke="#f43f5e" stroke-width="6" stroke-dasharray="12,10" stroke-linecap="round"/>

    <!-- Nodes -->
    <circle cx="100" cy="140" r="9" fill="#ffffff" stroke="#3b82f6" stroke-width="4"/>
    <circle cx="380" cy="90" r="9" fill="#ffffff" stroke="#3b82f6" stroke-width="4"/>
    <circle cx="430" cy="340" r="9" fill="#ffffff" stroke="#f59e0b" stroke-width="4"/>
    <circle cx="310" cy="430" r="9" fill="#ffffff" stroke="#f59e0b" stroke-width="4"/>
    <circle cx="130" cy="400" r="9" fill="#ffffff" stroke="#10b981" stroke-width="4"/>
    <circle cx="110" cy="260" r="10" fill="#f43f5e" stroke="#ffffff" stroke-width="3.5"/>
    <circle cx="310" cy="230" r="10" fill="#f43f5e" stroke="#ffffff" stroke-width="3.5"/>
  </g>
</svg>`;

async function run() {
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf-8');
  console.log('Saved public/icon.svg');

  const svgBuffer = Buffer.from(svgContent);
  const maskableSvgBuffer = Buffer.from(maskableSvgContent);

  // 192x192 PNG
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Saved public/pwa-192x192.png');

  // 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Saved public/pwa-512x512.png');

  // 512x512 Maskable PNG
  await sharp(maskableSvgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Saved public/pwa-maskable-512x512.png');

  // 180x180 Apple Touch Icon PNG
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Saved public/apple-touch-icon.png');

  // Favicon (64x64 PNG or ICO)
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Saved public/favicon.ico');
}

run().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
