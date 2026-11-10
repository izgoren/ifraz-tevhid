import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
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
