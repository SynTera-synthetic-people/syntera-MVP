/**
 * Round-trip regression test for the questionnaire codec.
 *
 * Guards the bug where manually added questions saved without their options:
 * the outbound mapper covered 13 of 76 question types and dropped the rest to
 * `options: []`, and the inbound mapper rebuilt only `{id,type,text,options}`,
 * so anything the researcher typed into a type-specific field was discarded.
 *
 * Run from the frontend directory:  npm run test:questionnaire
 * (Node >= 22.6 strips the codec's types on import; no build step needed.)
 */

import assert from 'node:assert/strict';
import { toApiPayload, fromApiQuestion, validateQuestion, __SPEC } from './questionCodec.ts';

let passed = 0;
const failures = [];

const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
};

// ── The fields QuestionPreview reads, per type ───────────────────────────────
// Mirrors the switch in QuestionnaireGuide.tsx. If the codec fails to restore
// one of these, the question renders with no options — the reported bug.
const PREVIEW_FIELD = {
  single_select: 'options', button_single_select: 'options', binary_yes_no: 'options',
  dropdown: 'options', multi_select: 'options', button_multi_select: 'options',
  top_n_select: 'options', constant_n_select: 'options',
  single_select_grid: 'rows', multi_select_grid: 'rows', mixed_format_grid: 'rows',
  side_by_side_grid: 'sxsAttributes', bipolar_grid: 'leftOptions', this_or_that: 'leftOptions',
  likert_scale: 'scaleItems', importance_scale: 'scaleItems',
  satisfaction_scale: 'scaleItems', frequency_scale: 'scaleItems',
  star_rating: 'starRows', emoji_scale: 'emojiRows',
  slider: 'sliders', slider_rating: 'sliders',
  button_rating: 'buttonRatingRows', rating_scale: 'scaleRows',
  card_rating: 'cardRatingCards',
  constant_sum: 'allocationItems', chip_allocation: 'allocationItems',
  sum_locked_sliders: 'allocationItems',
  rank_sort: 'rankItems', top_n_ranking: 'rankItems',
  forced_distribution_ranking: 'rankingItems',
  pairwise_comparison: 'pairItems', pairwise_modeled: 'pairItems',
  maxdiff: 'attributes',
  cbc_conjoint: 'conjointAttributes', acbc_conjoint: 'conjointAttributes',
  menu_conjoint: 'conjointAttributes',
  card_sort: 'buckets', card_sort_open: 'cards', q_sort: 'qSortItems',
  drag_classify: 'buckets', iat: 'iatCategories',
  autosum: 'rows',
};

// Populate every list field a type could read from, so the codec has something
// to carry in each direction.
const FILL = [
  'options', 'rows', 'columns', 'leftOptions', 'rightOptions', 'rankLabels',
  'rankItems', 'cards', 'buckets', 'qSortItems', 'qSortBuckets', 'rankingItems',
  'rankingBuckets', 'pairItems', 'attributes', 'maxdiffColumns',
  'conjointAttributes', 'conjointLevels', 'allocationItems', 'starTooltips',
  'starRows', 'emojiRows', 'scaleRows', 'scaleColumns', 'scaleItems',
  'scalePoints', 'sxsEntities', 'sxsAttributes', 'sxsScalePoints',
  'cardRatingCards', 'cardRatingButtons', 'sliderPoints', 'sliders',
  'buttonRatingRows', 'imageMapMarkers', 'highlightReactions', 'iatCategories',
  'iatStimuli', 'calcFields',
];

const makeQuestion = (type) => {
  const q = { id: 'q1', type, text: 'Which city do you currently reside in?', required: true };
  FILL.forEach((f, i) => { q[f] = [`${f}-A${i}`, `${f}-B${i}`]; });
  q.imageUploadFiles = [{ name: 'a.png' }, { name: 'b.png' }];
  q.imageMapFiles = [{ name: 'map.png' }];
  q.heatmapFiles = [{ name: 'heat.png' }];
  q.pageTurnerPages = [{ name: 'p1.png' }];
  q.stimulusFiles = [{ name: 's1.mp4' }];
  q.nValue = 2;
  q.allocationTotal = 100;
  q.sliderMin = 'Not at all';
  q.sliderMax = 'Extremely';
  q.npsLowLabel = 'Low';
  q.npsHighLabel = 'High';
  q.videoFileName = 'clip.mp4';
  q.videoEmbedName = 'Promo';
  q.videoEmbedUrl = 'https://youtube.com/watch?v=abc';
  q.sectionName = 'Screener';
  q.noteText = 'A note';
  q.execInstruction = 'Do the thing';
  q.captchaInstruction = 'Pick Strongly disagree';
  q.mapCenter = 'London, UK';
  q.highlightText = 'Some text';
  q.validatedFormat = 'email';
  q.autoSuggestSourceFileName = 'brands.csv';
  q.aiProbeInstructions = 'Probe deeper';
  q.instruction = 'Select one';
  return q;
};

