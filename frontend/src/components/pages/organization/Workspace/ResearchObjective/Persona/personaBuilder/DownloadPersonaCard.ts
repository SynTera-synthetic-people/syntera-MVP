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

export interface DownloadResult {
  filename: string;
  blobUrl: string;
  blob: Blob;
  /** True if we believe the automatic browser download was triggered. */
  autoTriggered: boolean;
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
 * Replaces the old flat 300ms setTimeout, which was a race:
 *  - fonts not yet swapped → blank text on cold cache
 *  - images not decoded → broken placeholders
 *  - single rAF not enough on slow hardware
 */
async function waitForRender(container: HTMLElement): Promise<void> {
  await document.fonts.ready;

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

// ── createPattern guard ───────────────────────────────────────────────────────

function getCanvasSourceSize(source: CanvasImageSource): { width: number; height: number } | null {
  const s = source as {
    width?: unknown; height?: unknown;
    naturalWidth?: unknown; naturalHeight?: unknown;
    videoWidth?: unknown; videoHeight?: unknown;
  };
  const width =
    typeof s.naturalWidth === 'number' ? s.naturalWidth :
    typeof s.videoWidth   === 'number' ? s.videoWidth   :
    typeof s.width        === 'number' ? s.width        : null;
  const height =
    typeof s.naturalHeight === 'number' ? s.naturalHeight :
    typeof s.videoHeight   === 'number' ? s.videoHeight   :
    typeof s.height        === 'number' ? s.height        : null;
  return width === null || height === null ? null : { width, height };
}

/**
 * Temporarily monkey-patches CanvasRenderingContext2D.createPattern so that
 * any 0×0 source canvas is replaced with a 1×1 transparent fallback instead
 * of throwing InvalidStateError. Restores the original after capture.
 *
 * This is a belt-and-suspenders defence on top of the primary fixes in
 * PersonaCardRenderer (conditional progress-bar fills) and the onclone
 * sanitizer below. If html2canvas ever creates a 0-size intermediate canvas
 * for a CSS construct we haven't anticipated, this catches it without crashing.
 */
async function withCreatePatternGuard<T>(capture: () => Promise<T>): Promise<T> {
  const original = CanvasRenderingContext2D.prototype.createPattern;
  const fallback = document.createElement('canvas');
  fallback.width = 1;
  fallback.height = 1;

  CanvasRenderingContext2D.prototype.createPattern = function (
    image: CanvasImageSource,
    repetition: string | null,
  ): CanvasPattern | null {
    const size = getCanvasSourceSize(image);
    if (size && (size.width < 1 || size.height < 1)) {
      return original.call(this, fallback, repetition);
    }
    return original.call(this, image, repetition);
  };

  try {
    return await capture();
  } finally {
    CanvasRenderingContext2D.prototype.createPattern = original;
  }
}

// ── Clone sanitizer ───────────────────────────────────────────────────────────

/**
 * Called via html2canvas's onclone callback. Strips gradient backgrounds and
 * box-shadows from any element that html2canvas has laid out at 0 or sub-pixel
 * dimensions. These are the elements that trigger the createPattern crash
 * (html2canvas creates a 0×0 canvas for the gradient, then calls createPattern
 * on it which is an InvalidStateError per the spec).
 *
 * Gradient elements are replaced with their solid computed backgroundColor
 * (defaulting to the card surface colour #0d0d0d) so the card still looks
 * correct — gradients on large visible elements are preserved.
 */
function sanitizeHtml2CanvasClone(doc: Document, clonedEl: HTMLElement): void {
  const win = doc.defaultView;
  const all = [clonedEl, ...Array.from(clonedEl.querySelectorAll<HTMLElement>('*'))];

  all.forEach(el => {
    const computed = win?.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const w = Math.abs(rect.width);
    const h = Math.abs(rect.height);
    const bgImage = computed?.backgroundImage ?? el.style.backgroundImage;
    const isGradient = bgImage.includes('gradient(');
    const isZeroOrSubPixel = w === 0 || h === 0 || (w > 0 && w < 1) || (h > 0 && h < 1);

    if (isZeroOrSubPixel) {
      el.style.backgroundImage = 'none';
      el.style.boxShadow = 'none';
      return;
    }

    if (isGradient) {
      el.style.backgroundImage = 'none';
      const bg = computed?.backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
        el.style.backgroundColor = '#0d0d0d';
      }
    }
  });
}

// ── Browser download trigger ──────────────────────────────────────────────────

/**
 * Creates a blob URL, clicks a hidden anchor, and defers URL revocation.
 * More reliable than jsPDF.save() which internally does the same thing but
 * can be silently blocked if the call lands outside the browser's transient
 * user-activation window (e.g. when capture took > 5 s on a slow machine).
 */
function triggerBrowserDownload(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after 60 s — revoking too early can cancel an in-flight download
    // on some Chrome/Windows builds.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (err) {
    console.error('[downloadPersonaCards] triggerBrowserDownload failed:', err);
    return false;
  }
}

// ── Core renderer ─────────────────────────────────────────────────────────────

const CARD_BACKGROUND_COLOR = '#050505'; // must match BG in PersonaCardRenderer.tsx

