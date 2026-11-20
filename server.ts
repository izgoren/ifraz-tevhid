import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Shared Gemini API client initialized server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * Real-time Imar Durumu (Zoning Status) Grounding Endpoint
 * Uses Google Search Grounding with gemini-3.8-flash to query municipality zoning regulations
 */
app.post('/api/imar-durumu', async (req, res) => {
  try {
    const { province = '', district = '', mahalle = '', adaNo = '', parselNo = '', nitelik = '' } = req.body;

    if (!province && !district && !mahalle) {
      return res.status(400).json({
        success: false,
        error: 'İl, İlçe veya Mahalle bilgisi gereklidir.',
      });
    }

    const locationQuery = [province, district, mahalle].filter(Boolean).join(' ');
    const parcelDetails = [
      adaNo ? `Ada: ${adaNo}` : '',
      parselNo ? `Parsel: ${parselNo}` : '',
      nitelik ? `Nitelik: ${nitelik}` : '',
    ].filter(Boolean).join(', ');

    const prompt = `Türkiye İmar Mevzuatı, 3194 sayılı İmar Kanunu ve yerel belediye 1/1000 Uygulama İmar Planı kapsamında:
Konum: ${locationQuery} ${parcelDetails ? `(${parcelDetails})` : ''}

Lütfen bu bölgenin (${locationQuery}) güncel imar durumunu, belediye imar plan notlarını ve yapılaşma koşullarını araştır:
1. İmar Fonksiyonu (Konut, Ticaret, Sanayi, Karma vb.)
2. Yapılaşma Koşulları (Varsa TAKS, KAKS / Emsal, Yençok / Hmax kat yüksekliği)
3. Çekme Mesafeleri (Ön bahçe, yan bahçe, arka bahçe)
4. Özel Hükümler veya Kısıtlar (Sit alanı, koruma kuşağı, tarımsal nitelik, afet/heyelan riski vb.)
5. Belediye İmar ve Şehircilik Müdürlüğü kaynakları / resmi plan askı ilanları

Resmi belediye ve kamu kaynaklarını kullanarak güncel, net ve Türkçe bir özet hazırla.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction:
          'Sen profesyonel bir harita ve şehir plancısı uzmanısın. Türkiye yerel belediyelerinin (Büyükşehir ve İlçe Belediyeleri) güncel imar planı notları ve imar durumu sorgulamaları hakkında Google Search verilerini kullanarak somut, yapılandırılmış ve güvenilir imar bilgileri sunarsın.',
      },
    });

    const summary = response.text || 'İmar durumu bilgisi alınamadı.';

    // Extract search grounding metadata chunks and search queries
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const rawChunks = groundingMetadata?.groundingChunks || [];
    const webSearchQueries = groundingMetadata?.webSearchQueries || [];

    const sources = rawChunks
      .filter((c: any) => c.web && c.web.uri)
      .map((c: any) => ({
        title: c.web.title || c.web.uri,
        uri: c.web.uri,
      }));

    // Deduplicate sources by URI
    const uniqueSources: { title: string; uri: string }[] = [];
    const seenUris = new Set<string>();
    for (const s of sources) {
      if (!seenUris.has(s.uri)) {
        seenUris.add(s.uri);
        uniqueSources.push(s);
      }
    }

    return res.json({
      success: true,
      location: {
        province,
        district,
        mahalle,
        adaNo,
        parselNo,
      },
      summary,
      sources: uniqueSources,
      searchQueries: webSearchQueries,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('İmar Durumu Grounding Hatası:', error);
    let errMsg = error.message || 'İmar durumu sorgulanırken bir hata oluştu.';
    if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      errMsg = 'Google Search grounding için Gemini API istek kotası aşıldı. Lütfen bir süre sonra tekrar deneyin veya Settings > Secrets panelinden kota tanımlı bir API anahtarı seçin.';
    } else if (errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('API_KEY_INVALID')) {
      errMsg = 'API anahtarı yetkilendirmesi başarısız oldu. Lütfen Settings > Secrets panelinden geçerli bir API anahtarı seçildiğinden emin olun.';
    }
    return res.status(500).json({
      success: false,
      error: errMsg,
    });
  }
});

// ==================== TKGM PARSEL SORGU PROXY & CACHE ====================
interface TkgmAdminItem {
  id: number;
  name: string;
}

const tkgmListCache = new Map<string, { items: TkgmAdminItem[]; source: string; expiresAt: number }>();
const TKGM_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const TKGM_BROWSER_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: 'https://parselsorgu.tkgm.gov.tr',
  Referer: 'https://parselsorgu.tkgm.gov.tr/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  manualRedirect = false
): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: TKGM_BROWSER_HEADERS,
      redirect: manualRedirect ? 'manual' : 'follow',
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, status: response.status, data: null };
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (!text || (!contentType.includes('json') && !text.trim().startsWith('{') && !text.trim().startsWith('['))) {
      return { ok: false, status: response.status, data: null };
    }

    const data = JSON.parse(text);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 504, data: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTkgmWithFallback(
  primaryPath: string,
  fallbackPath: string
): Promise<{ ok: boolean; status: number; data: any; source: string }> {
  const primaryUrl = `https://parselsorgu.tkgm.gov.tr/api/${primaryPath}`;
  const primaryRes = await fetchJsonWithTimeout(primaryUrl, 2200, true);
  if (primaryRes.ok && primaryRes.data) {
    return { ...primaryRes, source: 'parselsorgu.tkgm.gov.tr' };
  }

  const fallbackUrl = `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/${fallbackPath}`;
  const fallbackRes = await fetchJsonWithTimeout(fallbackUrl, 12000, false);
  return { ...fallbackRes, source: 'cbsapi.tkgm.gov.tr' };
}

function normalizeAdminList(raw: any): TkgmAdminItem[] {
  let rows: any[] = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && Array.isArray(raw.features)) {
    rows = raw.features.map((f: any) => f?.properties || f);
  } else if (raw && Array.isArray(raw.data)) {
    rows = raw.data;
  }

  const seen = new Set<number>();
  const items: TkgmAdminItem[] = [];
  for (const row of rows) {
    if (!row) continue;
    const rawId = row.id ?? row.ilId ?? row.ilceId ?? row.mahalleId ?? row.kod ?? row.value;
    const id = typeof rawId === 'number' ? rawId : parseInt(String(rawId ?? ''), 10);
    const name = String(row.text ?? row.ad ?? row.name ?? row.title ?? '').trim();
    if (!Number.isNaN(id) && name && !seen.has(id)) {
      seen.add(id);
      items.push({ id, name });
    }
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

// 1. İl Listesi
app.get('/api/tkgm/il', async (_req, res) => {
  const cacheKey = 'il_list';
  const cached = tkgmListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ success: true, items: cached.items, source: cached.source, cached: true });
  }

  const result = await fetchTkgmWithFallback('il', 'idariYapi/ilListe');
  if (!result.ok || !result.data) {
    return res.status(502).json({
      success: false,
      error: 'TKGM İl listesi alınamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.',
    });
  }

  const items = normalizeAdminList(result.data);
  if (items.length === 0) {
    return res.status(502).json({
      success: false,
      error: 'TKGM İl listesi boş döndü.',
    });
  }

  tkgmListCache.set(cacheKey, { items, source: result.source, expiresAt: Date.now() + TKGM_CACHE_TTL_MS });
  return res.json({ success: true, items, source: result.source });
});

