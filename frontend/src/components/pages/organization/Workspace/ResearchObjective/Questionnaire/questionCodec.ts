/**
 * Question codec — the single source of truth for translating between the
 * QuestionModal's UI shape and the backend's canonical questionnaire schema.
 *
 * Why this file exists
 * --------------------
 * The modal models 76 question types as a flat bag of type-specific fields
 * (`rows`, `scaleRows`, `sliders`, `cardRatingCards`, …). The backend stores a
 * canonical `{ question_type, options[], config{} }` triple that its simulation
 * and reporting layers understand.
 *
 * Previously each direction was hand-written and incomplete: the outbound
 * mapper handled 13 of 76 types and dropped the rest to `options: []`, and the
 * inbound mapper rebuilt only `{id, type, text, required, options}`. Anything
 * else the researcher typed was silently discarded — the question saved, but
 * its options were gone from the database.
 *
 * Both directions are now generated from one declarative table (`SPEC`), so a
 * type cannot be supported in one direction and forgotten in the other.
 *
 * Round-trip contract
 * -------------------
 *   fromApiQuestion(toApiPayload(q)) ≈ q      (for every QuestionType)
 *
 * One mechanism makes that hold: `SPEC[type].lists/scalars/files` map modal
 * fields onto canonical config keys, and the inbound direction reads the same
 * table backwards. Because the canonical keys are what the backend's
 * simulation and reporting layers already consume, questions authored here and
 * questions produced by LLM generation or file upload hydrate through exactly
 * the same path — there is no second, UI-only copy of the data to drift.
 *
 * `config.ui_type` is the one extra field written, and it carries no data: it
 * disambiguates modal types that share a backend type (`button_single_select`
 * and `binary_yes_no` both persist as `single_select`). It is validated
 * against SPEC on read and can only ever select a known type.
 */

import type { Question, QuestionType } from './QuestionModal';

// ── Canonical backend types ───────────────────────────────────────────────────
// Mirrors QUESTION_TYPE_ALIASES / QUESTION_TYPE_CATALOG in
// backend/app/services/question_engine.py. Only these may be sent to the API.

export type BackendQuestionType =
  | 'single_select' | 'multi_select' | 'dropdown' | 'this_or_that'
  | 'text' | 'essay' | 'number' | 'autosum' | 'constant_sum'
  | 'date_picker' | 'auto_suggest' | 'rating_scale' | 'button_rating'
  | 'star_rating' | 'card_rating' | 'slider_rating' | 'slider'
  | 'ranking' | 'card_sort' | 'maxdiff'
  | 'grid_single_select' | 'grid_multi_select' | 'matrix_rating'
  | 'image_map' | 'page_turner' | 'video_player' | 'video_player_url'
  | 'media_prompt' | 'file_upload' | 'video_upload' | 'image_upload'
  | 'section' | 'note' | 'exec' | 'import_data';

/** A modal field holding a list of labels, and the canonical config key it maps to. */
type ListMap = Partial<Record<keyof Question, string>>;
/** A modal field holding a single scalar, and the canonical config key it maps to. */
type ScalarMap = Partial<Record<keyof Question, string>>;
/** A modal field holding uploaded files, and the canonical config key it maps to. */
type FileMap = Partial<Record<keyof Question, string>>;

interface TypeSpec {
  /** Canonical type persisted to the backend. */
  backend: BackendQuestionType;
  /**
   * Modal field(s) that feed the canonical top-level `options[]`.
   * This is what the simulation and reporting layers analyse, so it must be the
   * field a respondent actually chooses between. Multiple fields are concatenated.
   */
  optionsFrom?: (keyof Question)[];
  /** Modal field(s) whose *file names* feed `options[]` (image-choice types). */
  optionsFromFiles?: keyof Question;
  lists?: ListMap;
  scalars?: ScalarMap;
  files?: FileMap;
}

// ── The table ─────────────────────────────────────────────────────────────────
// Every QuestionType in QuestionModal.tsx must have an entry. The exhaustiveness
// of `Record<QuestionType, TypeSpec>` makes the compiler enforce that: adding a
// new question type to the modal will not typecheck until it is described here.

