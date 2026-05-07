import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbX, TbCheck, TbChevronDown, TbInfoCircle,
  TbGripVertical, TbPlus, TbCloudUpload, TbLink,
  TbFile, TbPhoto, TbPlayerPlay, TbDatabase,
} from 'react-icons/tb';
import './QuestionModal.css';

// ── Question type definitions ─────────────────────────────────────────────────

export type QuestionType =
  // Open-End
  | 'text'
  | 'essay'
  | 'number'
  | 'date_picker'       // ← NEW
  | 'auto_suggest'      // ← NEW
  // Select
  | 'single_select'
  | 'multi_select'
  | 'dropdown'
  | 'single_select_grid'
  | 'this_or_that'
  // Rate / Rank / Sort
  | 'button_rating'
  | 'star_rating'
  | 'rating_scale'
  | 'card_rating'
  | 'slider_rating'
  | 'slider'
  | 'rank_sort'
  | 'card_sort'
  | 'maxdiff'
  // Stimulus-Based                // ← NEW GROUP
  | 'image_map'                   // ← NEW
  | 'page_turner'                  // ← NEW
  | 'video_player'                 // ← NEW
  | 'video_player_embed'           // ← NEW
  // Participant Upload            // ← NEW GROUP
  | 'image_upload'                 // ← NEW
  // Structural
  | 'section'
  | 'note'
  | 'exec'
  | 'import_data'
  | 'autosum';

interface TypeMeta {
  label: string;
  tooltip: string;
  instructionPlaceholder: string;
}

const TYPE_META: Record<QuestionType, TypeMeta> = {
  text:               { label: 'Text',                         tooltip: 'Open-ended text response. Participants answer in their own words.', instructionPlaceholder: 'Please be as precise as possible' },
  essay:              { label: 'Essay',                        tooltip: 'Long-form open-ended response for detailed answers.', instructionPlaceholder: 'Please be as detailed as possible' },
  number:             { label: 'Number (Integer and Float)',   tooltip: 'Participants enter a numeric value.', instructionPlaceholder: 'Please enter a numeric value only' },
  // ── NEW ──
  date_picker:        { label: 'Date picker',                  tooltip: 'Participants select a date from a calendar picker.', instructionPlaceholder: 'Select date' },
  auto_suggest:       { label: 'Auto Suggest',                 tooltip: 'Participants type and receive auto-suggested answers from an uploaded source file.', instructionPlaceholder: 'Be specific' },
  // ─────────
  single_select:      { label: 'Single Select',                tooltip: 'Participants select only one answer from the list.', instructionPlaceholder: 'Select one' },
  multi_select:       { label: 'Multi-Select',                 tooltip: 'Participants can choose one or more answers from the list.', instructionPlaceholder: 'Select all that apply' },
  dropdown:           { label: 'Dropdown',                     tooltip: 'Participants select one answer from a dropdown menu.', instructionPlaceholder: 'Select one' },
  single_select_grid: { label: 'Single Select Grid',           tooltip: 'Participants select one answer per row in a grid layout.', instructionPlaceholder: 'Select one per row' },
  this_or_that:       { label: 'This or That',                 tooltip: 'Participants choose between two paired options.', instructionPlaceholder: 'Please select the option you prefer between the two shown below' },
  button_rating:      { label: 'Button Rating',                tooltip: 'Participants rate items using buttons.', instructionPlaceholder: 'Select One' },
  star_rating:        { label: 'Star Rating',                  tooltip: 'Participants rate items using stars with tooltip labels.', instructionPlaceholder: 'Select One' },
  rating_scale:       { label: 'Rating Scale',                 tooltip: 'Participants rate items on a scale with rows and columns.', instructionPlaceholder: 'Please keep it open' },
  card_rating:        { label: 'Card Rating',                  tooltip: 'Participants rate cards by dragging them.', instructionPlaceholder: 'Rate the following products by dragging cards' },
  slider_rating:      { label: 'Slider Rating',                tooltip: 'Participants rate on a sliding scale.', instructionPlaceholder: 'Slide to rate your satisfaction' },
  slider:             { label: 'Slider',                       tooltip: 'A simple slider question type.', instructionPlaceholder: 'Slide to rate your satisfaction' },
  rank_sort:          { label: 'Rank Sort',                    tooltip: 'Participants rank items in order of preference.', instructionPlaceholder: 'Rank the following brands in order of preference' },
  card_sort:          { label: 'Card Sort',                    tooltip: 'Participants sort cards into buckets or categories.', instructionPlaceholder: 'Single Select' },
  maxdiff:            { label: 'MaxDiff',                      tooltip: 'Participants select most and least important attributes.', instructionPlaceholder: 'Select the MOST and LEAST important feature' },
  // ── NEW ──
  image_map:          { label: 'Image Map',                    tooltip: 'Participants click on specific areas of an uploaded image.', instructionPlaceholder: 'Click on the part of the image you like most' },
  page_turner:        { label: 'Page Turner',                  tooltip: 'Participants page through a set of uploaded images.', instructionPlaceholder: 'Click on the part of the image you like most' },
  video_player:       { label: 'Video Player',                 tooltip: 'Participants watch an uploaded video before answering.', instructionPlaceholder: 'Watch the video and answer questions' },
  video_player_embed: { label: 'Video Player (YouTube / Vimeo)', tooltip: 'Participants watch an embedded YouTube or Vimeo video.', instructionPlaceholder: 'Watch the video and answer questions' },
  image_upload:       { label: 'Image Upload',                 tooltip: 'Participants upload one or more images as their response.', instructionPlaceholder: 'Please upload a photo of your recent purchase' },
  // ─────────
  section:            { label: 'Section',                      tooltip: 'Display a section header. No response is collected.', instructionPlaceholder: 'Content goes...' },
  note:               { label: 'Note',                         tooltip: 'Display a note to participants. No response is collected.', instructionPlaceholder: 'Please answer honestly' },
  exec:               { label: 'Exec',                         tooltip: 'System execution element. No visible text shown to participants.', instructionPlaceholder: 'System execution, no visible text' },
  import_data:        { label: 'Import Data',                  tooltip: 'Import background data silently.', instructionPlaceholder: 'Background data loaded silently' },
  autosum:            { label: 'Autosum',                      tooltip: 'Automatically sums values from previous questions.', instructionPlaceholder: 'Backend functionality' },
};

