import type ExcelJS from 'exceljs';
import type { Project, Task } from '../types';
import { resolvePhaseMeta } from './phases';
import pinnacleLogoSvg from '../assets/logo.svg?raw';

// ---------------------------------------------------------------------------
// Pinnacle Flow branding for the Excel export.
//
// Same palette as the app (src/index.css design tokens): Pinnacle navy for
// structure, ribbon orange for accents and "today", quiet neutrals with
// hairline borders. Phase colours stay a separate system (only the phase
// name in the meta line uses its phase colour).
// ---------------------------------------------------------------------------

export const FONT = 'Segoe UI';

/** ARGB colours. */
export const BRAND = {
  navy: 'FF11354A',
  navyDark: 'FF0B2636',
  navySoft: 'FFEEF1F2',     // navy 7% on white — parent rows
  navyTint: 'FFB8C2C9',     // navy 30% on white — unfilled part of a bar
  orange: 'FFF98231',
  orangeInk: 'FFB8501E',    // orange text on light surfaces
  orangeSoft: 'FFFEF1E8',   // orange 11% on white — "today"
  ink: 'FF111318',
  text: 'FF2B2F36',
  muted: 'FF676C77',
  faint: 'FF9A9FA9',
  border: 'FFE7E8EC',
  borderStrong: 'FFD6D8DE',
  panelSoft: 'FFF4F5F7',
  zebra: 'FFFBFBFC',
  white: 'FFFFFFFF',
} as const;

/** Status chip colours — the same soft fill + ink pairs as the app's status badges. */
export const STATUS_STYLE: Record<Task['status'], { label: string; fill: string; ink: string; bar: string }> = {
  not_started: { label: 'Not Started', fill: 'FFF4F5F7', ink: 'FF676C77', bar: 'FF9AA3AD' },
  in_progress: { label: 'In Progress', fill: 'FFE7EFFD', ink: 'FF1D4ED8', bar: 'FF2563EB' },
  on_hold:     { label: 'On Hold',     fill: 'FFF8EEE6', ink: 'FFB45309', bar: 'FFD97706' },
  completed:   { label: 'Completed',   fill: 'FFE8F2EC', ink: 'FF15803D', bar: 'FF15803D' },
};

export const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
export const hexArgb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();
export const line = (style: ExcelJS.BorderStyle, argb: string): Partial<ExcelJS.Border> => ({ style, color: { argb } });

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

/** Logo aspect ratio (viewBox 170 × 27). */
const LOGO_RATIO = 170 / 27;

/**
 * The Pinnacle logo for the navy banner: navy "P" frame and PINNACLE wordmark
 * turned white, ribbon kept orange.
 */