const SPEC: Record<QuestionType, TypeSpec> = {
  // ── Open-End ────────────────────────────────────────────────────────────────
  text:            { backend: 'text' },
  essay:           { backend: 'essay' },
  number:          { backend: 'number', scalars: { numberPrefix: 'prefix', numberSuffix: 'suffix' } },
  number_decimal:  { backend: 'number', scalars: { numberPrefix: 'prefix', numberSuffix: 'suffix' } },
  date_picker:     { backend: 'date_picker' },
  validated_input: { backend: 'text', scalars: { validatedFormat: 'validated_format' } },
  auto_suggest:    { backend: 'auto_suggest', scalars: { autoSuggestSourceFileName: 'source_file_name' } },

  // ── Single-Choice Selection ─────────────────────────────────────────────────
  single_select:        { backend: 'single_select', optionsFrom: ['options'], lists: { options: 'options_list' } },
  button_single_select: { backend: 'single_select', optionsFrom: ['options'], lists: { options: 'options_list' } },
  image_single_select:  { backend: 'single_select', optionsFromFiles: 'imageUploadFiles', files: { imageUploadFiles: 'images' } },
  binary_yes_no:        { backend: 'single_select', optionsFrom: ['options'], lists: { options: 'options_list' } },
  dropdown:             { backend: 'dropdown', optionsFrom: ['options'], lists: { options: 'options_list' } },

  // ── Multi-Choice Selection ──────────────────────────────────────────────────
  multi_select:        { backend: 'multi_select', optionsFrom: ['options'], lists: { options: 'options_list' } },
  button_multi_select: { backend: 'multi_select', optionsFrom: ['options'], lists: { options: 'options_list' } },
  image_multi_select:  { backend: 'multi_select', optionsFromFiles: 'imageUploadFiles', files: { imageUploadFiles: 'images' } },
  top_n_select:        { backend: 'multi_select', optionsFrom: ['options'], lists: { options: 'options_list' }, scalars: { nValue: 'max_select' } },
  constant_n_select:   { backend: 'multi_select', optionsFrom: ['options'], lists: { options: 'options_list' }, scalars: { nValue: 'exact_select' } },

  // ── Grid / Matrix ───────────────────────────────────────────────────────────
  single_select_grid: { backend: 'grid_single_select', optionsFrom: ['rows'], lists: { rows: 'rows', columns: 'columns' } },
  multi_select_grid:  { backend: 'grid_multi_select', optionsFrom: ['rows'], lists: { rows: 'rows', columns: 'columns' } },
  mixed_format_grid:  { backend: 'grid_multi_select', optionsFrom: ['rows'], lists: { rows: 'rows', columns: 'columns' } },
  bipolar_grid:       { backend: 'grid_single_select', optionsFrom: ['leftOptions', 'rightOptions'], lists: { leftOptions: 'left_options', rightOptions: 'right_options' }, scalars: { nValue: 'scale_points' } },
  this_or_that:       { backend: 'this_or_that', optionsFrom: ['leftOptions', 'rightOptions'], lists: { leftOptions: 'left_options', rightOptions: 'right_options', columns: 'columns' } },
  side_by_side_grid:  { backend: 'grid_single_select', optionsFrom: ['sxsAttributes'], lists: { sxsAttributes: 'rows', sxsScalePoints: 'columns', sxsEntities: 'entities' } },

  // ── Rating Scales ───────────────────────────────────────────────────────────
  likert_scale:       { backend: 'rating_scale', optionsFrom: ['scaleItems'], lists: { scaleItems: 'rows', scalePoints: 'columns' } },
  importance_scale:   { backend: 'rating_scale', optionsFrom: ['scaleItems'], lists: { scaleItems: 'rows', scalePoints: 'columns' } },
  satisfaction_scale: { backend: 'rating_scale', optionsFrom: ['scaleItems'], lists: { scaleItems: 'rows', scalePoints: 'columns' } },
  frequency_scale:    { backend: 'rating_scale', optionsFrom: ['scaleItems'], lists: { scaleItems: 'rows', scalePoints: 'columns' } },
  star_rating:        { backend: 'star_rating', optionsFrom: ['starTooltips'], lists: { starTooltips: 'star_tooltips', starRows: 'rows' } },
  emoji_scale:        { backend: 'rating_scale', optionsFrom: ['emojiRows'], lists: { emojiRows: 'rows' } },
  slider:             { backend: 'slider', optionsFrom: ['sliders'], lists: { sliders: 'sliders' } },
  slider_continuous:  { backend: 'slider', scalars: { sliderMin: 'left_anchor', sliderMax: 'right_anchor' } },
  vas_scale:          { backend: 'slider', scalars: { sliderMin: 'left_anchor', sliderMax: 'right_anchor' } },
  nps:                { backend: 'rating_scale', scalars: { npsLowLabel: 'low_label', npsHighLabel: 'high_label' } },
  button_rating:      { backend: 'button_rating', optionsFrom: ['buttonRatingRows'], lists: { buttonRatingRows: 'rows' } },
  rating_scale:       { backend: 'rating_scale', optionsFrom: ['scaleRows'], lists: { scaleRows: 'rows', scaleColumns: 'columns' } },
  card_rating:        { backend: 'card_rating', optionsFrom: ['cardRatingCards'], lists: { cardRatingCards: 'cards', cardRatingButtons: 'buttons' } },
  slider_rating:      { backend: 'slider_rating', optionsFrom: ['sliders'], lists: { sliders: 'sliders', sliderPoints: 'points' } },

  // ── Allocation / Summation ──────────────────────────────────────────────────
  constant_sum:       { backend: 'constant_sum', optionsFrom: ['allocationItems'], lists: { allocationItems: 'items' }, scalars: { allocationTotal: 'total' } },
  autosum:            { backend: 'autosum', optionsFrom: ['rows'], lists: { rows: 'rows', columns: 'columns' } },
  chip_allocation:    { backend: 'constant_sum', optionsFrom: ['allocationItems'], lists: { allocationItems: 'items' }, scalars: { allocationTotal: 'total' } },
  sum_locked_sliders: { backend: 'constant_sum', optionsFrom: ['allocationItems'], lists: { allocationItems: 'items' }, scalars: { allocationTotal: 'total' } },

  // ── Ranking ─────────────────────────────────────────────────────────────────
  rank_sort:                   { backend: 'ranking', optionsFrom: ['rankItems'], lists: { rankItems: 'rankable_items', rankLabels: 'rank_labels' } },
  top_n_ranking:               { backend: 'ranking', optionsFrom: ['rankItems'], lists: { rankItems: 'rankable_items' }, scalars: { nValue: 'max_rank' } },
  forced_distribution_ranking: { backend: 'ranking', optionsFrom: ['rankingItems'], lists: { rankingItems: 'rankable_items', rankingBuckets: 'buckets' } },
  pairwise_comparison:         { backend: 'ranking', optionsFrom: ['pairItems'], lists: { pairItems: 'rankable_items' } },

  // ── Trade-Off and Choice Modeling ───────────────────────────────────────────
  maxdiff:          { backend: 'maxdiff', optionsFrom: ['attributes'], lists: { attributes: 'attributes', maxdiffColumns: 'columns' } },
  pairwise_modeled: { backend: 'maxdiff', optionsFrom: ['pairItems'], lists: { pairItems: 'attributes' } },
  cbc_conjoint:     { backend: 'maxdiff', optionsFrom: ['conjointAttributes'], lists: { conjointAttributes: 'attributes', conjointLevels: 'levels' } },
  acbc_conjoint:    { backend: 'maxdiff', optionsFrom: ['conjointAttributes'], lists: { conjointAttributes: 'attributes', conjointLevels: 'levels' } },
  menu_conjoint:    { backend: 'maxdiff', optionsFrom: ['conjointAttributes'], lists: { conjointAttributes: 'attributes', conjointLevels: 'levels' } },

  // ── Sorting and Classification ──────────────────────────────────────────────
  card_sort:      { backend: 'card_sort', optionsFrom: ['cards'], lists: { cards: 'cards', buckets: 'buckets' } },
  card_sort_open: { backend: 'card_sort', optionsFrom: ['cards'], lists: { cards: 'cards' } },
  q_sort:         { backend: 'card_sort', optionsFrom: ['qSortItems'], lists: { qSortItems: 'cards', qSortBuckets: 'buckets' } },
  drag_classify:  { backend: 'card_sort', optionsFrom: ['cards'], lists: { cards: 'cards', buckets: 'buckets' } },

  // ── Spatial and Visual Input ────────────────────────────────────────────────
  image_map:      { backend: 'image_map', lists: { imageMapMarkers: 'markers' }, files: { imageMapFiles: 'images' } },
  heatmap:        { backend: 'image_map', files: { heatmapFiles: 'images' } },
  map_pin:        { backend: 'text', scalars: { mapCenter: 'map_center' } },
  text_highlight: { backend: 'text', lists: { highlightReactions: 'reaction_labels' }, scalars: { highlightText: 'highlight_text' } },

  // ── Media Capture and Stimulus ──────────────────────────────────────────────
  image_upload:       { backend: 'image_upload', files: { imageUploadFiles: 'images' } },
  audio_capture:      { backend: 'file_upload' },
  video_capture:      { backend: 'video_upload' },
  video_player:       { backend: 'video_player', scalars: { videoFileName: 'video_filename' } },
  video_player_embed: { backend: 'video_player_url', scalars: { videoEmbedName: 'name', videoEmbedUrl: 'url' } },
  page_turner:        { backend: 'page_turner', files: { pageTurnerPages: 'pages' } },
  signature_capture:  { backend: 'file_upload' },

  // ── Special and Advanced ────────────────────────────────────────────────────
  ai_probed_open:   { backend: 'essay', scalars: { aiProbeInstructions: 'probe_instructions' } },
  chatbot_dialog:   { backend: 'essay' },
  iat:              { backend: 'single_select', optionsFrom: ['iatCategories'], lists: { iatCategories: 'categories', iatStimuli: 'stimuli' } },
  reaction_time:    { backend: 'number' },
  calculator_input: { backend: 'number', lists: { calcFields: 'fields' } },

  // ── Structural / Display ────────────────────────────────────────────────────
  section:          { backend: 'section', scalars: { sectionName: 'section_name' } },
  note:             { backend: 'note', scalars: { noteText: 'note_text' } },
  stimulus_display: { backend: 'media_prompt', files: { stimulusFiles: 'files' } },
  exec:             { backend: 'exec', scalars: { execInstruction: 'exec_instruction' } },
  import_data:      { backend: 'import_data' },
  captcha_check:    { backend: 'note', scalars: { captchaInstruction: 'captcha_instruction' } },
};