// Grouped options for the dropdown
const TYPE_GROUPS: { label: string; types: QuestionType[] }[] = [
  {
    label: 'Open-End',
    types: ['text', 'essay', 'number', 'date_picker', 'auto_suggest'], // ← date_picker + auto_suggest added
  },
  {
    label: 'Select',
    types: ['single_select', 'multi_select', 'dropdown', 'single_select_grid', 'this_or_that'],
  },
  {
    label: 'Rate, Rank & Sort',
    types: ['button_rating', 'star_rating', 'rating_scale', 'card_rating', 'slider_rating', 'slider', 'rank_sort', 'card_sort', 'maxdiff'],
  },
  {
    // ── NEW GROUP ──
    label: 'Stimulus-Based',
    types: ['image_map', 'page_turner', 'video_player', 'video_player_embed'],
  },
  {
    // ── NEW GROUP ──
    label: 'Participant Upload',
    types: ['image_upload'],
  },
  {
    label: 'Structural',
    types: ['section', 'note', 'exec', 'import_data', 'autosum'],
  },
];

// ── Question data model ───────────────────────────────────────────────────────

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  instruction?: string;
  // Select types
  options?: string[];
  // Single Select Grid / This or That rows
  rows?: string[];
  // Single Select Grid / This or That columns / Rating Scale columns
  columns?: string[];
  // This or That left/right pairs
  leftOptions?: string[];
  rightOptions?: string[];
  // Rank Sort
  rankLabels?: string[];
  rankItems?: string[];
  // Card Sort
  cards?: string[];
  buckets?: string[];
  // MaxDiff
  attributes?: string[];
  maxdiffColumns?: string[];
  // Star Rating
  starTooltips?: string[];
  starRows?: string[];
  // Rating Scale
  scaleRows?: string[];
  scaleColumns?: string[];
  // Card Rating
  cardRatingCards?: string[];
  cardRatingButtons?: string[];
  // Slider Rating
  sliderPoints?: string[];
  sliders?: string[];
  // Button Rating
  buttonRatingRows?: string[];
  // Section
  sectionName?: string;
  // Note
  noteText?: string;
  // Exec
  execInstruction?: string;
  // ── NEW fields ──
  // Auto Suggest
  autoSuggestSourceFile?: File | null;
  autoSuggestSourceFileName?: string;
  // Image Map
  imageMapFiles?: FileItem[];
  imageMapMarkers?: string[];
  // Page Turner
  pageTurnerPages?: FileItem[];
  // Video Player
  videoFile?: File | null;
  videoFileName?: string;
  // Video Player Embed
  videoEmbedName?: string;
  videoEmbedUrl?: string;
  // Image Upload
  imageUploadFiles?: FileItem[];
}

// Simple file item representation (stores name + optional object URL for preview)
interface FileItem {
  name: string;
  url?: string;
}

const makeId = () => Math.random().toString(36).slice(2, 8);