// 2. İlçe Listesi
app.get('/api/tkgm/il/:ilId/ilce', async (req, res) => {
  const ilId = String(req.params.ilId || '').replace(/[^\d]/g, '');
  if (!ilId) {
    return res.status(400).json({ success: false, error: 'Geçersiz İl ID.' });
  }

  const cacheKey = `ilce_${ilId}`;
  const cached = tkgmListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ success: true, items: cached.items, source: cached.source, cached: true });
  }

  const result = await fetchTkgmWithFallback(`il/${ilId}/ilce`, `idariYapi/ilceListe/${ilId}`);
  if (!result.ok || !result.data) {
    return res.status(502).json({
      success: false,
      error: 'TKGM İlçe listesi alınamadı.',
    });
  }

  const items = normalizeAdminList(result.data);
  tkgmListCache.set(cacheKey, { items, source: result.source, expiresAt: Date.now() + TKGM_CACHE_TTL_MS });
  return res.json({ success: true, items, source: result.source });
});

// 3. Mahalle Listesi
app.get('/api/tkgm/ilce/:ilceId/mahalle', async (req, res) => {
  const ilceId = String(req.params.ilceId || '').replace(/[^\d]/g, '');
  if (!ilceId) {
    return res.status(400).json({ success: false, error: 'Geçersiz İlçe ID.' });
  }

  const cacheKey = `mahalle_${ilceId}`;
  const cached = tkgmListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ success: true, items: cached.items, source: cached.source, cached: true });
  }

  const result = await fetchTkgmWithFallback(`ilce/${ilceId}/mahalle`, `idariYapi/mahalleListe/${ilceId}`);
  if (!result.ok || !result.data) {
    return res.status(502).json({
      success: false,
      error: 'TKGM Mahalle listesi alınamadı.',
    });
  }

  const items = normalizeAdminList(result.data);
  tkgmListCache.set(cacheKey, { items, source: result.source, expiresAt: Date.now() + TKGM_CACHE_TTL_MS });
  return res.json({ success: true, items, source: result.source });
});

