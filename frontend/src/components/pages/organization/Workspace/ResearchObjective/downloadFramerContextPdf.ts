// Text-based PDF export of everything the user typed into the Research
// Objective Framer, offered from the Preview step (see PreviewTab in
// ResearchObjectiveFramer.tsx).
//
// Deliberately NOT an html2canvas screenshot of the preview box (the approach
// DownloadPersonaCard.ts uses for persona cards): that box is a dark,
// max-height-420px scroll container, so a raster capture would either clip the
// content or print white-on-black. Drawing the text directly with jsPDF gives
// selectable/searchable text, proper page breaks on long answers, and a
// light print-friendly page - at a fraction of the memory.
//
// Encoding note: jsPDF's built-in Helvetica is WinAnsi (cp1252) only, so smart
// quotes / dashes / bullets are fine, but non-Latin scripts (e.g. Devanagari)
// and emoji cannot be drawn without embedding a Unicode font. sanitizeForPdf()
// folds the symbols users most often paste down to ASCII; anything still
// outside cp1252 becomes "?" rather than silent mojibake.

// ── Types ─────────────────────────────────────────────────────────────────────

/** Structurally identical to PreviewSection in ResearchObjectiveFramer.tsx -
 *  kept local so this module has no dependency back on the component. */
export interface FramerPdfSection {
    heading: string;
    body: string;
}

export interface FramerPdfMeta {
    /** Brand/company from the Context tab - used in the subtitle + filename. */
    brandName?: string;
}

// ── Layout constants (pt - 1/72") ─────────────────────────────────────────────

const MARGIN_X = 56;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 58;

const TITLE_SIZE = 21;
const SUBTITLE_SIZE = 10.5;
const HEADING_SIZE = 9.5;
const BODY_SIZE = 10.5;
const FOOTER_SIZE = 8;

const BODY_LINE_HEIGHT = 15.5;
const HEADING_TO_BODY = 15;
const SECTION_GAP = 22;

const INK: [number, number, number] = [17, 20, 26];
const MUTED: [number, number, number] = [122, 130, 143];
const ACCENT: [number, number, number] = [14, 99, 236]; // #0E63EC - the framer's CTA blue
const RULE: [number, number, number] = [223, 227, 234];

// ── Text sanitising ───────────────────────────────────────────────────────────

type CodepointRange = number | [number, number];

const escapeCodepoint = (cp: number) => "\\u" + cp.toString(16).padStart(4, "0");

/** Builds a character-class regex from numeric codepoints. Declaring these
 *  ranges as numbers rather than literals keeps control characters, zero-width
 *  joiners and exotic spaces out of this source file, where they would be
 *  invisible to anyone reading it. */
const charClassRegex = (ranges: CodepointRange[]) =>
    new RegExp(
        "[" +
            ranges
                .map(r => (typeof r === "number" ? escapeCodepoint(r) : `${escapeCodepoint(r[0])}-${escapeCodepoint(r[1])}`))
                .join("") +
            "]",
        "gu",
    );

const CHAR_FOLDS: Array<[RegExp, string]> = [
    // Hyphen/dash variants. U+2013/2014 are cp1252, but folding the whole run
    // keeps every dash a predictable width in the output.
    [charClassRegex([[0x2010, 0x2015]]), "-"],
    // Arrows.
    [charClassRegex([0x2190, 0x21d0]), "<-"],
    [charClassRegex([0x2192, 0x21d2]), "->"],
    // List markers users paste in from docs/slides.
    [charClassRegex([0x25cf, 0x25aa, 0x25ab, 0x2043]), "-"],
    // Check marks.
    [charClassRegex([0x2713, 0x2714]), "[x]"],
    // Non-breaking / figure / narrow spaces. These render, but splitTextToSize
    // will not wrap on them, so a pasted run can push a line past the margin.
    [charClassRegex([0x00a0, 0x2007, 0x202f]), " "],
    // C0 controls + DEL (newline and tab are normalised separately below).
    [charClassRegex([[0x0000, 0x0008], [0x000b, 0x000c], [0x000e, 0x001f], 0x007f]), ""],
    // Zero-width spaces/joiners and bidi overrides: invisible in the textarea,
    // garbage once drawn.
    [charClassRegex([[0x200b, 0x200f], [0x202a, 0x202e], 0x2060, 0xfeff]), ""],
];

// cp1252 maps 27 printable characters into 0x80-0x9F: smart quotes, en/em dash,
// bullet, ellipsis, euro, trademark and friends. jsPDF's WinAnsi encoder draws
// all of them, so they must survive the filter below even though their Unicode
// codepoints sit above U+00FF.
const CP1252_HIGH = [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
    0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
];

const UNSUPPORTED_CHARS = new RegExp(
    "[^" + escapeCodepoint(0x0000) + "-" + escapeCodepoint(0x00ff) + CP1252_HIGH.map(escapeCodepoint).join("") + "]",
    "gu",
);

