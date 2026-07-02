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

// ── Render readiness guard ────────────────────────────────────────────────────

/**
 * Waits for document fonts AND all <img> elements in the container to settle,
 * then yields two animation frames (layout → paint) before returning.
 *
 * This replaces the previous hardcoded 300 ms timeout which was a race:
 *  - fonts not yet swapped → blank text
 *  - images not yet decoded → broken placeholders
 *  - single rAF not enough on slow hardware
 */
async function waitForRender(container: HTMLElement): Promise<void> {
  // Block until every @font-face the browser knows about has loaded.
  await document.fonts.ready;

  // Settle any <img> tags (e.g. avatars). We resolve on both load and error so
  // a failed image never blocks the download indefinitely.
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  if (images.length > 0) {
    await Promise.allSettled(
      images.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>(resolve => {
          const settle = () => {
            img.removeEventListener('load', settle);
            img.removeEventListener('error', settle);
            resolve();
          };
          img.addEventListener('load', settle);
          img.addEventListener('error', settle);
        });
      }),
    );
  }

  // Two rAFs: first fires after layout recalc, second after actual pixel paint.
  await new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function getCanvasSourceSize(source: CanvasImageSource): { width: number; height: number } | null {
  const maybeSized = source as {
    width?: unknown;
    height?: unknown;
    naturalWidth?: unknown;
    naturalHeight?: unknown;
    videoWidth?: unknown;
    videoHeight?: unknown;
  };

  const width =
    typeof maybeSized.naturalWidth === 'number' ? maybeSized.naturalWidth :
      typeof maybeSized.videoWidth === 'number' ? maybeSized.videoWidth :
        typeof maybeSized.width === 'number' ? maybeSized.width :
          null;

  const height =
    typeof maybeSized.naturalHeight === 'number' ? maybeSized.naturalHeight :
      typeof maybeSized.videoHeight === 'number' ? maybeSized.videoHeight :
        typeof maybeSized.height === 'number' ? maybeSized.height :
          null;

  return width === null || height === null ? null : { width, height };
}

async function withCreatePatternGuard<T>(capture: () => Promise<T>): Promise<T> {
  const originalCreatePattern = CanvasRenderingContext2D.prototype.createPattern;
  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = 1;
  fallbackCanvas.height = 1;

  CanvasRenderingContext2D.prototype.createPattern = function (
    image: CanvasImageSource,
    repetition: string | null,
  ): CanvasPattern | null {
    const size = getCanvasSourceSize(image);
    if (size && (size.width < 1 || size.height < 1)) {
      return originalCreatePattern.call(this, fallbackCanvas, repetition);
    }

    return originalCreatePattern.call(this, image, repetition);
  };

  try {
    return await capture();
  } finally {
    CanvasRenderingContext2D.prototype.createPattern = originalCreatePattern;
  }
}

function sanitizeHtml2CanvasClone(doc: Document, clonedEl: HTMLElement): void {
  const win = doc.defaultView;
  const elements = [clonedEl, ...Array.from(clonedEl.querySelectorAll<HTMLElement>('*'))];

  elements.forEach(el => {
    const computed = win?.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const width = Math.abs(rect.width);
    const height = Math.abs(rect.height);
    const backgroundImage = computed?.backgroundImage ?? el.style.backgroundImage;
    const hasGradientBackground = backgroundImage.includes('gradient(');
    const hasZeroOrSubPixelBox =
      width === 0 ||
      height === 0 ||
      (width > 0 && width < 1) ||
      (height > 0 && height < 1);

    if (hasZeroOrSubPixelBox) {
      el.style.backgroundImage = 'none';
      el.style.boxShadow = 'none';
      return;
    }

    if (hasGradientBackground) {
      el.style.backgroundImage = 'none';
      const backgroundColor = computed?.backgroundColor;
      if (!backgroundColor || backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
        el.style.backgroundColor = '#0d0d0d';
      }
    }
  });
}

// ── Core renderer ─────────────────────────────────────────────────────────────

async function renderPersonaToCanvas(
  persona: PersonaCardData,
  cardWidth: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;

  // ── 1. Off-screen container ───────────────────────────────────────────────
  //
  // CRITICAL: Do NOT use overflow:hidden here.
  // html2canvas walks the ancestor chain to build clip rectangles. Any
  // overflow:hidden ancestor (even one that's been expanded to full height)
  // causes html2canvas to create clipping canvases for every child element.
  // When a child has 0 width (e.g. a progress bar at 0%, a 0-width gradient
  // div), html2canvas calls createPattern() on a 0×0 canvas → InvalidStateError.
  //
  // Instead: position:fixed with a large negative left pushes the card fully
  // off-screen to the left. The browser still paints fixed-position elements
  // regardless of their viewport position, so html2canvas reads correct pixels.
  // No overflow clipping → no 0-sized intermediate canvases.
  const scrollHost = document.createElement('div');
  scrollHost.style.cssText = [
    'position:fixed',
    'top:0',
    `left:-${cardWidth + 200}px`,
    `width:${cardWidth}px`,
    'opacity:0.01',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');
  document.body.appendChild(scrollHost);

  const mount = document.createElement('div');
  mount.style.cssText = [
    'position:absolute',
    'top:0',
    'left:0',
    `width:${cardWidth}px`,
  ].join(';');
  scrollHost.appendChild(mount);

  const root = createRoot(mount);

  try {
    // ── 2. Render ─────────────────────────────────────────────────────────
    root.render(
      React.createElement(PersonaCardRenderer, { persona, width: cardWidth }),
    );

    // ── 3. Wait for fonts, images, and two paint frames ───────────────────
    await waitForRender(mount);

    // ── 4. Measure ────────────────────────────────────────────────────────
    const cardEl = mount.firstElementChild as HTMLElement | null;
    if (!cardEl) {
      throw new Error(
        `PersonaCardRenderer produced no DOM for persona "${persona.name ?? 'unknown'}"`,
      );
    }

    const { width: elW, height: elH } = cardEl.getBoundingClientRect();
    if (elH === 0) {
      throw new Error(
        `Persona card "${persona.name ?? 'unknown'}" has zero height — layout did not complete`,
      );
    }

    // ── 5. Capture ────────────────────────────────────────────────────────
    return await withCreatePatternGuard(() =>
      html2canvas(cardEl, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#050505',
        logging: false,
        width: Math.round(elW) || cardWidth,
        height: Math.round(elH),
        scrollX: 0,
        scrollY: 0,
        onclone: (doc, clonedEl) => {
          sanitizeHtml2CanvasClone(doc, clonedEl);
        },
        ignoreElements: el => el.hasAttribute('data-html2canvas-ignore'),
      }),
    );
  } finally {
    // ── 6. Guaranteed cleanup ─────────────────────────────────────────────
    root.unmount();
    if (document.body.contains(scrollHost)) {
      document.body.removeChild(scrollHost);
    }
  }
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