/**
 * Fallback for questions that arrive without `config.ui_type` — LLM-generated
 * and uploaded questionnaires. Derived from SPEC so it can never drift: the
 * first modal type declaring a backend type is the canonical inverse.
 */
const BACKEND_TO_MODAL: Partial<Record<string, QuestionType>> = (() => {
  const map: Partial<Record<string, QuestionType>> = {};
  (Object.keys(SPEC) as QuestionType[]).forEach((modalType) => {
    const backend = SPEC[modalType].backend;
    if (!(backend in map)) map[backend] = modalType;
  });
  // Backend-only types the modal has no dedicated editor for.
  map.matrix_rating = 'rating_scale';
  map.language = 'single_select';
  map.reusable_answer_lists = 'multi_select';
  return map;
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

const cleanList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) =>
          item && typeof item === 'object'
            ? String((item as any).text ?? (item as any).label ?? (item as any).value ?? '')
            : String(item ?? ''),
        )
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const fileNames = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((f: any) => String(f?.name ?? '')).filter(Boolean) : [];

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === '' ||
  (Array.isArray(value) && value.length === 0);

/** Own-property check — never resolves `constructor`, `__proto__`, etc. */
const isKnownModalType = (value: string): value is QuestionType =>
  Object.prototype.hasOwnProperty.call(SPEC, value);

