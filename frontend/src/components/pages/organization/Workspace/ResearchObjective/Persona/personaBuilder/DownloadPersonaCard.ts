import React from 'react';
import { createRoot } from 'react-dom/client';
import jsPDF from 'jspdf';
import type { PersonaCardData } from './PersonaCardRenderer';
import PersonaCardRenderer from './PersonaCardRenderer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DownloadOptions {
  cardWidth?: number;
  scale?: number;
  filePrefix?: string;
  onProgress?: (completed: number, total: number) => void;
}

// ── Safe filename ─────────────────────────────────────────────────────────────

function safeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9_\-\s]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 60)
    .toLowerCase();
}

// ── Core renderer ─────────────────────────────────────────────────────────────

/**
 * Renders a PersonaCardRenderer to a canvas via html2canvas.
 *
 * KEY FIXES vs the blank-PDF version:
 *  1. Container uses `position:absolute` (not fixed) inside a real scrollable
 *     wrapper so the browser actually paints it.
 *  2. `opacity:0.01` (not `visibility:hidden`) — invisible to the user but
 *     still painted, so html2canvas can read the pixels.
 *  3. We capture the card element directly (not the wrapper) and pass
 *     explicit `width` + `height` from the element's bounding rect.
 *  4. A 300 ms settle time (not just rAF) gives web fonts time to load.
 *  5. `backgroundColor` is set to the card's actual bg (#050505) so the
 *     canvas is never transparent / empty.
 */
async function renderPersonaToCanvas(
  persona: PersonaCardData,
  cardWidth: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;

  // ── 1. Outer scroll-host (hides the card from the user) ──────────────────
  const scrollHost = document.createElement('div');
  scrollHost.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    `width:${cardWidth}px`,
    'height:1px',          // only 1 px tall — card overflows below visible area
    'overflow:hidden',
    'opacity:0.01',        // nearly invisible but still painted
    'pointer-events:none',
    'z-index:-1',
  ].join(';');
  document.body.appendChild(scrollHost);

  // ── 2. Inner mount point — full height, scrolled out of view ─────────────
  const mount = document.createElement('div');
  mount.style.cssText = [
    'position:absolute',
    'top:0',
    'left:0',
    `width:${cardWidth}px`,
  ].join(';');
  scrollHost.appendChild(mount);

  // ── 3. Render React card ──────────────────────────────────────────────────
  const root = createRoot(mount);
  root.render(
    React.createElement(PersonaCardRenderer, { persona, width: cardWidth }),
  );

  // Wait for React commit + layout + web-font load
  await new Promise<void>(resolve => setTimeout(resolve, 300));

  // ── 4. Measure actual rendered height ────────────────────────────────────
  const cardEl = mount.firstElementChild as HTMLElement;
  const { width: elW, height: elH } = cardEl.getBoundingClientRect();

  // Expand scrollHost to full card height for the capture frame
  scrollHost.style.height = `${elH}px`;

  // One more frame for the browser to repaint at the new height
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  // ── 5. Capture ────────────────────────────────────────────────────────────
  const canvas = await html2canvas(cardEl, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#050505',
    logging: false,
    width: Math.round(elW) || cardWidth,
    height: Math.round(elH) || Math.round(cardWidth * 1.4),
    scrollX: 0,
    scrollY: 0,
    ignoreElements: el => el.hasAttribute('data-html2canvas-ignore'),
  });

  // ── 6. Clean up ───────────────────────────────────────────────────────────
  root.unmount();
  document.body.removeChild(scrollHost);

  return canvas;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Renders selected persona cards and saves them as a single PDF,
 * one card per page.
 *
 * Single  → `persona-card_<name>.pdf`
 * Multiple → `persona_cards_N.pdf`
 */
export async function downloadPersonaCards(
  selectedIds: string[],
  allPersonas: PersonaCardData[],
  options: DownloadOptions = {},
): Promise<void> {
  const {
    cardWidth = 900,
    scale = 2,
    filePrefix = 'persona-card',
    onProgress,
  } = options;

  // Preserve selection order
  const personas = selectedIds
    .map(id => allPersonas.find(p => p.id === id))
    .filter((p): p is PersonaCardData => !!p);

  if (personas.length === 0) return;

  onProgress?.(0, personas.length);

  // Render sequentially to keep memory under control
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < personas.length; i++) {
    const canvas = await renderPersonaToCanvas(personas[i]!, cardWidth, scale);
    canvases.push(canvas);
    onProgress?.(i + 1, personas.length);
  }

  // ── Build PDF ─────────────────────────────────────────────────────────────
  let pdf: jsPDF | null = null;

  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i]!;
    const pageW = canvas.width;
    const pageH = canvas.height;
    const orientation = pageW >= pageH ? 'landscape' : 'portrait';

    if (i === 0) {
      pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [pageW, pageH],
        compress: true,
      });
    } else {
      pdf!.addPage([pageW, pageH], orientation);
    }

    pdf!.addImage(
      canvas.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0, 0,
      pageW,
      pageH,
    );
  }

  if (!pdf) return;

  const filename =
    personas.length === 1
      ? `${filePrefix}_${safeFilename(personas[0]!.name ?? 'persona')}.pdf`
      : `persona_cards_${personas.length}.pdf`;

  pdf.save(filename);
}

// ── Drop-in alias (keeps PersonaBuilder.tsx import unchanged) ─────────────────

export async function downloadPersonaCardsFrontend(
  selectedIds: string[],
  allPersonas: PersonaCardData[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  return downloadPersonaCards(selectedIds, allPersonas, {
    cardWidth: 900,
    scale: 2,
    filePrefix: 'persona-card',
    ...(onProgress && { onProgress }),
  });
}