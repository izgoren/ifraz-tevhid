import { AppFontFamily } from '../types';

export interface FontFamilyOption {
  id: AppFontFamily;
  shortLabel: string;
  label: string;
  description: string;
  cssFamily: string;
}

export const APP_FONT_OPTIONS: FontFamilyOption[] = [
  {
    id: 'sf-pro',
    shortLabel: 'SF Pro',
    label: 'San Francisco (SF Pro)',
    description: 'Apple sistem arayüz yazı tipi',
    cssFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro", "Inter", system-ui, sans-serif'
  },
  {
    id: 'inter',
    shortLabel: 'Inter',
    label: 'Inter UI',
    description: 'Yüksek okunaklı modern CBS yazı tipi',
    cssFamily: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
  },
  {
    id: 'jakarta',
    shortLabel: 'Jakarta',
    label: 'Plus Jakarta Sans',
    description: 'Yumuşak geometrik başlık ve panel tipi',
    cssFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif'
  },
  {
    id: 'ibm-plex',
    shortLabel: 'IBM Plex',
    label: 'IBM Plex Sans',
    description: 'Mühendislik ve teknik harita standardı',
    cssFamily: '"IBM Plex Sans", -apple-system, system-ui, sans-serif'
  },
  {
    id: 'mono',
    shortLabel: 'SF Mono',
    label: 'SF Mono / Teknik',
    description: 'Sabit genişlikli CAD & koordinat tipi',
    cssFamily: '"SF Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  }
];

export function getFontFamilyOption(id?: AppFontFamily): FontFamilyOption {
  return APP_FONT_OPTIONS.find((f) => f.id === id) || APP_FONT_OPTIONS[0];
}

export function getNextFontFamily(current?: AppFontFamily): FontFamilyOption {
  const idx = APP_FONT_OPTIONS.findIndex((f) => f.id === current);
  const nextIdx = idx >= 0 ? (idx + 1) % APP_FONT_OPTIONS.length : 1;
  return APP_FONT_OPTIONS[nextIdx];
}