async function renderPersonaToCanvas(
  persona: PersonaCardData,
  cardWidth: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;

  // CRITICAL: Do NOT use overflow:hidden on the container.
  // html2canvas walks the full ancestor chain to build clip rectangles. Any
  // overflow:hidden ancestor — even one that has been expanded to the card's
  // full height — causes html2canvas to create a clipping canvas for every
  // child element. When a child is 0-wide (e.g. a progress bar fill at 0%,
  // a 0-width decorative div), that clipping canvas is 0×0 and the subsequent
  // createPattern() call throws InvalidStateError.
  //
  // Fix: position:fixed with a large negative left — the browser always paints
  // fixed-position elements regardless of their viewport position, so
  // html2canvas reads correct pixels with no ancestor clip rectangle.
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
    root.render(React.createElement(PersonaCardRenderer, { persona, width: cardWidth }));

    // Deterministic readiness: fonts + images + two paint frames.
    await waitForRender(mount);

    const cardEl = mount.firstElementChild as HTMLElement | null;
    if (!cardEl) {
      throw new Error(
        `PersonaCardRenderer produced no DOM for persona "${persona.name ?? 'unknown'}"`,
      );
    }

    const { width: elW } = cardEl.getBoundingClientRect();
    if (cardEl.scrollHeight === 0) {
      throw new Error(
        `Persona card "${persona.name ?? 'unknown'}" has zero height — layout did not complete`,
      );
    }

    // IMPORTANT: We only pin WIDTH here, never height.
    //
    // Width needs to be pinned because it drives text reflow — without a
    // fixed windowWidth, Windows display scaling (125%/150%) or devtools
    // open/closed can change how the off-screen clone wraps text.
    //
    // Height must NOT be pinned. It is a *measured output* of layout, not an
    // independent input — html2canvas re-implements CSS text/line-wrap layout
    // itself instead of using the real browser engine, so its internally
    // measured content height routinely differs from what
    // getBoundingClientRect() reports for the live DOM, and the difference
    // scales with how much text/how many wrapped lines a given persona's
    // data produces (barriers, triggers, Ground Truth Foundation content,
    // etc.) — so no fixed guess-buffer can cover every case. Passing an
    // explicit `height`/`windowHeight` therefore causes html2canvas to
    // silently crop anything beyond that number, which is what was cutting
    // off the bottom of persona cards. Omitting height/windowHeight lets
    // html2canvas capture however tall the content actually renders — always
    // complete, never cropped, and with no manual measurement to get wrong.
    const captureW = Math.ceil(elW) || cardWidth;

    const canvas = await withCreatePatternGuard(() =>
      html2canvas(cardEl, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: CARD_BACKGROUND_COLOR,
        logging: false,
        width: captureW,
        windowWidth: captureW,
        scrollX: 0,
        scrollY: 0,
        onclone: (doc, clonedEl) => sanitizeHtml2CanvasClone(doc, clonedEl),
        ignoreElements: el => el.hasAttribute('data-html2canvas-ignore'),
      }),
    );

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('html2canvas produced an empty canvas.');
    }

    return canvas;
  } finally {
    // Always clean up — even if capture threw — so a failed card never leaks
    // a detached React root or a stray DOM node into the page.
    root.unmount();
    if (document.body.contains(scrollHost)) {
      document.body.removeChild(scrollHost);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function downloadPersonaCards(
  selectedIds: string[],
  allPersonas: PersonaCardData[],
  options: DownloadOptions = {},
): Promise<DownloadResult | null> {
  const {
    cardWidth = 900,
    scale = 2,
    filePrefix = 'persona-card',
    onProgress,
  } = options;

  const personas = selectedIds
    .map(id => allPersonas.find(p => p.id === id))
    .filter((p): p is PersonaCardData => !!p);

  if (personas.length === 0) {
    throw new Error('No matching personas found for the selected IDs.');
  }

  onProgress?.(0, personas.length);

  let pdf: jsPDF | null = null;
  const failedNames: string[] = [];

  // Render sequentially and add each page immediately — avoids holding every
  // canvas in memory simultaneously (each 900px-wide @2x card is ~7 MB of
  // pixel data; a handful at once can hit OOM on lower-memory machines).
  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i]!;
    try {
      const canvas = await renderPersonaToCanvas(persona, cardWidth, scale);
      const pageW = canvas.width;
      const pageH = canvas.height;
      const orientation = pageW >= pageH ? 'landscape' : 'portrait';

      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: 'px', format: [pageW, pageH], compress: true });
      } else {
        pdf.addPage([pageW, pageH], orientation);
      }

      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, pageH);
    } catch (err) {
      // One bad card does not abort the batch — log, skip, continue.
      console.error(`[downloadPersonaCards] failed to render "${persona.name ?? persona.id}":`, err);
      failedNames.push(persona.name ?? persona.id);
    }
    onProgress?.(i + 1, personas.length);
  }

  if (!pdf) {
    throw new Error(
      `Failed to generate any persona cards.${failedNames.length ? ` Failed: ${failedNames.join(', ')}` : ''}`,
    );
  }

  if (failedNames.length > 0) {
    console.warn(`[downloadPersonaCards] ${failedNames.length} card(s) skipped:`, failedNames);
  }

  const filename =
    personas.length === 1
      ? `${filePrefix}_${safeFilename(personas[0]!.name ?? 'persona')}.pdf`
      : `persona_cards_${personas.length}.pdf`;

  const blob = pdf.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const autoTriggered = triggerBrowserDownload(blob, filename);

  return { filename, blobUrl, blob, autoTriggered };
}

// ── Drop-in alias ─────────────────────────────────────────────────────────────

export async function downloadPersonaCardsFrontend(
  selectedIds: string[],
  allPersonas: PersonaCardData[],
  onProgress?: (done: number, total: number) => void,
): Promise<DownloadResult | null> {
  return downloadPersonaCards(selectedIds, allPersonas, {
    cardWidth: 900,
    scale: 2,
    filePrefix: 'persona-card',
    ...(onProgress && { onProgress }),
  });
}