/** Simulates the server: canonical storage, then read-back serialization. */
const throughServer = (payload) => ({
  id: 'server-id-1',
  question_key: 'qk1',
  question_type: payload.question_type,
  text: payload.text,
  // The backend stores `options` as normalized labels.
  options: payload.options,
  config: JSON.parse(JSON.stringify(payload.config)),
});

const ALL_TYPES = Object.keys(__SPEC);

console.log(`Round-tripping ${ALL_TYPES.length} question types...\n`);

for (const type of ALL_TYPES) {
  const original = makeQuestion(type);
  const payload = toApiPayload(original);

  check(`${type}: emits a canonical backend type`, () => {
    assert.ok(payload.question_type, 'no question_type');
    assert.notEqual(payload.question_type, undefined);
  });

  check(`${type}: text survives`, () => {
    assert.equal(payload.text, original.text);
  });

  const restored = fromApiQuestion(throughServer(payload));

  check(`${type}: modal type survives the round trip`, () => {
    assert.equal(restored.type, type,
      `saved as ${type}, came back as ${restored.type}`);
  });

  check(`${type}: required flag survives`, () => {
    assert.equal(restored.required, true);
  });

  const field = PREVIEW_FIELD[type];
  if (field) {
    check(`${type}: preview field q.${field} is populated`, () => {
      const items = restored[field];
      assert.ok(Array.isArray(items) && items.length > 0,
        `q.${field} is ${JSON.stringify(items)} — the preview would render nothing`);
    });

    check(`${type}: preview field matches what was authored`, () => {
      assert.deepEqual(restored[field], original[field],
        `q.${field} changed across the round trip`);
    });

    check(`${type}: options reach the server for analysis`, () => {
      assert.ok(payload.options.length > 0,
        'options[] is empty — simulation would have nothing to choose between');
    });
  }
}

// ── Hydration without config.ui (LLM-generated / uploaded questionnaires) ────
check('LLM-shaped single_select hydrates options', () => {
  const q = fromApiQuestion({
    id: 'x1', question_type: 'single_select',
    text: 'Which city do you currently reside in?',
    options: ['Mumbai', 'Delhi', 'Bangalore'],
    config: { min_select: 1, max_select: 1 },
  });
  assert.equal(q.type, 'single_select');
  assert.deepEqual(q.options, ['Mumbai', 'Delhi', 'Bangalore']);
});

check('LLM-shaped rating_scale hydrates rows/columns into modal fields', () => {
  const q = fromApiQuestion({
    id: 'x2', question_type: 'rating_scale', text: 'Rate these',
    options: ['Speed', 'Comfort'],
    config: { rows: ['Speed', 'Comfort'], columns: ['1', '2', '3', '4', '5'] },
  });
  assert.equal(q.type, 'rating_scale');
  assert.deepEqual(q.scaleRows, ['Speed', 'Comfort']);
  assert.deepEqual(q.scaleColumns, ['1', '2', '3', '4', '5']);
});

check('option objects from the backend are flattened to labels', () => {
  const q = fromApiQuestion({
    id: 'x3', question_type: 'single_select', text: 'Pick one',
    options: [{ option_id: 'opt1', text: 'Mumbai' }, { option_id: 'opt2', text: 'Delhi' }],
    config: {},
  });
  assert.deepEqual(q.options, ['Mumbai', 'Delhi']);
});

check('legacy row without config.ui still resolves its modal type', () => {
  const q = fromApiQuestion({
    id: 'x4', question_type: 'grid_single_select', text: 'Grid',
    options: ['Row A'], config: { rows: ['Row A'], columns: ['C1'] },
  });
  assert.equal(q.type, 'single_select_grid');
  assert.deepEqual(q.rows, ['Row A']);
  assert.deepEqual(q.columns, ['C1']);
});

