import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'dist-standalone');
const outputHtmlPath = path.join(outDir, 'izgoren-harita-uygulamasi.html');

export async function buildStandaloneHtml() {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await build({
      configFile: false,
      mode: 'production',
      root: projectRoot,
      base: './',
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      plugins: [
        react(),
        tailwindcss(),
        {
          name: 'stub-pwa-register',
          resolveId(id) {
            if (id === 'virtual:pwa-register') return '\0virtual:pwa-register';
          },
          load(id) {
            if (id === '\0virtual:pwa-register') {
              return 'export function registerSW() { return () => {}; }';
            }
          },
        },
      ],
      resolve: {
        alias: {
          '@': projectRoot,
        },
      },
      build: {
        outDir,
        emptyOutDir: true,
        assetsInlineLimit: 100 * 1024 * 1024, // Inline all Leaflet images/fonts/SVGs as data URIs
        cssCodeSplit: false,
        sourcemap: false,
        minify: 'esbuild',
        rollupOptions: {
          output: {
            format: 'iife',
            inlineDynamicImports: true,
            entryFileNames: 'bundle.js',
            chunkFileNames: 'chunk-[name].js',
            assetFileNames: 'assets/[name][extname]',
          },
        },
      },
      logLevel: 'silent',
    });
  } finally {
    if (prevNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevNodeEnv;
    }
  }

  const indexHtmlPath = path.join(outDir, 'index.html');
  let html = fs.readFileSync(indexHtmlPath, 'utf-8');

  // Locate generated CSS and JS files
  const assetsDir = path.join(outDir, 'assets');
  let cssContent = '';
  if (fs.existsSync(assetsDir)) {
    const assetFiles = fs.readdirSync(assetsDir);
    for (const file of assetFiles) {
      if (file.endsWith('.css')) {
        cssContent += fs.readFileSync(path.join(assetsDir, file), 'utf-8') + '\n';
      }
    }
  }

  const jsPath = path.join(outDir, 'bundle.js');
  if (!fs.existsSync(jsPath)) {
    throw new Error('Standalone JS bundle oluşturulamadı.');
  }
  const jsContent = fs.readFileSync(jsPath, 'utf-8');

  // Inline icon.svg if present
  const iconSvgPath = path.join(projectRoot, 'public', 'icon.svg');
  let iconDataUri = '';
  if (fs.existsSync(iconSvgPath)) {
    const svgBase64 = fs.readFileSync(iconSvgPath).toString('base64');
    iconDataUri = `data:image/svg+xml;base64,${svgBase64}`;
  }

  // Strip external bundle stylesheet & module script references
  html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']\.\/assets\/[^"']+["'][^>]*>/gi, '');
  html = html.replace(/<script[^>]*src=["']\.\/bundle\.js["'][^>]*>\s*<\/script>/gi, '');
  html = html.replace(/<script[^>]+type=["']module["'][^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/gi, '');

  // Replace relative icon links with inline data URI or clean removal
  if (iconDataUri) {
    html = html.replace(/href=["']\/icon\.svg["']/gi, () => `href="${iconDataUri}"`);
  } else {
    html = html.replace(/<link[^>]+href=["']\/icon\.svg["'][^>]*>/gi, '');
  }
  html = html.replace(/<link[^>]+href=["']\/favicon\.ico["'][^>]*>/gi, '');
  html = html.replace(/<link[^>]+href=["']\/apple-touch-icon\.png["'][^>]*>/gi, '');

  // Inject CSS into <head> using safe slicing (never String.replace with $ patterns)
  if (cssContent) {
    const safeCss = cssContent.replace(/<\/style/gi, '<\\/style');
    const headCloseIdx = html.lastIndexOf('</head>');
    if (headCloseIdx !== -1) {
      html = html.slice(0, headCloseIdx) + `  <style>\n${safeCss}\n  </style>\n` + html.slice(headCloseIdx);
    }
  }

  // Inject JS before </body> using safe slicing so #root exists when IIFE executes
  const safeJs = jsContent.replace(/<\/script/gi, '<\\/script');
  const bodyCloseIdx = html.lastIndexOf('</body>');
  if (bodyCloseIdx !== -1) {
    html = html.slice(0, bodyCloseIdx) + `  <script>\n${safeJs}\n  </script>\n` + html.slice(bodyCloseIdx);
  }

  fs.writeFileSync(outputHtmlPath, html, 'utf-8');
  return { outputHtmlPath, html, sizeBytes: Buffer.byteLength(html, 'utf-8') };
}

// Run directly from CLI if invoked as a script
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  buildStandaloneHtml()
    .then(({ outputHtmlPath: outPath, sizeBytes }) => {
      console.log(`Standalone HTML ready: ${outPath} (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB)`);
    })
    .catch((err) => {
      console.error('Standalone HTML build failed:', err);
      process.exit(1);
    });
}