export const defaultQuestion = (): Question => ({
  id: makeId(),
  type: 'single_select',
  text: '',
  required: false,
  instruction: '',
  options: ['', ''],
  rows: [''],
  columns: [''],
  leftOptions: ['', ''],
  rightOptions: ['', ''],
  rankLabels: ['Button 1', 'Button 2'],
  rankItems: ['Button 1', 'Button 2'],
  cards: ['Button 1', 'Button 2'],
  buckets: ['Button 1', 'Button 2'],
  attributes: ['Button 1', 'Button 2'],
  maxdiffColumns: ['Button 1', 'Button 2'],
  starTooltips: ['Text', 'Text', 'Text', 'Text', 'Text'],
  starRows: ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'],
  scaleRows: ['Text', 'Text', 'Text', 'Text', 'Text'],
  scaleColumns: ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'],
  cardRatingCards: ['Text', 'Text', 'Text', 'Text', 'Text'],
  cardRatingButtons: ['Button 1', 'Button 2'],
  sliderPoints: ['Text', 'Text', 'Text', 'Text', 'Text'],
  sliders: ['Button 1', 'Button 2'],
  buttonRatingRows: ['Text'],
  sectionName: '',
  noteText: '',
  execInstruction: '',
  // ── NEW defaults ──
  autoSuggestSourceFile: null,
  autoSuggestSourceFileName: '',
  imageMapFiles: [],
  imageMapMarkers: [''],
  pageTurnerPages: [],
  videoFile: null,
  videoFileName: '',
  videoEmbedName: '',
  videoEmbedUrl: '',
  imageUploadFiles: [],
});

// ── Sub-components ────────────────────────────────────────────────────────────

// Info tooltip
const InfoTooltip: React.FC<{ type: QuestionType }> = ({ type }) => {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[type];
  return (
    <span className="qm-info-wrap">
      <button
        type="button"
        className="qm-info-btn"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Type info"
      >
        <TbInfoCircle size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="qm-tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
          >
            <p className="qm-tooltip__title">{meta.label}</p>
            <p className="qm-tooltip__body">{meta.tooltip}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
};

// Generic list editor
interface ListEditorProps {
  label: string;
  required?: boolean;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel?: string;
  placeholder?: string;
  showImport?: boolean;
  importLabel?: string;
  minItems?: number;
}

const ListEditor: React.FC<ListEditorProps> = ({
  label,
  required = true,
  items,
  onChange,
  addLabel = 'Add New Row',
  placeholder = 'Text',
  showImport = true,
  importLabel = 'Import Choices',
  minItems = 1,
}) => {
  const update = (i: number, val: string) => {
    const next = [...items];
    next[i] = val;
    onChange(next);
  };
  const remove = (i: number) => {
    if (items.length <= minItems) return;
    onChange(items.filter((_, idx) => idx !== i));
  };
  const add = () => onChange([...items, '']);

  return (
    <div className="qm-list-editor">
      {label && (
        <label className="qm-label">
          {label} {required && <span className="qm-required">*</span>}
        </label>
      )}
      <div className="qm-list-editor__items">
        {items.map((item, i) => (
          <div key={i} className="qm-list-editor__row">
            <TbGripVertical size={14} className="qm-drag-handle" />
            <input
              className="qm-row-input"
              value={item}
              placeholder={placeholder}
              onChange={(e) => update(i, e.target.value)}
            />
            {items.length > minItems && (
              <button type="button" className="qm-remove-btn" onClick={() => remove(i)}>
                <TbX size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="qm-list-actions">
        <button type="button" className="qm-add-row-btn" onClick={add}>
          <TbPlus size={13} />
          {addLabel}
        </button>
        {showImport && (
          <button type="button" className="qm-import-btn">
            <TbCloudUpload size={14} />
            {importLabel}
          </button>
        )}
      </div>
    </div>
  );
};

// ── NEW: File chip — shows an uploaded file with type-aware icon ──────────────
// Icon varies by file type, matching Figma:
//   video (.mp4 / .mov)          → play circle  (TbPlayerPlay)
//   image (.jpg / .jpeg / .png)  → photo frame  (TbPhoto)
//   data  (.csv / .xlsx / .json) → database     (TbDatabase)
//   other                        → generic file (TbFile)
const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext))
    return <TbPlayerPlay size={16} className="qm-file-chip__icon qm-file-chip__icon--video" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext))
    return <TbPhoto size={16} className="qm-file-chip__icon qm-file-chip__icon--image" />;
  if (['csv', 'xlsx', 'xls', 'json'].includes(ext))
    return <TbDatabase size={16} className="qm-file-chip__icon qm-file-chip__icon--data" />;
  return <TbFile size={16} className="qm-file-chip__icon" />;
};

const FileChip: React.FC<{ name: string; onRemove: () => void }> = ({ name, onRemove }) => (
  <div className="qm-file-chip">
    {getFileIcon(name)}
    <span className="qm-file-chip__name">{name}</span>
    <button type="button" className="qm-file-chip__remove" onClick={onRemove} aria-label="Remove file">
      <TbX size={13} />
    </button>
  </div>
);

// ── NEW: Upload zone — dashed teal zone for file uploads ──────────────────────
interface UploadZoneProps {
  label: string;        // e.g. "Upload Image .jpg or .png"
  accept?: string;      // e.g. "image/*"
  onFiles: (files: File[]) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ label, accept = '*', onFiles }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="qm-upload-zone"
      onClick={() => inputRef.current?.click()}
    >
      <TbCloudUpload size={22} />
      <span>{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
        }}
      />
    </div>
  );
};