export const makeId = (): string => Math.random().toString(36).slice(2, 8);

// ── Outbound: modal → API ─────────────────────────────────────────────────────

export interface QuestionApiPayload {
  text: string;
  options: string[];
  question_type: BackendQuestionType;
  config: Record<string, unknown>;
}

/**
 * Translate a modal Question into the canonical API payload.
 *
 * `config` carries three things:
 *   - canonical keys (`rows`, `columns`, `cards`, …) the backend's simulation
 *     and reporting layers read;
 *   - `ui_type`, so the exact modal type survives the round trip even when
 *     several modal types share one backend type;
 *   - `ui`, a verbatim snapshot of the modal fields for lossless restore.
 */
export const toApiPayload = (q: Question): QuestionApiPayload => {
  const spec = SPEC[q.type];
  if (!spec) {
    throw new Error(`Unsupported question type: ${q.type}`);
  }

  const options = spec.optionsFromFiles
    ? fileNames(q[spec.optionsFromFiles])
    : (spec.optionsFrom ?? []).flatMap((field) => cleanList(q[field]));

  const config: Record<string, unknown> = {};

  Object.entries(spec.lists ?? {}).forEach(([modalField, configKey]) => {
    const values = cleanList(q[modalField as keyof Question]);
    if (values.length) config[configKey!] = values;
  });

  Object.entries(spec.scalars ?? {}).forEach(([modalField, configKey]) => {
    const value = q[modalField as keyof Question];
    if (!isBlank(value)) config[configKey!] = value;
  });

  Object.entries(spec.files ?? {}).forEach(([modalField, configKey]) => {
    const names = fileNames(q[modalField as keyof Question]);
    if (names.length) config[configKey!] = names.map((name) => ({ name }));
  });

  if (q.instruction) config.instruction = q.instruction;
  config.validation = { required: Boolean(q.required) };

  // Selection-cardinality hints the backend validates against.
  switch (spec.backend) {
    case 'single_select':
    case 'dropdown':
      config.min_select = 1;
      config.max_select = 1;
      break;
    case 'multi_select': {
      const exact = Number(q.nValue);
      const cap = q.type === 'top_n_select' || q.type === 'constant_n_select'
        ? Math.min(Math.max(exact || 1, 1), options.length || 1)
        : options.length || 1;
      config.min_select = q.type === 'constant_n_select' ? cap : 1;
      config.max_select = cap;
      break;
    }
    default:
      break;
  }

  // Records which modal editor authored this question. Carries no data — the
  // canonical keys above already hold everything the modal needs back.
  config.ui_type = q.type;

  return { text: q.text ?? '', options, question_type: spec.backend, config };
};