// 4. Parsel Detay & GeoJSON
app.get('/api/tkgm/parsel/:mahalleId/:adaNo/:parselNo', async (req, res) => {
  const mahalleId = String(req.params.mahalleId || '').replace(/[^\d]/g, '');
  const adaNo = encodeURIComponent(String(req.params.adaNo ?? '0').trim() || '0');
  const parselNo = encodeURIComponent(String(req.params.parselNo ?? '').trim());

  if (!mahalleId || !parselNo) {
    return res.status(400).json({
      success: false,
      error: 'Mahalle ve Parsel numarası zorunludur.',
    });
  }

  const result = await fetchTkgmWithFallback(
    `parsel/${mahalleId}/${adaNo}/${parselNo}`,
    `parsel/${mahalleId}/${adaNo}/${parselNo}`
  );

  if (result.status === 404) {
    const tkgmMsg = result.data?.Message || result.data?.message;
    return res.status(404).json({
      success: false,
      error: tkgmMsg || `Belirtilen Ada (${decodeURIComponent(adaNo)}) / Parsel (${decodeURIComponent(parselNo)}) bulunamadı.`,
    });
  }

  if (!result.ok || !result.data) {
    return res.status(result.status >= 400 ? result.status : 502).json({
      success: false,
      error: result.data?.Message || result.data?.message || 'TKGM parsel sorgusu başarısız oldu.',
    });
  }

  const feature =
    result.data.type === 'FeatureCollection' && Array.isArray(result.data.features)
      ? result.data.features[0]
      : result.data;

  if (!feature || !feature.geometry) {
    return res.status(404).json({
      success: false,
      error: 'TKGM yanıtında geçerli parsel geometrisi bulunamadı.',
    });
  }

  return res.json({
    success: true,
    feature,
    properties: feature.properties || {},
    source: result.source,
  });
});

// 5. Harita Koordinatından Parsel Sorgu (Enlem / Boylam)
app.get('/api/tkgm/parsel/:lat/:lng', async (req, res) => {
  const lat = parseFloat(String(req.params.lat || '').replace(',', '.'));
  const lng = parseFloat(String(req.params.lng || '').replace(',', '.'));

  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      success: false,
      error: 'Geçersiz harita koordinatı (Enlem / Boylam).',
    });
  }

  const latStr = lat.toFixed(7);
  const lngStr = lng.toFixed(7);
  const result = await fetchTkgmWithFallback(`parsel/${latStr}/${lngStr}`, `parsel/${latStr}/${lngStr}`);

  if (result.status === 404) {
    const tkgmMsg = result.data?.Message || result.data?.message;
    return res.status(404).json({
      success: false,
      error: tkgmMsg || `Tıklanan konumda (${lat.toFixed(5)}, ${lng.toFixed(5)}) kayıtlı TKGM parseli bulunamadı.`,
    });
  }

  if (!result.ok || !result.data) {
    return res.status(result.status >= 400 ? result.status : 502).json({
      success: false,
      error: result.data?.Message || result.data?.message || 'Harita konumundan TKGM parsel sorgusu başarısız oldu.',
    });
  }

  const feature =
    result.data.type === 'FeatureCollection' && Array.isArray(result.data.features)
      ? result.data.features[0]
      : result.data;

  if (!feature || !feature.geometry) {
    return res.status(404).json({
      success: false,
      error: 'Tıklanan konum için geçerli parsel geometrisi bulunamadı.',
    });
  }

  return res.json({
    success: true,
    feature,
    properties: feature.properties || {},
    source: result.source,
  });
});

// ==================== STANDALONE SINGLE-FILE HTML EXPORT ====================
let pendingStandaloneBuild: Promise<{ outputHtmlPath: string; html: string; sizeBytes: number }> | null = null;

function getLatestSourceMtimeMs(dirPath: string): number {
  let latest = 0;
  if (!fs.existsSync(dirPath)) return latest;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('dist')) continue;
    const fullPath = path.join(dirPath, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const subLatest = getLatestSourceMtimeMs(fullPath);
      if (subLatest > latest) latest = subLatest;
    } else if (stat.mtimeMs > latest) {
      latest = stat.mtimeMs;
    }
  }
  return latest;
}

app.get('/api/export-html', async (req, res) => {
  try {
    const standalonePath = path.resolve(__dirname, 'dist-standalone', 'izgoren-harita-uygulamasi.html');
    const forceRefresh = req.query.refresh === '1';

    let needsBuild = forceRefresh || !fs.existsSync(standalonePath);
    if (!needsBuild) {
      const outStat = fs.statSync(standalonePath);
      const latestSrc = Math.max(
        getLatestSourceMtimeMs(path.resolve(__dirname, 'src')),
        fs.existsSync(path.resolve(__dirname, 'index.html'))
          ? fs.statSync(path.resolve(__dirname, 'index.html')).mtimeMs
          : 0
      );
      if (latestSrc > outStat.mtimeMs) {
        needsBuild = true;
      }
    }

    if (needsBuild) {
      if (!pendingStandaloneBuild) {
        pendingStandaloneBuild = (async () => {
          const mod = await import('./scripts/build-standalone-html.mjs');
          return mod.buildStandaloneHtml();
        })().finally(() => {
          pendingStandaloneBuild = null;
        });
      }
      await pendingStandaloneBuild;
    }

    const htmlContent = fs.readFileSync(standalonePath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Izgoren_Harita_Uygulamasi.html"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(htmlContent);
  } catch (error: any) {
    console.error('Standalone HTML export hatası:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Uygulama HTML olarak paketlenirken bir hata oluştu.',
    });
  }
});

// Start dev server with Vite middlewares
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
