export type PaperSize = 'A4' | 'A3';
export type PageOrientation = 'portrait' | 'landscape';
export type PageMarginPreset = 'narrow' | 'normal' | 'wide';

export interface PdfExportOptions {
  paperSize: PaperSize;
  orientation: PageOrientation;
  marginPreset: PageMarginPreset;
  title: string;
  subtitle: string;
  systemSummary: string;
  summaryRight: string;
  svgElement: SVGSVGElement | null;
  scaleLabel: string;
  showFrontages: boolean;
  showCoordinates: boolean;
  parcelRows: Array<{
    name: string;
    area: string;
    frontage: string;
    rearWidth: string;
    depth: string;
    edgesText: string;
    statusText: string;
    isValid: boolean;
  }>;
  coordHeaders: {
    xLabel: string;
    yLabel: string;
  };
  coordRows: Array<{
    label: string;
    xVal: string;
    yVal: string;
    zoneLabel: string;
    parcelsText: string;
  }>;
  footerLeft: string;
  footerRight: string;
  filename: string;
}

const PAPER_DIMENSIONS_PT: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 595.28, h: 841.89 },
  A3: { w: 841.89, h: 1190.55 }
};

const MARGIN_MM: Record<PageMarginPreset, number> = {
  narrow: 6,
  normal: 10,
  wide: 15
};

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function svgElementToImage(svgEl: SVGSVGElement): Promise<HTMLImageElement | null> {
  try {
    const cloned = svgEl.cloneNode(true) as SVGSVGElement;
    if (!cloned.getAttribute('xmlns')) {
      cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    const vb = svgEl.viewBox?.baseVal;
    const w = vb && vb.width > 0 ? vb.width : 800;
    const h = vb && vb.height > 0 ? vb.height : 460;
    cloned.setAttribute('width', String(w * 2));
    cloned.setAttribute('height', String(h * 2));

    const serialized = new XMLSerializer().serializeToString(cloned);
    const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function buildMultiPagePdfBlob(
  pages: Array<{ jpegBytes: Uint8Array; pxW: number; pxH: number }>,
  pageWpt: number,
  pageHpt: number
): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushStr = (str: string) => {
    pushBytes(encoder.encode(str));
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const objOffsets: number[] = [0]; // index 0 unused

  const startObj = (id: number) => {
    objOffsets[id] = offset;
    pushStr(`${id} 0 obj\n`);
  };
  const endObj = () => {
    pushStr('\nendobj\n');
  };

  // 1: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // 2: Pages
  const pageIds = pages.map((_, idx) => 3 + idx * 3);
  startObj(2);
  pushStr(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  endObj();

  pages.forEach((pg, idx) => {
    const pageId = 3 + idx * 3;
    const contentId = pageId + 1;
    const imgId = pageId + 2;

    startObj(pageId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt.toFixed(2)} ${pageHpt.toFixed(2)}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    endObj();

    const streamBody = `q\n${pageWpt.toFixed(2)} 0 0 ${pageHpt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    const streamBytes = encoder.encode(streamBody);
    startObj(contentId);
    pushStr(`<< /Length ${streamBytes.length} >>\nstream\n`);
    pushBytes(streamBytes);
    pushStr('\nendstream');
    endObj();

    startObj(imgId);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${pg.pxW} /Height ${pg.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(pg.jpegBytes);
    pushStr('\nendstream');
    endObj();
  });

  const xrefOffset = offset;
  const totalObjs = 2 + pages.length * 3;
  pushStr(`xref\n0 ${totalObjs + 1}\n`);
  pushStr('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjs; id++) {
    const offStr = String(objOffsets[id]).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }

  pushStr(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const blobParts: BlobPart[] = chunks.map((c) => {
    const copy = new Uint8Array(c.byteLength);
    copy.set(c);
    return copy.buffer;
  });
  return new Blob(blobParts, { type: 'application/pdf' });
}

/**
 * Generates and downloads a multi-page vector-crisp PDF directly in browser with native Turkish font rendering.
 */
export async function generateAndDownloadPdf(options: PdfExportOptions): Promise<void> {
  const baseDim = PAPER_DIMENSIONS_PT[options.paperSize];
  const pageWpt = options.orientation === 'portrait' ? baseDim.w : baseDim.h;
  const pageHpt = options.orientation === 'portrait' ? baseDim.h : baseDim.w;

  // Render at ~2.5x points scale (~180 DPI) for sharp text and SVG kroki
  const pxScale = 2.5;
  const pxW = Math.round(pageWpt * pxScale);
  const pxH = Math.round(pageHpt * pxScale);

  const marginPt = (MARGIN_MM[options.marginPreset] * 72) / 25.4;
  const margin = Math.round(marginPt * pxScale);
  const contentW = pxW - margin * 2;
  const footerH = Math.round(24 * pxScale);
  const maxY = pxH - margin - footerH;

  const svgImg = options.svgElement ? await svgElementToImage(options.svgElement) : null;

  const canvases: HTMLCanvasElement[] = [];

  const createPage = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; y: number } => {
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.textBaseline = 'top';
    canvases.push(canvas);
    return { canvas, ctx, y: margin };
  };

  let page = createPage();
  let ctx = page.ctx;
  let y = page.y;

  const ensureSpace = (neededPx: number, onNewPage?: () => void) => {
    if (y + neededPx > maxY) {
      page = createPage();
      ctx = page.ctx;
      y = page.y;
      onNewPage?.();
    }
  };

  // --- Header ---
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(14 * pxScale)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(options.title, margin, y);

  ctx.textAlign = 'right';
  ctx.font = `600 ${Math.round(9.5 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
  ctx.fillText(options.systemSummary, pxW - margin, y + 2);
  ctx.textAlign = 'left';

  y += Math.round(18 * pxScale);

  ctx.fillStyle = '#475569';
  ctx.font = `500 ${Math.round(9.5 * pxScale)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(options.subtitle, margin, y);

  ctx.textAlign = 'right';
  ctx.font = `500 ${Math.round(9 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
  ctx.fillText(options.summaryRight, pxW - margin, y);
  ctx.textAlign = 'left';

  y += Math.round(15 * pxScale);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5 * pxScale;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(pxW - margin, y);
  ctx.stroke();
  y += Math.round(12 * pxScale);

  // --- Kroki Frame ---
  const krokiHeaderH = Math.round(20 * pxScale);
  const krokiSvgH = Math.round(contentW * (460 / 800));
  const maxKrokiH = Math.round(pxH * (options.orientation === 'landscape' ? 0.56 : 0.44));
  const finalSvgH = Math.min(krokiSvgH, maxKrokiH);
  const finalBoxH = krokiHeaderH + finalSvgH;

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1 * pxScale;
  ctx.strokeRect(margin, y, contentW, finalBoxH);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(margin + 1, y + 1, contentW - 2, krokiHeaderH - 1);

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(9.5 * pxScale)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText('Uygulama Krokisi', margin + 8 * pxScale, y + 5 * pxScale);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.font = `600 ${Math.round(8.5 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
  ctx.fillText(`${options.scaleLabel}   |   Kuzey ↑`, pxW - margin - 8 * pxScale, y + 5.5 * pxScale);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(margin, y + krokiHeaderH);
  ctx.lineTo(pxW - margin, y + krokiHeaderH);
  ctx.stroke();

  if (svgImg) {
    const targetAspect = 800 / 460;
    let drawW = contentW - 4;
    let drawH = drawW / targetAspect;
    if (drawH > finalSvgH - 4) {
      drawH = finalSvgH - 4;
      drawW = drawH * targetAspect;
    }
    const dx = margin + (contentW - drawW) / 2;
    const dy = y + krokiHeaderH + (finalSvgH - drawH) / 2;
    ctx.drawImage(svgImg, dx, dy, drawW, drawH);
  }

  y += finalBoxH + Math.round(16 * pxScale);

  let sectionNum = 1;

  // --- Section 1: İfraz Parselleri ve Cepheleri ---
  if (options.showFrontages && options.parcelRows.length > 0) {
    const colWidths = [
      contentW * 0.14,
      contentW * 0.10,
      contentW * 0.10,
      contentW * 0.10,
      contentW * 0.09,
      contentW * 0.39,
      contentW * 0.08
    ];

    const drawParcelTableHeader = () => {
      const h = Math.round(20 * pxScale);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(margin, y, contentW, h);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.8 * pxScale;
      ctx.strokeRect(margin, y, contentW, h);

      const labels = ['Parsel', 'Alan (m²)', 'Yol Cephe', 'Arka Bitiş', 'Derinlik', 'Kenar / Cephe Ölçüleri', 'Durum'];
      ctx.fillStyle = '#334155';
      ctx.font = `700 ${Math.round(8.2 * pxScale)}px system-ui, -apple-system, sans-serif`;

      let cx = margin;
      labels.forEach((lbl, idx) => {
        const alignRight = idx >= 1 && idx <= 4;
        const alignCenter = idx === 6;
        if (alignRight) {
          ctx.textAlign = 'right';
          ctx.fillText(lbl, cx + colWidths[idx] - 5 * pxScale, y + 6 * pxScale);
        } else if (alignCenter) {
          ctx.textAlign = 'center';
          ctx.fillText(lbl, cx + colWidths[idx] / 2, y + 6 * pxScale);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(lbl, cx + 5 * pxScale, y + 6 * pxScale);
        }
        cx += colWidths[idx];
      });
      ctx.textAlign = 'left';
      y += h;
    };

    ensureSpace(Math.round(45 * pxScale));
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.round(10.5 * pxScale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(`${sectionNum}. İfraz Parselleri ve Cepheleri`, margin, y);
    y += Math.round(16 * pxScale);
    sectionNum += 1;

    drawParcelTableHeader();

    for (const row of options.parcelRows) {
      ctx.font = `500 ${Math.round(7.8 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
      const edgeLines = wrapText(ctx, row.edgesText, colWidths[5] - 10 * pxScale);
      const rowH = Math.max(Math.round(18 * pxScale), edgeLines.length * Math.round(10 * pxScale) + Math.round(8 * pxScale));

      ensureSpace(rowH, () => {
        drawParcelTableHeader();
      });

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.7 * pxScale;
      ctx.strokeRect(margin, y, contentW, rowH);

      let cx = margin;
      ctx.fillStyle = '#0f172a';
      ctx.font = `600 ${Math.round(8 * pxScale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(row.name, cx + 5 * pxScale, y + 5 * pxScale, colWidths[0] - 8 * pxScale);
      cx += colWidths[0];

      ctx.font = `600 ${Math.round(8 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
      [row.area, row.frontage, row.rearWidth, row.depth].forEach((val, idx) => {
        ctx.textAlign = 'right';
        ctx.fillText(val, cx + colWidths[idx + 1] - 5 * pxScale, y + 5 * pxScale);
        cx += colWidths[idx + 1];
      });
      ctx.textAlign = 'left';

      ctx.fillStyle = '#334155';
      ctx.font = `500 ${Math.round(7.6 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
      edgeLines.forEach((line, lIdx) => {
        ctx.fillText(line, cx + 5 * pxScale, y + 4.5 * pxScale + lIdx * Math.round(10 * pxScale));
      });
      cx += colWidths[5];

      ctx.textAlign = 'center';
      ctx.fillStyle = row.isValid ? '#047857' : '#be123c';
      ctx.font = `700 ${Math.round(8 * pxScale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(row.statusText, cx + colWidths[6] / 2, y + 5 * pxScale);
      ctx.textAlign = 'left';

      y += rowH;
    }

    y += Math.round(16 * pxScale);
  }

  // --- Section 2: Köşe Koordinat Listesi ---
  if (options.showCoordinates && options.coordRows.length > 0) {
    const colWidths = [
      contentW * 0.10,
      contentW * 0.22,
      contentW * 0.22,
      contentW * 0.22,
      contentW * 0.24
    ];

    const drawCoordHeader = () => {
      const h = Math.round(20 * pxScale);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(margin, y, contentW, h);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.8 * pxScale;
      ctx.strokeRect(margin, y, contentW, h);

      const labels = ['Nokta', options.coordHeaders.xLabel, options.coordHeaders.yLabel, 'Dilim / Sistem', 'Ait Parsel'];
      ctx.fillStyle = '#334155';
      ctx.font = `700 ${Math.round(8.2 * pxScale)}px system-ui, -apple-system, sans-serif`;

      let cx = margin;
      labels.forEach((lbl, idx) => {
        if (idx === 1 || idx === 2) {
          ctx.textAlign = 'right';
          ctx.fillText(lbl, cx + colWidths[idx] - 6 * pxScale, y + 6 * pxScale);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(lbl, cx + 6 * pxScale, y + 6 * pxScale);
        }
        cx += colWidths[idx];
      });
      ctx.textAlign = 'left';
      y += h;
    };

    ensureSpace(Math.round(45 * pxScale));
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.round(10.5 * pxScale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(`${sectionNum}. Köşe Koordinat Listesi`, margin, y);
    y += Math.round(16 * pxScale);

    drawCoordHeader();

    for (const r of options.coordRows) {
      const rowH = Math.round(16 * pxScale);
      ensureSpace(rowH, () => {
        drawCoordHeader();
      });

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.7 * pxScale;
      ctx.strokeRect(margin, y, contentW, rowH);

      let cx = margin;
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 ${Math.round(8.2 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
      ctx.fillText(r.label, cx + 6 * pxScale, y + 4 * pxScale);
      cx += colWidths[0];

      ctx.textAlign = 'right';
      ctx.font = `500 ${Math.round(8.2 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
      ctx.fillText(r.xVal, cx + colWidths[1] - 6 * pxScale, y + 4 * pxScale);
      cx += colWidths[1];
      ctx.fillText(r.yVal, cx + colWidths[2] - 6 * pxScale, y + 4 * pxScale);
      cx += colWidths[2];
      ctx.textAlign = 'left';

      ctx.fillStyle = '#475569';
      ctx.font = `500 ${Math.round(7.8 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
      ctx.fillText(r.zoneLabel, cx + 6 * pxScale, y + 4 * pxScale, colWidths[3] - 10 * pxScale);
      cx += colWidths[3];

      ctx.fillStyle = '#334155';
      ctx.font = `500 ${Math.round(8 * pxScale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(r.parcelsText, cx + 6 * pxScale, y + 4 * pxScale, colWidths[4] - 10 * pxScale);

      y += rowH;
    }
  }

  // --- Draw Footers on all pages ---
  const totalPages = canvases.length;
  canvases.forEach((c, idx) => {
    const pCtx = c.getContext('2d')!;
    const fy = pxH - margin - Math.round(14 * pxScale);
    pCtx.strokeStyle = '#e2e8f0';
    pCtx.lineWidth = 0.8 * pxScale;
    pCtx.beginPath();
    pCtx.moveTo(margin, fy - 5 * pxScale);
    pCtx.lineTo(pxW - margin, fy - 5 * pxScale);
    pCtx.stroke();

    pCtx.fillStyle = '#64748b';
    pCtx.font = `500 ${Math.round(8.5 * pxScale)}px system-ui, -apple-system, sans-serif`;
    pCtx.textAlign = 'left';
    pCtx.fillText(options.footerLeft, margin, fy);

    pCtx.textAlign = 'center';
    pCtx.font = `500 ${Math.round(8.2 * pxScale)}px ui-monospace, SFMono-Regular, monospace`;
    pCtx.fillText(`Sayfa ${idx + 1} / ${totalPages}`, pxW / 2, fy);

    pCtx.textAlign = 'right';
    pCtx.fillText(options.footerRight, pxW - margin, fy);
  });

  const encodedPages = canvases.map((c) => {
    const dataUrl = c.toDataURL('image/jpeg', 0.94);
    const b64 = dataUrl.split(',')[1];
    return {
      jpegBytes: base64ToBytes(b64),
      pxW: c.width,
      pxH: c.height
    };
  });

  const pdfBlob = buildMultiPagePdfBlob(encodedPages, pageWpt, pageHpt);
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