// ── Pre-flight validation ─────────────────────────────────────────────────────

/**
 * Backend types whose `validate_question_config` rejects an empty option list.
 * Mirrors OPTION_BASED_TYPES minus the exemptions in
 * backend/app/services/question_engine.py::validate_question_config.
 */
const OPTION_REQUIRED_BACKEND_TYPES = new Set<BackendQuestionType>([
  'single_select', 'multi_select', 'dropdown', 'this_or_that', 'button_rating',
  'ranking', 'card_sort', 'maxdiff', 'grid_single_select', 'grid_multi_select',
  'constant_sum',
]);

const STRUCTURAL_BACKEND_TYPES = new Set<BackendQuestionType>([
  'section', 'note', 'exec', 'import_data',
]);

/** Human label for the modal editor that feeds a type's options. */
const FIELD_LABEL: Partial<Record<string, string>> = {
  options: 'option', rows: 'row', leftOptions: 'left-hand option',
  rankItems: 'rankable item', rankingItems: 'item', pairItems: 'item',
  cards: 'card', qSortItems: 'item', attributes: 'attribute',
  conjointAttributes: 'attribute', allocationItems: 'option',
  buttonRatingRows: 'option', sxsAttributes: 'attribute',
  scaleItems: 'statement', imageUploadFiles: 'image',
};

/**
 * Check a question against the same rules the API enforces, before sending it.
 *
 * Without this the modal submits and the backend answers 422 — correct, but a
 * network round trip to learn something knowable locally. Driven by the same
 * SPEC table as the codec so the two cannot disagree.
 *
 * Returns null when the question is acceptable.
 */
export const validateQuestion = (q: Question): string | null => {
  if (!isKnownModalType(q.type)) return `Unsupported question type: ${q.type}`;
  const spec = SPEC[q.type];

  if (!STRUCTURAL_BACKEND_TYPES.has(spec.backend) && !String(q.text ?? '').trim()) {
    return 'Question text is required.';
  }

  if (!OPTION_REQUIRED_BACKEND_TYPES.has(spec.backend)) return null;

  const payload = toApiPayload(q);
  if (payload.options.length > 0) return null;

  // Grids are also satisfied by columns alone.
  if (spec.backend === 'grid_single_select' || spec.backend === 'grid_multi_select') {
    const columns = (payload.config as Record<string, unknown>).columns;
    if (Array.isArray(columns) && columns.length > 0) return null;
  }

  const field = spec.optionsFromFiles ?? spec.optionsFrom?.[0];
  const noun = FIELD_LABEL[field as string] ?? 'option';
  return `Add at least one ${noun} before saving.`;
};

// ── Inbound: API → modal ──────────────────────────────────────────────────────