const logoReverseSvg = pinnacleLogoSvg.replace(/#11354A/gi, '#FFFFFF');

/**
 * Rasterise the white-on-transparent logo to a PNG data URL (Excel can't embed
 * SVG). Rendered at 4× the size it is shown at so it stays crisp when zoomed.
 * Resolves to null if the browser can't render it — the export goes on without.
 */
export async function loadLogoPng(heightPx = 26, scale = 4): Promise<string | null> {
  try {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoReverseSvg);
    await img.decode();
    const h = Math.round(heightPx * scale);
    const w = Math.round(h * LOGO_RATIO);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sheet header: navy banner with the logo, orange rule, title, meta line
// ---------------------------------------------------------------------------

const PX_EMU = 9525;
const BANNER_HEIGHT_PT = 38;
const LOGO_HEIGHT_PX = 28;

export interface BrandHeaderOptions {
  /** Last column the header spans. */
  lastCol: number;
  /** Small orange label after the title, e.g. "Task list". */
  sheetLabel: string;
  project: Project;
  /** Workbook image id of the logo, if it loaded. */
  logoId?: number;
  /** Rich text for the line under the title (defaults to the project meta line). */
  meta?: ExcelJS.RichText[];
  /** Height of the meta row in points. */
  metaHeight?: number;
}

/** Rows used by `writeBrandHeader`; the caller's content starts on the next row. */
export const BRAND_HEADER_ROWS = 4;

/** Writes rows 1–4 (banner, rule, title, meta) and returns the first free row. */
export function writeBrandHeader(sheet: ExcelJS.Worksheet, o: BrandHeaderOptions): number {
  const { lastCol, project } = o;
  const BANNER = 1, RULE = 2, TITLE = 3, META = 4;

  // Banner: navy band, logo on the left.
  sheet.mergeCells(BANNER, 1, BANNER, lastCol);
  sheet.getCell(BANNER, 1).fill = solid(BRAND.navy);
  sheet.getRow(BANNER).height = BANNER_HEIGHT_PT;
  if (o.logoId !== undefined) {
    const bannerPx = BANNER_HEIGHT_PT * 96 / 72;
    sheet.addImage(o.logoId, {
      // Fixed pixel offsets, so the logo sits the same on every sheet whatever column A's width.
      tl: { nativeCol: 0, nativeColOff: 14 * PX_EMU, nativeRow: 0, nativeRowOff: Math.round((bannerPx - LOGO_HEIGHT_PX) / 2) * PX_EMU } as unknown as ExcelJS.Anchor,
      ext: { width: Math.round(LOGO_HEIGHT_PX * LOGO_RATIO), height: LOGO_HEIGHT_PX },
      editAs: 'absolute',
    });
  }

  // Ribbon-orange rule under the banner.
  sheet.mergeCells(RULE, 1, RULE, lastCol);
  sheet.getCell(RULE, 1).fill = solid(BRAND.orange);
  sheet.getRow(RULE).height = 3.5;

  // Title: project name, client, sheet label.
  sheet.mergeCells(TITLE, 1, TITLE, lastCol);
  const title = sheet.getCell(TITLE, 1);
  title.value = {
    richText: [
      { text: project.name, font: { bold: true, size: 17, color: { argb: BRAND.navy }, name: FONT } },
      { text: project.clientName ? `   ${project.clientName}` : '', font: { size: 12, color: { argb: BRAND.muted }, name: FONT } },
      { text: `   ·   ${o.sheetLabel.toUpperCase()}`, font: { bold: true, size: 9, color: { argb: BRAND.orangeInk }, name: FONT } },
    ],
  };
  title.alignment = { vertical: 'bottom', horizontal: 'left', indent: 1 };
  sheet.getRow(TITLE).height = 34;

  // Meta line.
  sheet.mergeCells(META, 1, META, lastCol);
  const meta = sheet.getCell(META, 1);
  meta.value = { richText: o.meta ?? projectMeta(project) };
  meta.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  sheet.getRow(META).height = o.metaHeight ?? 24;

  sheet.properties.tabColor = { argb: BRAND.navy };
  return META + 1;
}

function friendly(ymd?: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "STATUS Active   START 15 Jun 2026   …" as label/value rich text. */
export function metaPairs(pairs: Array<[string, string, string?]>): ExcelJS.RichText[] {
  const out: ExcelJS.RichText[] = [];
  pairs.forEach(([label, value, valueArgb], i) => {
    out.push({ text: `${i ? '        ' : ''}${label.toUpperCase()}  `, font: { bold: true, size: 8, color: { argb: BRAND.faint }, name: FONT } });
    out.push({ text: value, font: { size: 10, color: { argb: valueArgb ?? BRAND.text }, name: FONT } });
  });
  return out;
}

export function projectMeta(project: Project, extra: Array<[string, string, string?]> = []): ExcelJS.RichText[] {
  const phase = resolvePhaseMeta(project);
  return metaPairs([
    ['Status', project.status.charAt(0).toUpperCase() + project.status.slice(1)],
    ['Phase', phase.label, hexArgb(phase.accent)],
    ['Start', friendly(project.startDate)],
    ['Go-live', friendly(project.targetGoLiveDate)],
    ...extra,
    ['Exported', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })],
  ]);
}

// ---------------------------------------------------------------------------
// Sheet chrome: no gridlines, branded print setup
// ---------------------------------------------------------------------------

export function applySheetChrome(sheet: ExcelJS.Worksheet, opts: { printTitleRows: string; landscape?: boolean }): void {
  sheet.views = sheet.views.map(v => ({ ...v, showGridLines: false }));
  sheet.pageSetup = {
    ...sheet.pageSetup,
    paperSize: 9, // A4
    orientation: opts.landscape === false ? 'portrait' : 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: opts.printTitleRows,
    horizontalCentered: false,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
  };
  sheet.headerFooter = {
    oddFooter: '&L&"Segoe UI"&8&K676C77Pinnacle Flow  ·  &A&R&"Segoe UI"&8&K676C77Page &P of &N',
  };
}