function sanitizeForPdf(text: string): string {
    let out = CHAR_FOLDS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
    out = out.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
    // Whatever is left cannot be encoded by the built-in fonts.
    out = out.replace(UNSUPPORTED_CHARS, "?");
    return out;
}

// ── Filename helpers ──────────────────────────────────────────────────────────

function safeFilenamePart(name: string): string {
    return name
        .replace(/[^a-z0-9_\-\s]/gi, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48)
        .toLowerCase();
}

/** Local YYYY-MM-DD (not toISOString, which shifts the date across UTC). */
function isoDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Browser download trigger ──────────────────────────────────────────────────

/**
 * Blob URL + hidden anchor, mirroring DownloadPersonaCard.ts. Preferred over
 * jsPDF's own save() because the await on the lazily-loaded jspdf chunk can
 * outlive the browser's transient user-activation window on a cold cache,
 * which silently cancels the download save() starts internally.
 */
function triggerBrowserDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking too early cancels an in-flight download on some Chrome builds.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Renders the compiled framer sections to a PDF and hands it to the browser.
 * Resolves with the filename that was downloaded.
 */
export async function downloadFramerContextPdf(
    sections: FramerPdfSection[],
    meta: FramerPdfMeta = {},
): Promise<string> {
    const filled = sections.filter(s => s.body.trim());
    if (filled.length === 0) {
        throw new Error("Nothing to export - no framer sections have been filled in.");
    }

    // Imported on click, not at module scope: the framer route is reached
    // without ever pressing this button, and jspdf is ~350 KB of parse work.
    // (It currently still lands in the main chunk because DownloadPersonaCard
    // imports it statically — this keeps the framer independent of that.)
    const { default: JsPDF } = await import("jspdf");

    const doc = new JsPDF({ unit: "pt", format: "a4", compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - MARGIN_X * 2;

    let y = MARGIN_TOP;

    /** Breaks to a new page when `needed` pt of vertical space is not left. */
    const ensureSpace = (needed: number) => {
        if (y + needed <= pageHeight - MARGIN_BOTTOM) return;
        doc.addPage();
        y = MARGIN_TOP;
    };

    // ── Title block ──────────────────────────────────────────────────────────
    const generatedOn = new Date();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TITLE_SIZE);
    doc.setTextColor(...INK);
    doc.text("Research framing", MARGIN_X, y);
    y += 20;

    const brand = sanitizeForPdf((meta.brandName ?? "").trim());
    const generatedLabel = `Generated ${generatedOn.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    })}`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(SUBTITLE_SIZE);
    doc.setTextColor(...MUTED);
    doc.text([brand, generatedLabel].filter(Boolean).join("  |  "), MARGIN_X, y);
    y += 14;

    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.8);
    doc.line(MARGIN_X, y, pageWidth - MARGIN_X, y);
    y += 30;

    // ── Sections ─────────────────────────────────────────────────────────────
    filled.forEach((section, index) => {
        // Keep a heading with at least the first two lines of its body.
        ensureSpace(HEADING_TO_BODY + BODY_LINE_HEIGHT * 2);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(HEADING_SIZE);
        doc.setTextColor(...ACCENT);
        doc.text(sanitizeForPdf(section.heading).toUpperCase(), MARGIN_X, y);
        y += HEADING_TO_BODY;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(BODY_SIZE);
        doc.setTextColor(...INK);

        // Every newline the preview shows is its own logical line, wrapped
        // independently so "Label: value" pairs never run together.
        sanitizeForPdf(section.body)
            .split("\n")
            .forEach(paragraph => {
                if (!paragraph.trim()) {
                    y += BODY_LINE_HEIGHT * 0.5;
                    return;
                }
                (doc.splitTextToSize(paragraph, contentWidth) as string[]).forEach(line => {
                    ensureSpace(BODY_LINE_HEIGHT);
                    doc.text(line, MARGIN_X, y);
                    y += BODY_LINE_HEIGHT;
                });
            });

        if (index < filled.length - 1) {
            y += SECTION_GAP / 2;
            ensureSpace(SECTION_GAP / 2);
            doc.setDrawColor(...RULE);
            doc.setLineWidth(0.5);
            doc.line(MARGIN_X, y, pageWidth - MARGIN_X, y);
            y += SECTION_GAP;
        }
    });

    // ── Footers (needs the final page count, so this runs last) ───────────────
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(FOOTER_SIZE);
        doc.setTextColor(...MUTED);
        const footerY = pageHeight - MARGIN_BOTTOM / 2;
        doc.text("Research framing", MARGIN_X, footerY);
        doc.text(`Page ${page} of ${totalPages}`, pageWidth - MARGIN_X, footerY, { align: "right" });
    }

    const filename =
        ["research-framing", safeFilenamePart(brand), isoDate(generatedOn)]
            .filter(Boolean)
            .join("_") + ".pdf";

    triggerBrowserDownload(doc.output("blob"), filename);
    return filename;
}
