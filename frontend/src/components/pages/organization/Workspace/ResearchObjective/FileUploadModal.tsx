import React, { useRef, useState } from "react";
import SpIcon from "../../../../SPIcon";
import "./FileUploadModal.css";

// ─── Constants (mirror Add Material) ─────────────────────────────────────────

const BRIEF_EXTENSIONS = [".pdf", ".pptx", ".ppt", ".docx", ".doc", ".xlsx", ".xls"];
const BRIEF_MAX_BYTES = 5 * 1024 * 1024;

const ARTIFACT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const ARTIFACT_MAX_BYTES = 10 * 1024 * 1024;

const ARTIFACT_MAX_LINKS = 3;
const ARTIFACT_MAX_FILES = 4;
const ARTIFACT_COMING_SOON = true;

// How Omi should relate 2+ artifacts within this section to each other.
// Only surfaced once a second artifact (link or file) is attached — a lone
// artifact has nothing to be compared, unified, or sequenced against.
// Kept in sync with ResearchObjectiveFramer's ARTIFACT_CATEGORIES.
export type ArtifactCategory = "compare" | "campaign_set" ;

const ARTIFACT_CATEGORIES: { id: ArtifactCategory; label: string; description: string }[] = [
  {
    id: "compare",
    label: "Compare",
    description: "Different concepts competing for the same spot. Omi shows personas the options together and finds out which one resonates more, and why.",
  },
  {
    id: "campaign_set",
    label: "Campaign Set",
    description: "Assets from one campaign, meant to work together. Omi checks whether they feel consistent and tell one story, rather than picking a favorite.",
  },
  // {
  //   id: "sequence",
  //   label: "Sequence",
  //   description: "Assets meant to be seen in order — a funnel, a teaser-to-reveal, or a multi-step flow. Omi tests whether each step earns the next.",
  // },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isLikelyValidUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return Boolean(url.hostname && url.hostname.includes("."));
  } catch {
    return false;
  }
};