check('empty option lists do not fabricate content', () => {
  const payload = toApiPayload({ id: 'e1', type: 'single_select', text: 'Q', required: false, options: ['', '  '] });
  assert.deepEqual(payload.options, []);
});

// ── Config is client-writable; it must never steer identity ──────────────────
check('config cannot overwrite id / type / text', () => {
  const q = fromApiQuestion({
    id: 'REAL-SERVER-ID', question_type: 'single_select', text: 'Real text',
    options: ['A', 'B'],
    config: {
      ui_type: 'single_select',
      ui: { id: 'ATTACKER-ID', type: 'note', text: 'Replaced' },
      id: 'ATTACKER-ID', type: 'note', text: 'Replaced',
    },
  });
  assert.equal(q.id, 'REAL-SERVER-ID');
  assert.equal(q.type, 'single_select');
  assert.equal(q.text, 'Real text');
});

check('ui_type cannot resolve through the prototype chain', () => {
  const q = fromApiQuestion({
    id: 'p1', question_type: 'single_select', text: 'Q', options: ['A'],
    config: { ui_type: 'constructor' },
  });
  assert.equal(q.type, 'single_select');
});

check('unknown backend type falls back to a real modal type', () => {
  const q = fromApiQuestion({
    id: 'p2', question_type: '__proto__', text: 'Q', options: ['A'], config: {},
  });
  assert.ok(__SPEC[q.type], `resolved to ${q.type}, which is not in SPEC`);
});

// ── Concatenated options must split back to their own poles ──────────────────
check('this_or_that without config splits options across both poles', () => {
  const q = fromApiQuestion({
    id: 't1', question_type: 'this_or_that', text: 'Which?',
    options: ['Cheap', 'Fast', 'Premium', 'Slow'],
    config: { left_legend: 'A', right_legend: 'B' },
  });
  assert.deepEqual(q.leftOptions, ['Cheap', 'Fast']);
  assert.deepEqual(q.rightOptions, ['Premium', 'Slow']);
});

check('partially-populated poles are left alone', () => {
  const q = fromApiQuestion({
    id: 't2', question_type: 'this_or_that', text: 'Which?',
    options: ['Cheap', 'Fast', 'Premium'],
    config: { left_options: ['Cheap'] },
  });
  assert.deepEqual(q.leftOptions, ['Cheap'], 'config value was overwritten by the fallback');
});

// ── Pre-flight validation mirrors the backend ────────────────────────────────
check('option-bearing type with no options is rejected before sending', () => {
  const problem = validateQuestion({ id: 'v1', type: 'single_select', text: 'Q', required: false, options: [] });
  assert.ok(problem, 'expected a validation message');
});

check('grid is satisfied by columns alone, matching the backend', () => {
  assert.equal(
    validateQuestion({ id: 'v2', type: 'single_select_grid', text: 'Q', required: false, rows: [], columns: ['C1'] }),
    null,
  );
});

check('types the backend exempts are not blocked', () => {
  assert.equal(validateQuestion({ id: 'v3', type: 'rating_scale', text: 'Q', required: false, scaleRows: [] }), null);
  assert.equal(validateQuestion({ id: 'v4', type: 'star_rating', text: 'Q', required: false, starTooltips: [] }), null);
});

check('missing text is caught, except on structural elements', () => {
  assert.ok(validateQuestion({ id: 'v5', type: 'single_select', text: '  ', required: false, options: ['A'] }));
  assert.equal(validateQuestion({ id: 'v6', type: 'note', text: '', required: false, noteText: 'hi' }), null);
});

// ── config.ui is gone: canonical keys alone must carry every type ────────────
check('every type round-trips on canonical config keys alone (no UI-only copy)', () => {
  const gaps = [];
  for (const type of Object.keys(__SPEC)) {
    const original = makeQuestion(type);
    const payload = toApiPayload(original);
    assert.ok(!('ui' in payload.config), `${type}: config.ui was reintroduced`);
    const restored = fromApiQuestion(throughServer(payload));
    const field = PREVIEW_FIELD[type];
    if (field && !(Array.isArray(restored[field]) && restored[field].length)) {
      gaps.push(`${type}.${field}`);
    }
  }
  assert.deepEqual(gaps, [], `types that lost their preview field: ${gaps.join(', ')}`);
});

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`passed: ${passed}`);
if (failures.length) {
  console.log(`failed: ${failures.length}\n`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log('\nAll round-trip assertions passed.');