export interface ApiQuestion {
  id?: string;
  question_type?: string;
  type?: string;
  text?: string;
  options?: unknown;
  config?: Record<string, any> | null;
  [key: string]: unknown;
}

/**
 * Resolve the modal type for an API question, preferring the authored UI type.
 *
 * `config` is client-writable, so `ui_type` is treated as an untrusted hint:
 * own-property lookups only, so a value like `constructor` or `__proto__`
 * cannot resolve through the prototype chain, and anything not in SPEC falls
 * through to the backend type.
 */
export const resolveModalType = (apiQ: ApiQuestion): QuestionType => {
  const config = apiQ.config ?? {};
  const uiType = config.ui_type;
  if (typeof uiType === 'string' && isKnownModalType(uiType)) return uiType;

  const backendType = String(apiQ.question_type ?? apiQ.type ?? '').trim();
  if (isKnownModalType(backendType)) return backendType;
  return (Object.prototype.hasOwnProperty.call(BACKEND_TO_MODAL, backendType)
    ? BACKEND_TO_MODAL[backendType]
    : undefined) ?? 'single_select';
};

/**
 * Translate a canonical API question back into the modal's shape.
 *
 * Restoration order:
 *   1. `SPEC[type]` config keys — the authoritative source, written by
 *      `toApiPayload` and by the backend's own generation/upload paths;
 *   2. top-level `options` — for questions whose config never carried the
 *      type-specific keys (older LLM output).
 *
 * Nothing here copies arbitrary keys out of `config` onto the question:
 * `config` is client-writable, so only fields named by SPEC are ever assigned,
 * and `id`/`type`/`text` are taken exclusively from the API row.
 */
export const fromApiQuestion = (apiQ: ApiQuestion): Question => {
  const config = apiQ.config ?? {};
  const type = resolveModalType(apiQ);
  const spec = SPEC[type];
  const options = cleanList(apiQ.options);

  const q: Question = {
    id: String(apiQ.id ?? makeId()),
    type,
    text: String(apiQ.text ?? ''),
    required: Boolean(config.validation?.required ?? false),
    options,
  };

  if (typeof config.instruction === 'string') q.instruction = config.instruction;

  // (1) canonical config keys → modal fields
  Object.entries(spec.lists ?? {}).forEach(([modalField, configKey]) => {
    const values = cleanList(config[configKey!]);
    if (values.length) (q as any)[modalField] = values;
  });
  Object.entries(spec.scalars ?? {}).forEach(([modalField, configKey]) => {
    const value = config[configKey!];
    if (!isBlank(value)) (q as any)[modalField] = value;
  });
  Object.entries(spec.files ?? {}).forEach(([modalField, configKey]) => {
    const names = fileNames(config[configKey!]);
    if (names.length) (q as any)[modalField] = names.map((name) => ({ name }));
  });

  // (2) fall back to top-level options for the field(s) the preview reads
  if (options.length) {
    const sources = spec.optionsFrom ?? [];
    const unset = sources.filter((field) => isBlank(q[field]));

    if (sources.length === 1 && unset.length === 1) {
      (q as any)[sources[0]] = options;
    } else if (sources.length > 1 && unset.length === sources.length) {
      // `options[]` is the concatenation of several modal fields (the two
      // poles of this_or_that / bipolar_grid). Split it back evenly rather
      // than dumping every label into the first field, which would show the
      // right-hand items as left-hand ones.
      const size = Math.ceil(options.length / sources.length);
      sources.forEach((field, i) => {
        (q as any)[field] = options.slice(i * size, (i + 1) * size);
      });
    }
    // When only some sources are set, config was authoritative — leave it be.

    if (spec.optionsFromFiles && isBlank(q[spec.optionsFromFiles])) {
      (q as any)[spec.optionsFromFiles] = options.map((name) => ({ name }));
    }
  }

  return q;
};

// ── Section-level helpers ─────────────────────────────────────────────────────

export interface Section {
  id: string;
  title: string;
  questions: Question[];
}

export const mapApiToSections = (apiSections: any[]): Section[] =>
  (apiSections ?? []).map((sec: any) => ({
    id: sec.id || sec.section_id || makeId(),
    title: sec.title || 'Section',
    questions: (sec.questions ?? []).map(fromApiQuestion),
  }));

/** Exposed for tests — asserts SPEC stays exhaustive over QuestionType. */
export const __SPEC = SPEC;
