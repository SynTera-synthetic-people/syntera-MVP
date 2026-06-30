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

/**
 * Returned after the PDF is built so the caller can ALWAYS offer a manual
 * "click here to download" fallback, regardless of whether the automatic
 * download actually fired. This is the key change: we no longer assume
 * pdf.save() succeeded just because it didn't throw.
 */
export interface DownloadResult {
  filename: string;
  blobUrl: string;
  blob: Blob;
  /** True if we believe the automatic download was triggered without error. */
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

// ── Wait for fonts without an arbitrary fixed delay ───────────────────────────
//
// The previous version used a flat `setTimeout(300)` per card. That's both
// unreliable (fonts may not be ready yet on a slow/cold machine) AND wasteful
// (it stretches out the gap between the user's click and the eventual
// pdf.save() call, which on Chrome risks the action falling outside the
// "transient user activation" window and being silently blocked as if it
// were an unsolicited download). document.fonts.ready resolves as soon as
// fonts are actually usable, which is both faster on a warm cache and safer
// on a cold one. We still cap it with a timeout so a font fetch failure can
// never hang the whole pipeline forever.
async function waitForFonts(timeoutMs = 1500): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.race([
    document.fonts.ready.catch(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  ]);
  // Two extra animation frames so layout has definitely settled post-font-swap.
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

// ── Core renderer ─────────────────────────────────────────────────────────────

async function renderPersonaToCanvas(
  persona: PersonaCardData,
  cardWidth: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;

  const scrollHost = document.createElement('div');
  scrollHost.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    `width:${cardWidth}px`,
    'height:1px',
    'overflow:hidden',
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

    // Let React commit, then wait for fonts/layout instead of a blind 300ms.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await waitForFonts();

    const cardEl = mount.firstElementChild as HTMLElement | null;
    if (!cardEl) {
      throw new Error('Persona card failed to mount for capture (no root element found).');
    }

    const { width: elW, height: elH } = cardEl.getBoundingClientRect();
    if (!elW || !elH) {
      throw new Error('Persona card rendered with zero size — capture aborted.');
    }

    scrollHost.style.height = `${elH}px`;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    // windowWidth/windowHeight pin html2canvas's internal cloned-document
    // viewport to the card's own size instead of the host browser window.
    // Without this, Windows display scaling (125%/150%/etc.), devtools being
    // open, or a narrower/wider browser window than the one used to test can
    // change how html2canvas's offscreen clone lays things out — a very
    // plausible reason this "only fails on one machine."
    const canvas = await html2canvas(cardEl, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#050505',
      logging: false,
      width: Math.round(elW),
      height: Math.round(elH),
      windowWidth: Math.round(elW),
      windowHeight: Math.round(elH),
      scrollX: 0,
      scrollY: 0,
      ignoreElements: el => el.hasAttribute('data-html2canvas-ignore'),
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('html2canvas produced an empty canvas.');
    }

    return canvas;
  } finally {
    // Always clean up, even if capture threw, so a failed card never leaks
    // a detached React root or a stray DOM node into the page.
    root.unmount();
    scrollHost.remove();
  }
}

// ── Trigger the actual file save ──────────────────────────────────────────────
//
// jsPDF's internal `save()` does effectively this under the hood, but doing
// it ourselves lets us (a) know for certain a Blob was produced, (b) hand
// the Blob back to the caller for a guaranteed manual fallback link, and
// (c) keep the anchor-click as close as possible to PDF completion rather
// than relying on an opaque internal implementation.
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
    // Revoke after a delay rather than immediately — revoking too early can
    // cancel an in-flight download on some Chrome/Windows builds.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (err) {
    console.error('[downloadPersonaCards] triggerBrowserDownload failed:', err);
    return false;
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

  // Build the PDF incrementally (capture → add page → discard canvas)
  // instead of holding every canvas in memory at once. With this card's
  // size (900px wide, scale 2, many sections), a handful of canvases held
  // simultaneously can be tens of millions of pixels — a realistic source
  // of an OOM/blank-canvas failure on a lower-memory machine that simply
  // never shows up on a beefier dev machine.
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
      // One bad card should not take down the whole batch — log it, skip it,
      // and keep going so the user still gets the personas that worked.
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

// ── Drop-in alias (keeps PersonaBuilder.tsx import unchanged) ─────────────────
//
// NOTE: this now returns a DownloadResult instead of void. PersonaBuilder.tsx
// needs a small update (see accompanying notes) to use the returned blobUrl
// for a manual fallback link — that's the part that actually guarantees the
// user gets their file even if the automatic trigger is silently blocked.

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