const makeLinkId = () =>
  `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotFile {
  file: File;
  sizeLabel: string;
}

interface LinkEntry {
  id: string;
  value: string;
}

export interface FileUploadModalValue {
  briefFile: File | null;
  briefLink: string;
  artifactFiles: File[];
  artifactLinks: string[];
  artifactCategory: ArtifactCategory | null;
}

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: (value: FileUploadModalValue) => void;
  /** Optionally pass initial values when re-opening after a previous session */
  initialValue?: Partial<FileUploadModalValue> | undefined;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const LinkIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-1.93 1.93a5 5 0 0 0 7.07 7.07L13.5 18.5"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ─── Upload zone with drag-and-drop (single file — used by Research Brief) ──

interface UploadZoneProps {
  slot: SlotFile | null;
  acceptExtensions: string[];
  maxBytes: number;
  formatsLabel: string;
  compact?: boolean;
  onFileAccepted: (file: File) => void;
  onRemove: () => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({
  slot, acceptExtensions, maxBytes, formatsLabel, compact,
  onFileAccepted, onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (file: File) => {
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    if (!acceptExtensions.includes(ext)) {
      setError(`Unsupported type. Allowed: ${formatsLabel}`);
      return;
    }
    if (file.size > maxBytes) {
      setError(`Too large. Max ${formatFileSize(maxBytes)}.`);
      return;
    }
    setError(null);
    onFileAccepted(file);
  };

  if (slot) {
    return (
      <div className="fum-file-card">
        <span className="fum-file-icon">
          <SpIcon name="sp-File-File_Blank" />
        </span>
        <div className="fum-file-info">
          <span className="fum-file-name">{slot.file.name}</span>
          <span className="fum-file-size">{slot.sizeLabel}</span>
        </div>
        <button
          className="fum-file-remove"
          onClick={onRemove}
          type="button"
          aria-label="Remove file"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="fum-upload-slot">
      <div
        className={[
          "fum-upload-zone",
          compact ? "fum-upload-zone--compact" : "",
          isDragOver ? "fum-upload-zone--dragover" : "",
        ].filter(Boolean).join(" ")}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) acceptFile(file);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <span className="fum-upload-icon">
          <SpIcon name="sp-File-Cloud_Upload" />
        </span>
        <span className="fum-upload-label">
          {compact ? "Click to upload image" : <>Drop files here,<br />or click to upload</>}
        </span>
        <input
          ref={inputRef}
          type="file"
          className="fum-hidden-input"
          accept={acceptExtensions.join(",")}
          onChange={e => {
            // e.target.files is a LIVE FileList tied to the input, not a
            // snapshot — extract the File we need BEFORE clearing the input,
            // otherwise clearing it also empties this same FileList.
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) acceptFile(file);
          }}
        />
      </div>
      {error && <p className="fum-error">{error}</p>}
      <p className="fum-formats">
        <strong>Max {formatFileSize(maxBytes)}</strong> · {formatsLabel}
      </p>
    </div>
  );
};

// ─── Multi upload zone (up to maxFiles — used by Artifact) ──────────────────
// Mirrors ResearchObjectiveFramer's MultiUploadSlot: each accepted file gets
// its own removable card, and the dropzone stays visible (with a running
// count) until the cap is reached.

interface MultiUploadZoneProps {
  slots: SlotFile[];
  acceptExtensions: string[];
  maxBytes: number;
  maxFiles: number;
  formatsLabel: string;
  compact?: boolean;
  onFilesAccepted: (files: File[]) => void;
  onRemoveAt: (index: number) => void;
}

const MultiUploadZone: React.FC<MultiUploadZoneProps> = ({
  slots, acceptExtensions, maxBytes, maxFiles, formatsLabel, compact,
  onFilesAccepted, onRemoveAt,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = Math.max(0, maxFiles - slots.length);
  const canAddMore = remaining > 0;

  const acceptFiles = (incoming: File[]) => {
    const toProcess = incoming.slice(0, remaining);
    const overflow = incoming.length > toProcess.length;

    const accepted: File[] = [];
    let nextError: string | null = overflow
      ? `You can attach up to ${maxFiles} files — extra files were skipped.`
      : null;

    for (const file of toProcess) {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!acceptExtensions.includes(ext)) {
        nextError = `Unsupported type. Allowed: ${formatsLabel}`;
        continue;
      }
      if (file.size > maxBytes) {
        nextError = `Too large. Max ${formatFileSize(maxBytes)}.`;
        continue;
      }
      accepted.push(file);
    }

    setError(nextError);
    if (accepted.length) onFilesAccepted(accepted);
  };

  return (
    <div className="fum-upload-slot">
      {slots.length > 0 && (
        <div className="fum-file-list">
          {slots.map((slot, i) => (
            <div className="fum-file-card" key={`${slot.file.name}-${i}`}>
              <span className="fum-file-icon">
                <SpIcon name="sp-File-File_Blank" />
              </span>
              <div className="fum-file-info">
                <span className="fum-file-name">{slot.file.name}</span>
                <span className="fum-file-size">{slot.sizeLabel}</span>
              </div>
              <button
                className="fum-file-remove"
                onClick={() => onRemoveAt(i)}
                type="button"
                aria-label={`Remove ${slot.file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <div
          className={[
            "fum-upload-zone",
            compact ? "fum-upload-zone--compact" : "",
            isDragOver ? "fum-upload-zone--dragover" : "",
          ].filter(Boolean).join(" ")}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.length) acceptFiles(Array.from(e.dataTransfer.files));
          }}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        >
          <span className="fum-upload-icon">
            <SpIcon name="sp-File-Cloud_Upload" />
          </span>
          <span className="fum-upload-label">
            {compact ? "Click to upload image" : <>Drop files here,<br />or click to upload</>}
            {slots.length > 0 && <> ({slots.length}/{maxFiles})</>}
          </span>
          <input
            ref={inputRef}
            type="file"
            className="fum-hidden-input"
            accept={acceptExtensions.join(",")}
            multiple
            onChange={e => {
              // Same live-FileList gotcha as the single-file zone above:
              // snapshot into a plain array BEFORE clearing e.target.value,
              // since clearing it also empties the live FileList in place.
              const selected = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = "";
              if (selected.length) acceptFiles(selected);
            }}
          />
        </div>
      )}

      {error && <p className="fum-error">{error}</p>}
      <p className="fum-formats">
        <strong>Max {formatFileSize(maxBytes)} each</strong> · {formatsLabel} · up to {maxFiles} files
      </p>
    </div>
  );
};

// ─── Artifact category chips (Compare / Campaign Set / Sequence) ────────────

interface ArtifactCategoryChipsProps {
  value: ArtifactCategory | null;
  onChange: (category: ArtifactCategory) => void;
}

