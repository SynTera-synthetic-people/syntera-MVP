import React, { useRef, useState } from "react";
import SpIcon from "../../../../SPIcon";
import "./FileUploadModal.css";

// ─── Constants (mirror Add Material) ─────────────────────────────────────────

const BRIEF_EXTENSIONS = [".pdf", ".pptx", ".ppt", ".docx", ".doc", ".xlsx", ".xls"];
const BRIEF_MAX_BYTES = 5 * 1024 * 1024;

const ARTIFACT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const ARTIFACT_MAX_BYTES = 10 * 1024 * 1024;

const ARTIFACT_MAX_LINKS = 3;

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
  artifactFile: File | null;
  artifactLinks: string[];
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

// ─── Upload zone with drag-and-drop ──────────────────────────────────────────

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
  const [artifactFile, setArtifactFile] = useState<SlotFile | null>(
    initialValue?.artifactFile
      ? { file: initialValue.artifactFile, sizeLabel: formatFileSize(initialValue.artifactFile.size) }
      : null
  );

  if (!isOpen) return null;

  const handleDone = () => {
    onDone({
      briefFile: briefFile?.file ?? null,
      briefLink: briefLink.trim(),
      artifactFile: artifactFile?.file ?? null,
      artifactLinks: artifactLinks.map(l => l.value.trim()).filter(Boolean),
    });
    onClose();
  };

  const updateArtifactLink = (id: string, value: string) =>
    setArtifactLinks(prev => prev.map(l => l.id === id ? { ...l, value } : l));

  const removeArtifactLink = (id: string) =>
    setArtifactLinks(prev => prev.filter(l => l.id !== id));

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
            <div className="fum-section fum-section--coming-soon">
              <div className="fum-coming-soon-overlay">
                <span className="fum-coming-soon-badge">Coming Soon</span>
              </div>
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

                <UploadZone
                  slot={artifactFile}
                  acceptExtensions={ARTIFACT_EXTENSIONS}
                  maxBytes={ARTIFACT_MAX_BYTES}
                  formatsLabel="PNG, JPG, GIF, WEBP"
                  compact
                  onFileAccepted={file =>
                    setArtifactFile({ file, sizeLabel: formatFileSize(file.size) })
                  }
                  onRemove={() => setArtifactFile(null)}
                />
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
            <button className="fum-btn-done" onClick={handleDone} type="button">
              Done
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FileUploadModal;