// Pair editor for This or That (left column + right column)
interface PairEditorProps {
  leftItems: string[];
  rightItems: string[];
  onChangeLeft: (items: string[]) => void;
  onChangeRight: (items: string[]) => void;
}

const PairEditor: React.FC<PairEditorProps> = ({ leftItems, rightItems, onChangeLeft, onChangeRight }) => {
  const count = Math.max(leftItems.length, rightItems.length);

  const updateLeft = (i: number, val: string) => {
    const next = [...leftItems];
    next[i] = val;
    onChangeLeft(next);
  };
  const updateRight = (i: number, val: string) => {
    const next = [...rightItems];
    next[i] = val;
    onChangeRight(next);
  };
  const removePair = (i: number) => {
    onChangeLeft(leftItems.filter((_, idx) => idx !== i));
    onChangeRight(rightItems.filter((_, idx) => idx !== i));
  };
  const addPair = () => {
    onChangeLeft([...leftItems, '']);
    onChangeRight([...rightItems, '']);
  };

  return (
    <div className="qm-list-editor">
      <label className="qm-label">
        Options <span className="qm-required">*</span>
      </label>
      <div className="qm-grid-header">
        <span>Left Legend</span>
        <span>Right Legend</span>
      </div>
      <div className="qm-list-editor__items">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="qm-pair-row">
            <TbGripVertical size={14} className="qm-drag-handle" />
            <div className="qm-pair-inputs">
              <input
                className="qm-row-input"
                value={leftItems[i] ?? ''}
                placeholder="Text"
                onChange={(e) => updateLeft(i, e.target.value)}
              />
              <input
                className="qm-row-input"
                value={rightItems[i] ?? ''}
                placeholder="Text"
                onChange={(e) => updateRight(i, e.target.value)}
              />
            </div>
            {count > 1 && (
              <button type="button" className="qm-remove-btn" onClick={() => removePair(i)}>
                <TbX size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="qm-list-actions">
        <button type="button" className="qm-add-row-btn" onClick={addPair}>
          <TbPlus size={13} />
          Add New Row
        </button>
        <button type="button" className="qm-import-btn">
          <TbCloudUpload size={14} />
          Import Choices
        </button>
      </div>
    </div>
  );
};

// ── Type-specific fields renderer ─────────────────────────────────────────────

const TypeFields: React.FC<{ q: Question; set: <K extends keyof Question>(k: K, v: Question[K]) => void }> = ({ q, set }) => {
  switch (q.type) {
    // ── Open-End ──────────────────────────────────────────────────────────────
    case 'text':
    case 'essay':
    case 'number':
      return null;

    // ── NEW: Date Picker — no extra fields beyond Question + Instruction ───────
    case 'date_picker':
      return null;

    // ── NEW: Auto Suggest ─────────────────────────────────────────────────────
    // Upload Answer Source File + Rows + Columns
    case 'auto_suggest': {
      const sourceFileName = q.autoSuggestSourceFileName ?? '';
      return (
        <>
          {/* Upload source file zone / chip */}
          <div className="qm-field">
            {sourceFileName ? (
              <div className="qm-upload-header">
                <label className="qm-label">Source File <span className="qm-required">*</span></label>
                <FileChip
                  name={sourceFileName}
                  onRemove={() => { set('autoSuggestSourceFileName', ''); set('autoSuggestSourceFile', null); }}
                />
              </div>
            ) : (
              <UploadZone
                label="Upload Answer Source File"
                accept=".csv,.xlsx,.json"
                onFiles={(files) => {
                  if (files[0]) {
                    set('autoSuggestSourceFile', files[0] as any);
                    set('autoSuggestSourceFileName', files[0].name);
                  }
                }}
              />
            )}
          </div>
          <ListEditor
            label="Rows"
            items={q.rows ?? ['']}
            onChange={(v) => set('rows', v)}
            addLabel="Add New Row"
            placeholder="Text"
          />
          <ListEditor
            label="Columns"
            required={false}
            items={q.columns ?? ['']}
            onChange={(v) => set('columns', v)}
            addLabel="Add New Column"
            placeholder="Text"
            showImport={false}
          />
        </>
      );
    }

    // ── Single Select / Multi-Select / Dropdown ───────────────────────────────
    case 'single_select':
    case 'multi_select':
    case 'dropdown':
      return (
        <ListEditor
          label="Options"
          items={q.options ?? ['']}
          onChange={(v) => set('options', v)}
          addLabel="Add Option"
          placeholder="Text"
          minItems={1}
        />
      );

    // ── Single Select Grid ────────────────────────────────────────────────────
    case 'single_select_grid':
      return (
        <>
          <ListEditor
            label="Options"
            required
            items={q.rows ?? ['']}
            onChange={(v) => set('rows', v)}
            addLabel="Add New Row"
            placeholder="Text"
          />
          <ListEditor
            label=""
            required={false}
            items={q.columns ?? ['']}
            onChange={(v) => set('columns', v)}
            addLabel="Add New Column"
            placeholder="Text"
          />
        </>
      );

    // ── This or That ──────────────────────────────────────────────────────────
    case 'this_or_that':
      return (
        <>
          <PairEditor
            leftItems={q.leftOptions ?? ['', '']}
            rightItems={q.rightOptions ?? ['', '']}
            onChangeLeft={(v) => set('leftOptions', v)}
            onChangeRight={(v) => set('rightOptions', v)}
          />
          <ListEditor
            label=""
            required={false}
            items={q.columns ?? ['']}
            onChange={(v) => set('columns', v)}
            addLabel="Add New Column"
            placeholder="Text"
          />
        </>
      );

    // ── Button Rating ─────────────────────────────────────────────────────────
    case 'button_rating':
      return (
        <ListEditor
          label="Options"
          items={q.buttonRatingRows ?? ['']}
          onChange={(v) => set('buttonRatingRows', v)}
          addLabel="Add New Row"
          placeholder="Text"
        />
      );

    // ── Star Rating ───────────────────────────────────────────────────────────
    case 'star_rating':
      return (
        <>
          <ListEditor
            label="Star Tooltip"
            required
            items={q.starTooltips ?? ['Text', 'Text', 'Text', 'Text', 'Text']}
            onChange={(v) => set('starTooltips', v)}
            addLabel="Add New Row"
            placeholder="Text"
          />
          <ListEditor
            label="Rows"
            required
            items={q.starRows ?? ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5']}
            onChange={(v) => set('starRows', v)}
            addLabel="Add New Row"
            placeholder="Row"
          />
        </>
      );

    // ── Rating Scale ──────────────────────────────────────────────────────────
    case 'rating_scale':
      return (
        <>
          <ListEditor
            label="Rows"
            required
            items={q.scaleRows ?? ['Text', 'Text', 'Text', 'Text', 'Text']}
            onChange={(v) => set('scaleRows', v)}
            addLabel="Add New Row"
            placeholder="Text"
          />
          <ListEditor
            label="Columns"
            required
            items={q.scaleColumns ?? ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5']}
            onChange={(v) => set('scaleColumns', v)}
            addLabel="Add New Row"
            placeholder="Row"
          />
        </>
      );

    // ── Card Rating ───────────────────────────────────────────────────────────
    case 'card_rating':
      return (
        <>
          <ListEditor
            label="Cards"
            required
            items={q.cardRatingCards ?? ['Text', 'Text', 'Text', 'Text', 'Text']}
            onChange={(v) => set('cardRatingCards', v)}
            addLabel="Add New Card"
            placeholder="Text"
          />
          <ListEditor
            label="Buttons"
            required
            items={q.cardRatingButtons ?? ['Button 1', 'Button 2']}
            onChange={(v) => set('cardRatingButtons', v)}
            addLabel="Add New Button"
            placeholder="Button"
            showImport={false}
          />
        </>
      );

    // ── Slider Rating ─────────────────────────────────────────────────────────
    case 'slider_rating':
      return (
        <>
          <ListEditor
            label="Points"
            required
            items={q.sliderPoints ?? ['Text', 'Text', 'Text', 'Text', 'Text']}
            onChange={(v) => set('sliderPoints', v)}
            addLabel="Add New Point"
            placeholder="Text"
          />
          <ListEditor
            label="Sliders"
            required
            items={q.sliders ?? ['Button 1', 'Button 2']}
            onChange={(v) => set('sliders', v)}
            addLabel="Add New Slider"
            placeholder="Slider"
          />
        </>
      );

    // ── Slider ────────────────────────────────────────────────────────────────
    case 'slider':
      return (
        <ListEditor
          label="Sliders"
          required
          items={q.sliders ?? ['Button 1', 'Button 2']}
          onChange={(v) => set('sliders', v)}
          addLabel="Add New Slider"
          placeholder="Slider"
        />
      );

    // ── Rank Sort ─────────────────────────────────────────────────────────────
    case 'rank_sort':
      return (
        <>
          <ListEditor
            label="Rank Labels"
            required
            items={q.rankLabels ?? ['Button 1', 'Button 2']}
            onChange={(v) => set('rankLabels', v)}
            addLabel="Add New Rank Label"
            placeholder="Button"
            showImport={true}
          />
          <ListEditor
            label="Rankable Items"
            required
            items={q.rankItems ?? ['Button 1', 'Button 2']}
            onChange={(v) => set('rankItems', v)}
            addLabel="Add New Rankable Item"
            placeholder="Button"
          />
        </>
      );

    // ── Card Sort ─────────────────────────────────────────────────────────────
    case 'card_sort':
      return (
        <>
          <ListEditor
            label="Cards"
            required
            items={q.cards ?? ['Button 1', 'Button 2']}
            onChange={(v) => set('cards', v)}
            addLabel="Add New Card"
            placeholder="Button"
          />
          <ListEditor
            label="Buckets"
            required
            items={q.buckets ?? ['Button 1', 'Button 2']}
            onChange={(v) => set('buckets', v)}
            addLabel="Add New Bucket"
            placeholder="Button"
          />
        </>
      );

    // ── MaxDiff ───────────────────────────────────────────────────────────────
    case 'maxdiff':
      return (
        <>
          <ListEditor
            label="Attributes"
            required
            items={q.attributes ?? ['Button 1', 'Button 2']}
            onChange={(v) => set('attributes', v)}
            addLabel="Add New Attribute"
            placeholder="Button"
          />
          <ListEditor
            label="Columns"
            required
            items={q.maxdiffColumns ?? ['Button 1', 'Button 2']}
            onChange={(v) => set('maxdiffColumns', v)}
            addLabel="Add New Column"
            placeholder="Button"
          />
        </>
      );

    // ── NEW: Image Map ────────────────────────────────────────────────────────
    // Upload zone (or chips when files present) + Markers list
    case 'image_map': {
      const files = q.imageMapFiles ?? [];
      return (
        <>
          <div className="qm-field">
            <div className="qm-upload-field-header">
              <label className="qm-label">Images <span className="qm-required">*</span></label>
              {files.length > 0 && (
                <button
                  type="button"
                  className="qm-upload-inline-btn"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.multiple = true;
                    input.onchange = (e) => {
                      const newFiles = Array.from((e.target as HTMLInputElement).files ?? []).map(f => ({ name: f.name }));
                      set('imageMapFiles', [...files, ...newFiles]);
                    };
                    input.click();
                  }}
                >
                  <TbCloudUpload size={14} />
                  Upload Image
                </button>
              )}
            </div>
            {files.length === 0 ? (
              <UploadZone
                label="Upload Image .jpg or .png"
                accept="image/*"
                onFiles={(fs) => set('imageMapFiles', fs.map(f => ({ name: f.name })))}
              />
            ) : (
              <div className="qm-file-chips">
                {files.map((f, i) => (
                  <FileChip
                    key={i}
                    name={f.name}
                    onRemove={() => set('imageMapFiles', files.filter((_, idx) => idx !== i))}
                  />
                ))}
              </div>
            )}
          </div>
          <ListEditor
            label=""
            required={false}
            items={q.imageMapMarkers ?? ['']}
            onChange={(v) => set('imageMapMarkers', v)}
            addLabel="Add New Marker"
            placeholder="Text"
            showImport={true}
            importLabel="Import Markers"
          />
        </>
      );
    }

    // ── NEW: Page Turner ──────────────────────────────────────────────────────
    // Pages section: upload zone or chips when pages present
    case 'page_turner': {
      const pages = q.pageTurnerPages ?? [];
      return (
        <div className="qm-field">
          <div className="qm-upload-field-header">
            <label className="qm-label">Pages <span className="qm-required">*</span></label>
            {pages.length > 0 && (
              <button
                type="button"
                className="qm-upload-inline-btn"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*,video/*';
                  input.multiple = true;
                  input.onchange = (e) => {
                    const newFiles = Array.from((e.target as HTMLInputElement).files ?? []).map(f => ({ name: f.name }));
                    set('pageTurnerPages', [...pages, ...newFiles]);
                  };
                  input.click();
                }}
              >
                <TbCloudUpload size={14} />
                Upload Image
              </button>
            )}
          </div>
          {pages.length === 0 ? (
            <UploadZone
              label="Upload Image"
              accept="image/*,video/*"
              onFiles={(fs) => set('pageTurnerPages', fs.map(f => ({ name: f.name })))}
            />
          ) : (
            <div className="qm-file-chips">
              {pages.map((p, i) => (
                <FileChip
                  key={i}
                  name={p.name}
                  onRemove={() => set('pageTurnerPages', pages.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    // ── NEW: Video Player ─────────────────────────────────────────────────────
    // Upload zone or file chip when video present
    case 'video_player': {
      const videoName = q.videoFileName ?? '';
      return (
        <div className="qm-field">
          {videoName ? (
            <>
              <label className="qm-label">Video <span className="qm-required">*</span></label>
              <FileChip
                name={videoName}
                onRemove={() => { set('videoFileName', ''); set('videoFile', null); }}
              />
            </>
          ) : (
            <UploadZone
              label="Upload Video .mp4 or .mov"
              accept="video/mp4,video/quicktime"
              onFiles={(fs) => {
                if (fs[0]) {
                  set('videoFile', fs[0] as any);
                  set('videoFileName', fs[0].name);
                }
              }}
            />
          )}
        </div>
      );
    }

    // ── NEW: Video Player Embed (YouTube / Vimeo) ──────────────────────────────
    // Name field (required) + URL input with link icon
    case 'video_player_embed':
      return (
        <div className="qm-field">
          <label className="qm-label">
            Name <span className="qm-required">*</span>
          </label>
          <div className="qm-url-input-wrap">
            <TbLink size={15} className="qm-url-input-wrap__icon" />
            <input
              className="qm-url-input"
              type="url"
              value={q.videoEmbedUrl ?? ''}
              placeholder="URL"
              onChange={(e) => set('videoEmbedUrl', e.target.value)}
            />
          </div>
        </div>
      );

    // ── NEW: Image Upload ─────────────────────────────────────────────────────
    // Upload zone or chips with "Upload Image" button top-right when files present
    case 'image_upload': {
      const imgs = q.imageUploadFiles ?? [];
      return (
        <div className="qm-field">
          <div className="qm-upload-field-header">
            <label className="qm-label">Images <span className="qm-required">*</span></label>
            {imgs.length > 0 && (
              <button
                type="button"
                className="qm-upload-inline-btn"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.multiple = true;
                  input.onchange = (e) => {
                    const newFiles = Array.from((e.target as HTMLInputElement).files ?? []).map(f => ({ name: f.name }));
                    set('imageUploadFiles', [...imgs, ...newFiles]);
                  };
                  input.click();
                }}
              >
                <TbCloudUpload size={14} />
                Upload Image
              </button>
            )}
          </div>
          {imgs.length === 0 ? (
            <UploadZone
              label="Upload Image"
              accept="image/*"
              onFiles={(fs) => set('imageUploadFiles', fs.map(f => ({ name: f.name })))}
            />
          ) : (
            <div className="qm-file-chips">
              {imgs.map((img, i) => (
                <FileChip
                  key={i}
                  name={img.name}
                  onRemove={() => set('imageUploadFiles', imgs.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    // ── Section ───────────────────────────────────────────────────────────────
    case 'section':
      return (
        <div className="qm-field">
          <label className="qm-label">Section Name</label>
          <input
            className="qm-text-input"
            value={q.sectionName ?? ''}
            placeholder="Text"
            onChange={(e) => set('sectionName', e.target.value)}
          />
        </div>
      );

    // ── Note ──────────────────────────────────────────────────────────────────
    case 'note':
      return (
        <div className="qm-field">
          <label className="qm-label">Note</label>
          <input
            className="qm-text-input"
            value={q.noteText ?? ''}
            placeholder="Enter note"
            onChange={(e) => set('noteText', e.target.value)}
          />
        </div>
      );

    // ── Exec ──────────────────────────────────────────────────────────────────
    case 'exec':
      return (
        <div className="qm-field">
          <label className="qm-label">Instruction</label>
          <input
            className="qm-text-input"
            value={q.execInstruction ?? ''}
            placeholder="Text"
            onChange={(e) => set('execInstruction', e.target.value)}
          />
        </div>
      );

    // ── Import Data ───────────────────────────────────────────────────────────
    case 'import_data':
      return (
        <UploadZone
          label="Upload Data"
          onFiles={() => {/* wire as needed */}}
        />
      );

    // ── Autosum ───────────────────────────────────────────────────────────────
    case 'autosum':
      return (
        <>
          <ListEditor
            label="Options"
            required={false}
            items={q.rows ?? ['']}
            onChange={(v) => set('rows', v)}
            addLabel="Add New Row"
            placeholder="Text"
          />
          <ListEditor
            label=""
            required={false}
            items={q.columns ?? ['']}
            onChange={(v) => set('columns', v)}
            addLabel="Add New Column"
            placeholder="Text"
          />
        </>
      );

    default:
      return null;
  }
};

// Determine if a type has a Question text field
const hasQuestionField = (type: QuestionType): boolean => {
  const noQuestion: QuestionType[] = ['section', 'note', 'exec', 'import_data'];
  return !noQuestion.includes(type);
};

// Determine if Add btn should be enabled
const canSave = (q: Question): boolean => {
  if (!hasQuestionField(q.type)) return true;
  return q.text.trim().length > 0;
};

// ── Main modal component ──────────────────────────────────────────────────────

export interface QuestionModalProps {
  initial: Question | null;
  sectionTitle: string;
  onSave: (q: Question) => void;
  onClose: () => void;
}

const QuestionModal: React.FC<QuestionModalProps> = ({ initial, sectionTitle, onSave, onClose }) => {
  const [q, setQ] = useState<Question>(() =>
    initial ? { ...defaultQuestion(), ...initial } : defaultQuestion()
  );
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) {
        setTypeOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const set = <K extends keyof Question>(key: K, val: Question[K]) =>
    setQ((prev) => ({ ...prev, [key]: val }));

  const handleTypeChange = (type: QuestionType) => {
    setQ((prev) => ({
      ...defaultQuestion(),
      id: prev.id,
      type,
      text: prev.text,
      required: prev.required,
      instruction: '',
    }));
    setTypeOpen(false);
  };

  const currentMeta = TYPE_META[q.type];
  const isValid = canSave(q);

  return (
    <motion.div
      className="qm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="qm-modal"
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 18 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button className="qm-close" onClick={onClose} aria-label="Close">
          <TbX size={16} />
        </button>

        {/* Header */}
        <div className="qm-header">
          <h2 className="qm-title">
            {initial ? 'Edit Question' : 'Add New Question'}
          </h2>
          <p className="qm-subtitle">Add your question, we'll take it from there.</p>
        </div>

        {/* Body */}
        <div className="qm-body">

          {/* ── Type of question ── */}
          <div className="qm-field" ref={typeRef}>
            <label className="qm-label">
              Type of question <span className="qm-required">*</span>
            </label>
            <div className="qm-type-wrap">
              <button
                type="button"
                className="qm-type-trigger"
                onClick={() => setTypeOpen((o) => !o)}
              >
                <span className="qm-type-trigger__left">
                  <span>{currentMeta.label}</span>
                  <InfoTooltip type={q.type} />
                </span>
                <TbChevronDown
                  size={15}
                  className="qm-type-trigger__chevron"
                  style={{ transform: typeOpen ? 'rotate(180deg)' : 'none' }}
                />
              </button>

              <AnimatePresence>
                {typeOpen && (
                  <motion.div
                    className="qm-type-menu"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.13 }}
                  >
                    {TYPE_GROUPS.map((group) => (
                      <React.Fragment key={group.label}>
                        <div className="qm-type-group-label">{group.label}</div>
                        {group.types.map((type) => (
                          <button
                            key={type}
                            type="button"
                            className={`qm-type-option ${q.type === type ? 'qm-type-option--active' : ''}`}
                            onClick={() => handleTypeChange(type)}
                          >
                            <span>{TYPE_META[type].label}</span>
                            {q.type === type && (
                              <TbCheck size={14} className="qm-type-option__check" />
                            )}
                          </button>
                        ))}
                      </React.Fragment>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Question textarea ── */}
          {hasQuestionField(q.type) && (
            <div className="qm-field">
              <label className="qm-label">
                Question <span className="qm-required">*</span>
              </label>
              <div className="qm-textarea-wrap">
                <textarea
                  className="qm-textarea"
                  value={q.text}
                  onChange={(e) => set('text', e.target.value)}
                  placeholder="Can you walk me through a recent challenge you faced in your startup?"
                  rows={3}
                  maxLength={100}
                />
                <span className="qm-char-count">{q.text.length}/100</span>
              </div>
            </div>
          )}

          {/* ── Instruction ── */}
          <div className="qm-field">
            <label className="qm-label">Instruction</label>
            <input
              className="qm-instruction"
              value={q.instruction ?? ''}
              onChange={(e) => set('instruction', e.target.value)}
              placeholder={currentMeta.instructionPlaceholder}
            />
          </div>

          {/* ── Type-specific fields ── */}
          <TypeFields q={q} set={set} />

        </div>

        {/* Footer */}
        <div className="qm-footer">
          <button type="button" className="qm-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`qm-add-btn ${isValid ? 'qm-add-btn--active' : ''}`}
            onClick={() => isValid && onSave(q)}
            disabled={!isValid}
          >
            {initial ? 'Save Changes' : 'Add'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default QuestionModal;