const ArtifactCategoryChips: React.FC<ArtifactCategoryChipsProps> = ({ value, onChange }) => (
  <div className="fum-cat-group">
    <label className="fum-cat-label">How should Omi treat these together?</label>
    <div className="fum-cat-row">
      {ARTIFACT_CATEGORIES.map(cat => (
        <button
          key={cat.id}
          type="button"
          className={[
            "fum-cat-chip",
            value === cat.id ? "fum-cat-chip--active" : "",
          ].filter(Boolean).join(" ")}
          onClick={() => onChange(cat.id)}
          aria-pressed={value === cat.id}
        >
          {cat.label}
        </button>
      ))}
    </div>
    {value && (
      <p className="fum-cat-desc">
        {ARTIFACT_CATEGORIES.find(c => c.id === value)?.description}
      </p>
    )}
  </div>
);

// ─── Link row ─────────────────────────────────────────────────────────────────

interface LinkRowProps {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  removable?: boolean;
  onRemove?: () => void;
}

const LinkRow: React.FC<LinkRowProps> = ({ value, placeholder, onChange, removable, onRemove }) => {
  const [touched, setTouched] = useState(false);
  const valid = isLikelyValidUrl(value);
  const showX = Boolean(value) || removable;

  return (
    <div>
      <div className={["fum-link-row", touched && !valid ? "fum-link-row--error" : ""].filter(Boolean).join(" ")}>
        <span className="fum-link-icon"><LinkIcon /></span>
        <input
          type="url"
          inputMode="url"
          className="fum-link-input"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          autoComplete="off"
        />
        {showX && (
          <button
            type="button"
            className="fum-link-clear"
            onClick={() => {
              if (value) { onChange(""); setTouched(false); }
              else if (onRemove) onRemove();
            }}
            aria-label={value ? "Clear link" : "Remove link field"}
          >
            ×
          </button>
        )}
      </div>
      {touched && !valid && (
        <p className="fum-error">Doesn't look like a valid URL — double-check and try again.</p>
      )}
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

export const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen, onClose, onDone, initialValue,
}) => {
  // Brief
  const [briefLink, setBriefLink] = useState(initialValue?.briefLink ?? "");
  const [briefFile, setBriefFile] = useState<SlotFile | null>(
    initialValue?.briefFile
      ? { file: initialValue.briefFile, sizeLabel: formatFileSize(initialValue.briefFile.size) }
      : null
  );

  // Artifact
  const [artifactLinks, setArtifactLinks] = useState<LinkEntry[]>(() => {
    const saved = initialValue?.artifactLinks?.filter(Boolean) ?? [];
    return saved.length
      ? saved.map(v => ({ id: makeLinkId(), value: v }))
      : [{ id: makeLinkId(), value: "" }];
  });
  const [artifactFiles, setArtifactFiles] = useState<SlotFile[]>(() =>
    (initialValue?.artifactFiles ?? []).map(file => ({ file, sizeLabel: formatFileSize(file.size) }))
  );
  const [artifactCategory, setArtifactCategory] = useState<ArtifactCategory | null>(
    initialValue?.artifactCategory ?? null
  );

  if (!isOpen) return null;

  // Counts distinct artifacts attached so far (filled links + files), so the
  // category selector only appears once there's actually something to relate.
  const artifactItemCount =
    artifactLinks.filter(l => l.value.trim()).length + artifactFiles.length;
  // With 2+ artifacts, a category is required — otherwise Omi doesn't know
  // whether to compare, unify, or sequence them.
  const artifactNeedsCategory = artifactItemCount >= 2 && !artifactCategory;

  const handleDone = () => {
    if (artifactNeedsCategory) return;
    onDone({
      briefFile: briefFile?.file ?? null,
      briefLink: briefLink.trim(),
      artifactFiles: artifactFiles.map(s => s.file),
      artifactLinks: artifactLinks.map(l => l.value.trim()).filter(Boolean),
      artifactCategory,
    });
    onClose();
  };

  const updateArtifactLink = (id: string, value: string) =>
    setArtifactLinks(prev => prev.map(l => l.id === id ? { ...l, value } : l));

  const removeArtifactLink = (id: string) =>
    setArtifactLinks(prev => prev.filter(l => l.id !== id));

  const addArtifactFiles = (files: File[]) =>
    setArtifactFiles(prev => [
      ...prev,
      ...files.map(file => ({ file, sizeLabel: formatFileSize(file.size) })),
    ]);

  const removeArtifactFileAt = (index: number) =>
    setArtifactFiles(prev => prev.filter((_, i) => i !== index));

  const canAddArtifactLink = artifactLinks.length < ARTIFACT_MAX_LINKS;

  return (
    <div
      className="fum-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Add supporting material"
      onClick={e => { if ((e.target as HTMLElement).classList.contains("fum-overlay")) onClose(); }}
    >
      <div className="fum-modal">

        {/* Header */}
        <div className="fum-header">
          <h2 className="fum-title">Add supporting material</h2>
          <button
            className="fum-close"
            onClick={onClose}
            type="button"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="fum-body">
          <div className="fum-sections-row">

            {/* ── Research Brief ─────────────────────────────────────── */}
            <div className="fum-section">
              <div className="fum-section-head">
                <h3 className="fum-section-title">Research Brief</h3>
                <p className="fum-section-sub">
                  Documents, reports, or references to help Omi understand the business context.
                </p>
              </div>

              <LinkRow
                value={briefLink}
                placeholder="Paste a document, drive, or report link"
                onChange={setBriefLink}
              />

              <UploadZone
                slot={briefFile}
                acceptExtensions={BRIEF_EXTENSIONS}
                maxBytes={BRIEF_MAX_BYTES}
                formatsLabel="PDF, PPTX, DOCX, XLSX"
                onFileAccepted={file =>
                  setBriefFile({ file, sizeLabel: formatFileSize(file.size) })
                }
                onRemove={() => setBriefFile(null)}
              />
            </div>

            {/* ── Artifact ───────────────────────────────────────────── */}
            <div
              className={[
                "fum-section",
                ARTIFACT_COMING_SOON ? "fum-section--coming-soon" : "",
              ].filter(Boolean).join(" ")}
            >
              {ARTIFACT_COMING_SOON && (
                <div className="fum-coming-soon-overlay">
                  <span className="fum-coming-soon-badge">Coming Soon</span>
                </div>
              )}
              <div className="fum-section">
                <div className="fum-section-head">
                  <h3 className="fum-section-title">Artifact</h3>
                  <p className="fum-section-sub">
                    Creatives, videos, images, or landing pages for Omi to test with personas.
                  </p>
                </div>

                {artifactLinks.map((link, idx) => (
                  <LinkRow
                    key={link.id}
                    value={link.value}
                    placeholder="Paste a YouTube, video, image, or page URL"
                    onChange={value => updateArtifactLink(link.id, value)}
                    removable={artifactLinks.length > 1 || idx > 0}
                    onRemove={() => removeArtifactLink(link.id)}
                  />
                ))}

                {canAddArtifactLink && (
                  <button
                    type="button"
                    className="fum-add-link-btn"
                    onClick={() =>
                      setArtifactLinks(prev => [...prev, { id: makeLinkId(), value: "" }])
                    }
                  >
                    <PlusIcon /> Add another link
                  </button>
                )}

                <MultiUploadZone
                  slots={artifactFiles}
                  acceptExtensions={ARTIFACT_EXTENSIONS}
                  maxBytes={ARTIFACT_MAX_BYTES}
                  maxFiles={ARTIFACT_MAX_FILES}
                  formatsLabel="PNG, JPG, GIF, WEBP"
                  compact
                  onFilesAccepted={addArtifactFiles}
                  onRemoveAt={removeArtifactFileAt}
                />

                {artifactItemCount >= 2 && (
                  <ArtifactCategoryChips
                    value={artifactCategory}
                    onChange={setArtifactCategory}
                  />
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="fum-footer">
          <p className="fum-footnote">Your materials are used only to support this exploration.</p>
          <div className="fum-footer-actions">
            <button className="fum-btn-cancel" onClick={onClose} type="button">
              Cancel
            </button>
            <div className="fum-footer-done-wrap">
              <button
                className={["fum-btn-done", artifactNeedsCategory ? "fum-btn-done--disabled" : ""].filter(Boolean).join(" ")}
                onClick={handleDone}
                disabled={artifactNeedsCategory}
                type="button"
              >
                Done
              </button>
              {artifactNeedsCategory && (
                <p className="fum-done-hint">Pick how the artifacts relate to continue</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FileUploadModal;