import React from 'react';
import { createRoot } from 'react-dom/client';
import type { PersonaCardData } from './PersonaCardRenderer';
import PersonaCardRenderer from './PersonaCardRenderer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DownloadOptions {
  /** Card width in px (default 900). Height is auto-calculated at 0.6 ratio. */
  cardWidth?: number;
  /**
   * Device pixel ratio for export (default 2 → 1800×1080 export).
   * Use 3 for ultra-sharp print-quality exports.
   */
  scale?: number;
  /** File prefix for downloads (default 'persona-card') */
  filePrefix?: string;
  /**
   * Called on progress: (completed, total) → void
   * Useful for updating a progress bar in your modal.
   */
  onProgress?: (completed: number, total: number) => void;
}

// ── Core renderer ─────────────────────────────────────────────────────────────

/**
 * Mount a PersonaCardRenderer in a hidden off-screen div,
 * capture it with html2canvas, and return the canvas.
 *
 * The temporary container is appended to document.body (required by
 * html2canvas), absolutely positioned off-screen, and removed afterwards.
 */
async function renderPersonaToCanvas(
  persona: PersonaCardData,
  cardWidth: number,
  scale: number
): Promise<HTMLCanvasElement> {
  // Dynamically import html2canvas to keep initial bundle lean
  const html2canvas = (await import('html2canvas')).default;

  const cardHeight = Math.round(cardWidth * 0.60);

  // ── 1. Create off-screen mount container ─────────────────────────────────
  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    `top:${-cardHeight - 20}px`,   // above the visible viewport
    'left:0',
    `width:${cardWidth}px`,
    `height:${cardHeight}px`,
    'pointer-events:none',
    'z-index:-9999',
    'overflow:hidden',
  ].join(';');
  document.body.appendChild(container);

  // ── 2. Render the React card into the container ───────────────────────────
  await new Promise<void>(resolve => {
    const root = createRoot(container);
    root.render(
      React.createElement(PersonaCardRenderer, { persona, width: cardWidth })
    );
    // Give React a tick to finish layout + SVG rasterisation
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  // ── 3. Capture with html2canvas ───────────────────────────────────────────
  const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,     // card has its own background
    logging: false,
    // Ignore elements that html2canvas can't handle (backdrop-filter etc.)
    ignoreElements: el => el.hasAttribute('data-html2canvas-ignore'),
  });

  // ── 4. Clean up ───────────────────────────────────────────────────────────
  document.body.removeChild(container);

  return canvas;
}

// ── PNG blob helper ───────────────────────────────────────────────────────────

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      'image/png',
      quality
    );
  });
}

// ── Safe filename ─────────────────────────────────────────────────────────────

function safeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9_\-\s]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 60)
    .toLowerCase();
}

// ── Download a Blob directly ──────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Main entry point. Pass the selected persona IDs and the full personas array.
 *
 * @example
 * await downloadPersonaCards(['id-1', 'id-2'], savedPersonasFromAPI, {
 *   scale: 2,
 *   onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
 * });
 */
export async function downloadPersonaCards(
  selectedIds: string[],
  allPersonas: PersonaCardData[],
  options: DownloadOptions = {}
): Promise<void> {
  const {
    cardWidth = 900,
    scale = 2,
    filePrefix = 'persona-card',
    onProgress,
  } = options;

  const personas = allPersonas.filter(p => selectedIds.includes(p.id));
  if (personas.length === 0) return;

  onProgress?.(0, personas.length);

  // ── Single persona → download PNG directly ────────────────────────────────
  if (personas.length === 1) {
    const p = personas[0]!;
    const canvas = await renderPersonaToCanvas(p, cardWidth, scale);
    const blob = await canvasToBlob(canvas);
    const filename = `${filePrefix}_${safeFilename(p.name ?? 'persona')}.png`;
    triggerDownload(blob, filename);
    onProgress?.(1, 1);
    return;
  }

  // ── Multiple personas → bundle into ZIP ───────────────────────────────────
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const folder = zip.folder('persona-cards')!;

  for (let i = 0; i < personas.length; i++) {
    const p = personas[i]!;
    const canvas = await renderPersonaToCanvas(p, cardWidth, scale);
    const blob = await canvasToBlob(canvas);
    const filename = `${safeFilename(p.name ?? `persona_${i + 1}`)}.png`;
    folder.file(filename, blob);
    onProgress?.(i + 1, personas.length);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${filePrefix}s_${Date.now()}.zip`);
}

// ── Drop-in replacement for personaService.downloadPersonaCards ───────────────

/**
 * If you want to keep the existing `handleDownloadPersonaCards` function
 * in PersonaBuilder.tsx unchanged (it currently calls personaService), you
 * can swap the service call with this wrapper instead.
 *
 * In PersonaBuilder.tsx, change:
 *
 *   const blob = await personaService.downloadPersonaCards(workspaceId, objectiveId, selectedIds);
 *
 * to:
 *
 *   await downloadPersonaCardsFrontend(selectedIds, savedPersonasFromAPI);
 *   return;  // skip the old blob/zip logic below
 */
export async function downloadPersonaCardsFrontend(
  selectedIds: string[],
  allPersonas: PersonaCardData[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  return downloadPersonaCards(selectedIds, allPersonas, {
    cardWidth: 900,
    scale: 2,
    filePrefix: 'persona-card',
    ...(onProgress && { onProgress }),
  });
}