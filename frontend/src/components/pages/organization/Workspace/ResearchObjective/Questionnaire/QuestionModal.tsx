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
  | 'text'                         // E1 Short Text
  | 'essay'                        // E2 Long Text / Essay
  | 'number'                       // E3 Numeric Input (Integer)
  | 'number_decimal'               // E4 Numeric Input (Decimal / Currency / %)  ← NEW
  | 'date_picker'                  // E5 Date / Time Picker
  | 'validated_input'              // E6 Validated Format Input                  ← NEW
  | 'auto_suggest'                 // (platform-specific auto-suggest)
  // Single-Choice Selection
  | 'single_select'                // A1 Radio-Button Single Select
  | 'button_single_select'         // A3 Button Single Select                    ← NEW
  | 'image_single_select'          // A4 Image Single Select                     ← NEW
  | 'binary_yes_no'                // A5 Binary Yes / No                         ← NEW
  | 'dropdown'                     // A2 Dropdown Menu
  // Multi-Choice Selection
  | 'multi_select'                 // B1 Checkbox Multi-Select
  | 'button_multi_select'          // B2 Button Multi-Select                     ← NEW
  | 'image_multi_select'           // B3 Image Multi-Select                      ← NEW
  | 'top_n_select'                 // B4 Top-N Selection                         ← NEW
  | 'constant_n_select'            // B5 Constant-N Selection                    ← NEW
  // Grid / Matrix
  | 'single_select_grid'           // C1 Single-Select Grid
  | 'multi_select_grid'            // C2 Multi-Select Grid                       ← NEW
  | 'mixed_format_grid'            // C3 Mixed-Format Grid                       ← NEW
  | 'bipolar_grid'                 // C4 Bipolar Grid / Semantic Differential     ← NEW
  | 'this_or_that'                 // C5 This-or-That / Forced Bipolar
  | 'side_by_side_grid'            // C6 Side-By-Side Comparison Grid            ← NEW
  // Rating Scales
  | 'likert_scale'                 // D1 Likert Agreement Scale                  ← NEW
  | 'importance_scale'             // D2 Importance Scale                        ← NEW
  | 'satisfaction_scale'           // D3 Satisfaction / Performance Scale        ← NEW
  | 'frequency_scale'              // D4 Frequency Scale                         ← NEW
  | 'star_rating'                  // D5 Star Rating
  | 'emoji_scale'                  // D6 Emoji / Smiley Scale                    ← NEW
  | 'slider'                       // D7 Slider (Discrete)
  | 'slider_continuous'            // D8 Slider (Continuous / Decimal)           ← NEW
  | 'vas_scale'                    // D9 Visual Analog Scale (VAS)               ← NEW
  | 'nps'                          // D10 Net Promoter Score                     ← NEW
  | 'button_rating'                // D11 Numeric Single-Row Rating
  | 'rating_scale'                 // (grid-style rating — existing)
  | 'card_rating'                  // (card drag rating — existing)
  | 'slider_rating'                // (multi-slider rating — existing)
  // Allocation / Summation
  | 'constant_sum'                 // F1 Constant Sum                            ← NEW
  | 'autosum'                      // F2 Autosum / Running Total
  | 'chip_allocation'              // F3 Chip / Token Allocation                 ← NEW
  | 'sum_locked_sliders'           // F4 Sum-Locked Sliders                      ← NEW
  // Ranking
  | 'rank_sort'                    // G1 Full Rank Sort
  | 'top_n_ranking'                // G2 Top-N Ranking                           ← NEW
  | 'forced_distribution_ranking'  // G3 Forced Distribution Ranking             ← NEW
  | 'pairwise_comparison'          // G4 Pairwise Comparison                     ← NEW
  // Trade-Off and Choice Modeling
  | 'maxdiff'                      // H1 MaxDiff / Best-Worst Scaling
  | 'pairwise_modeled'             // H2 Pairwise Comparison (Modeled)           ← NEW
  | 'cbc_conjoint'                 // H3 Choice-Based Conjoint (CBC)             ← NEW
  | 'acbc_conjoint'                // H4 Adaptive Conjoint (ACBC)               ← NEW
  | 'menu_conjoint'                // H5 Menu-Based Conjoint (MBC)               ← NEW
  // Sorting and Classification
  | 'card_sort'                    // I1 Card Sort (Closed)
  | 'card_sort_open'               // I2 Card Sort (Open)                        ← NEW
  | 'q_sort'                       // I3 Q-Sort                                  ← NEW
  | 'drag_classify'                // I4 Drag-to-Classify (General)              ← NEW
  // Spatial and Visual Input
  | 'image_map'                    // J1 Image Hotspot
  | 'heatmap'                      // J2 Heatmap (Free-Form Click)               ← NEW
  | 'map_pin'                      // J3 Map Pin / Geolocation                   ← NEW
  | 'text_highlight'               // J4 Text Highlight / Annotation             ← NEW
  // Media Capture and Stimulus
  | 'image_upload'                 // K1 Image Upload
  | 'audio_capture'                // K2 Audio Capture                           ← NEW
  | 'video_capture'                // K3 Video Capture (Testimonial)             ← NEW
  | 'video_player'                 // K4 Audio / Video Stimulus Player
  | 'video_player_embed'           // K4 Embed variant
  | 'page_turner'                  // (platform-specific)
  | 'signature_capture'            // K5 Signature Capture                       ← NEW
  // Special and Advanced
  | 'ai_probed_open'               // L1 AI-Probed Open-End                      ← NEW
  | 'chatbot_dialog'               // L2 Chatbot / Multi-Turn Dialog             ← NEW
  | 'iat'                          // L3 Implicit Association Test               ← NEW
  | 'reaction_time'                // L4 Reaction-Time Task                      ← NEW
  | 'calculator_input'             // L5 Calculator / Formula Input              ← NEW
  // Structural / Display
  | 'section'                      // M1 Descriptive Content
  | 'note'                         // M1 Note variant
  | 'stimulus_display'             // M2 Stimulus Display                        ← NEW
  | 'exec'                         // (platform routing block)
  | 'import_data'                  // (background data import)
  | 'captcha_check';               // M5 Captcha / Quality Check                 ← NEW

interface TypeMeta {
  label: string;
  tooltip: string;
  instructionPlaceholder: string;
}

export const TYPE_META: Record<QuestionType, TypeMeta> = {
  // ── Open-End ───────────────────────────────────────────────────────────────
  text:               { label: 'Short Text',                        tooltip: 'Single-line open-ended text response. Best for names, short phrases, or brand mentions.', instructionPlaceholder: 'Please be as precise as possible' },
  essay:              { label: 'Long Text / Essay',                 tooltip: 'Multi-line text area for longer open-ended responses. Plan AI-assisted coding for large volumes.', instructionPlaceholder: 'Please be as detailed as possible' },
  number:             { label: 'Number (Integer)',                  tooltip: 'Numeric field accepting whole numbers only. Always set a sensible min/max range.', instructionPlaceholder: 'Please enter a whole number' },
  number_decimal:     { label: 'Number (Decimal / Currency / %)',   tooltip: 'Numeric field accepting decimals. Use for spend, salary, share-of-wallet, or percentage questions.', instructionPlaceholder: 'Please enter a numeric value' },
  date_picker:        { label: 'Date / Time Picker',               tooltip: 'Structured date or time selection via a calendar or clock widget.', instructionPlaceholder: 'Select a date' },
  validated_input:    { label: 'Validated Format Input',           tooltip: 'Text field with format validation — covers email, phone, URL, postal code, and address. Strong PII implications.', instructionPlaceholder: 'Please enter a valid value' },
  auto_suggest:       { label: 'Auto Suggest',                     tooltip: 'Participants type and receive auto-suggested answers from an uploaded source file.', instructionPlaceholder: 'Be specific' },
  // ── Single-Choice Selection ────────────────────────────────────────────────
  single_select:      { label: 'Single Select',                    tooltip: 'Default single-answer format with radio buttons. Randomize options unless the list is ordered.', instructionPlaceholder: 'Select one' },
  button_single_select: { label: 'Button Single Select',           tooltip: 'Options as large tappable tiles. Mobile-optimised. Best for 2–8 short options.', instructionPlaceholder: 'Select one' },
  image_single_select: { label: 'Image Single Select',             tooltip: 'Options are images; respondent taps one. Use for logo tests, packaging preference, concept selection.', instructionPlaceholder: 'Select the option that best applies' },
  binary_yes_no:      { label: 'Binary Yes / No',                  tooltip: 'Exactly two options (Yes / No or True / False). Add a "Don\'t know" option if uncertainty is plausible.', instructionPlaceholder: 'Select one' },
  dropdown:           { label: 'Dropdown',                         tooltip: 'Single-answer from a collapsed dropdown list. Best for long fixed lists (country, industry).', instructionPlaceholder: 'Select one' },
  // ── Multi-Choice Selection ─────────────────────────────────────────────────
  multi_select:       { label: 'Multi-Select',                     tooltip: 'Respondent checks all options that apply. Add a "None of these" exclusive option for clean data.', instructionPlaceholder: 'Select all that apply' },
  button_multi_select: { label: 'Button Multi-Select',             tooltip: 'Multi-select rendered as tappable tiles. Mobile-first. Up to 10 options with short labels.', instructionPlaceholder: 'Tap all that apply' },
  image_multi_select: { label: 'Image Multi-Select',               tooltip: 'Multi-answer image select. Respondent taps all images that apply. Normalise image quality.', instructionPlaceholder: 'Tap all that apply' },
  top_n_select:       { label: 'Top-N Selection',                  tooltip: 'Multi-select capped at a maximum N (e.g. pick top 3). Forces prioritisation without full ranking burden.', instructionPlaceholder: 'Select your top options' },
  constant_n_select:  { label: 'Constant-N Selection',             tooltip: 'Multi-select requiring exactly N selections. Higher respondent friction than Top-N — use only when precise count is needed.', instructionPlaceholder: 'Select exactly the required number' },
  // ── Grid / Matrix ──────────────────────────────────────────────────────────
  single_select_grid: { label: 'Single Select Grid',               tooltip: 'Each row is a sub-question; columns are scale points; one selection per row. Randomise rows to reduce straight-lining.', instructionPlaceholder: 'Select one per row' },
  multi_select_grid:  { label: 'Multi-Select Grid',                tooltip: 'Each row is an attribute; each column is an entity. Respondent ticks every cell that applies. Add a "None" column.', instructionPlaceholder: 'Tick all that apply in each row' },
  mixed_format_grid:  { label: 'Mixed-Format Grid',                tooltip: 'Different response types per column (e.g. rating + yes/no + open-end). Limit to 3 columns and 5 rows on mobile.', instructionPlaceholder: 'Complete each column for every row' },
  bipolar_grid:       { label: 'Bipolar Grid / Semantic Differential', tooltip: 'Each row has two opposing labels flanking a symmetric scale. Classical tool for brand personality and perceptual mapping.', instructionPlaceholder: 'Rate each dimension between the two poles' },
  this_or_that:       { label: 'This or That',                     tooltip: 'Constrained bipolar scale — respondents must lean toward one of two poles on each dimension.', instructionPlaceholder: 'Please select the option you prefer between the two shown below' },
  side_by_side_grid:  { label: 'Side-By-Side Comparison Grid',     tooltip: 'Two parallel grids comparing two entities on the same attributes. Use desktop only — breaks on mobile.', instructionPlaceholder: 'Rate both options on each dimension' },
  // ── Rating Scales ──────────────────────────────────────────────────────────
  likert_scale:       { label: 'Likert Agreement Scale',           tooltip: 'Symmetric agree-disagree scale (5 or 7 points) for attitude statements. Avoid for importance or satisfaction.', instructionPlaceholder: 'Select your level of agreement' },
  importance_scale:   { label: 'Importance Scale',                 tooltip: 'Unipolar scale from "not at all important" to "critical". Pair with MaxDiff for genuine prioritisation.', instructionPlaceholder: 'Rate the importance of each item' },
  satisfaction_scale: { label: 'Satisfaction / Performance Scale', tooltip: 'Unipolar scale from "very dissatisfied" to "very satisfied". Analyse using top-2-box scoring.', instructionPlaceholder: 'Rate your level of satisfaction' },
  frequency_scale:    { label: 'Frequency Scale',                  tooltip: 'Ordered behavioral frequency from "never" to "always". Use time-anchored labels to reduce reference-class bias.', instructionPlaceholder: 'Select how often this applies to you' },
  star_rating:        { label: 'Star Rating',                      tooltip: '1-to-5 ordinal scale rendered as filled stars. Familiar from e-commerce — respondents bring strong priors.', instructionPlaceholder: 'Select One' },
  emoji_scale:        { label: 'Emoji / Smiley Scale',             tooltip: 'Ordered emoji faces from sad to happy. Best for children, low-literacy, or cross-cultural surveys. Validate rendering across devices.', instructionPlaceholder: 'Tap the face that best describes how you feel' },
  slider:             { label: 'Slider (Discrete)',                tooltip: 'Drag-to-position rating on a horizontal track with discrete tick stops. Always hide the default thumb position.', instructionPlaceholder: 'Drag to your answer' },
  slider_continuous:  { label: 'Slider (Continuous)',              tooltip: 'Slider with no discrete stops; captures a real-valued position. Do not over-interpret decimal precision.', instructionPlaceholder: 'Drag to any point on the scale' },
  vas_scale:          { label: 'Visual Analog Scale (VAS)',        tooltip: 'A line with anchor labels at each end; no default thumb — a true continuum. Used in clinical research for pain and mood.', instructionPlaceholder: 'Mark a point on the line' },
  nps:                { label: 'Net Promoter Score (NPS)',         tooltip: '0-to-10 "how likely are you to recommend" question. Always pair with an open-end follow-up for diagnostic depth.', instructionPlaceholder: 'Select a number from 0 to 10' },
  button_rating:      { label: 'Numeric Single-Row Rating',        tooltip: 'Standalone numeric scale rendered as a row of buttons. Scale labelling matters — label all points if possible.', instructionPlaceholder: 'Select One' },
  rating_scale:       { label: 'Rating Scale (Grid)',              tooltip: 'Grid-style rating with configurable rows and columns.', instructionPlaceholder: 'Please keep it open' },
  card_rating:        { label: 'Card Rating',                      tooltip: 'Participants rate cards by dragging them into rating buckets.', instructionPlaceholder: 'Rate the following products by dragging cards' },
  slider_rating:      { label: 'Slider Rating',                    tooltip: 'Multiple sliders each capturing a separate rating dimension.', instructionPlaceholder: 'Slide to rate your satisfaction' },
  // ── Allocation / Summation ─────────────────────────────────────────────────
  constant_sum:       { label: 'Constant Sum',                     tooltip: 'Respondent allocates exactly 100 points (or another fixed total) across options. Limit to 5–8 options.', instructionPlaceholder: 'Allocate your points across the options — must total 100' },
  autosum:            { label: 'Autosum / Running Total',          tooltip: 'Respondent enters numeric values per option with a live running total displayed. Total is not forced.', instructionPlaceholder: 'Enter values — a running total will be displayed' },
  chip_allocation:    { label: 'Chip / Token Allocation',          tooltip: 'Constant sum rendered visually as draggable chips placed onto buckets. Mobile-friendly. Requires custom scripting.', instructionPlaceholder: 'Drag chips onto the options to allocate your budget' },
  sum_locked_sliders: { label: 'Sum-Locked Sliders',               tooltip: 'Multiple sliders linked so moving one auto-adjusts others to maintain a fixed total. User-test before fielding.', instructionPlaceholder: 'Adjust sliders — the total will always equal 100%' },
  // ── Ranking ────────────────────────────────────────────────────────────────
  rank_sort:          { label: 'Full Rank Sort',                   tooltip: 'All items must be assigned a rank position from 1 to N, no ties. Best for 4–8 items.', instructionPlaceholder: 'Rank the following brands in order of preference' },
  top_n_ranking:      { label: 'Top-N Ranking',                   tooltip: 'Respondent ranks only the top N items from a longer list. Remaining items left unranked.', instructionPlaceholder: 'Rank your top items in order of preference' },
  forced_distribution_ranking: { label: 'Forced Distribution Ranking', tooltip: 'Items distributed into fixed buckets in fixed quantities (e.g. exactly 3 in top, 4 in middle, 3 in bottom).', instructionPlaceholder: 'Place each item into the correct group' },
  pairwise_comparison: { label: 'Pairwise Comparison',            tooltip: 'Respondent picks the preferred item from a pair, shown repeatedly. Use balanced incomplete block designs for >10 items.', instructionPlaceholder: 'Select the option you prefer' },
  // ── Trade-Off and Choice Modeling ─────────────────────────────────────────
  maxdiff:            { label: 'MaxDiff / Best-Worst Scaling',     tooltip: 'Respondent picks the best and worst from subsets of items. Design balance is critical.', instructionPlaceholder: 'Select the MOST and LEAST important feature' },
  pairwise_modeled:   { label: 'Pairwise Comparison (Modeled)',    tooltip: 'Pairwise choices fed into a Bradley-Terry model to estimate latent preference scores across all items.', instructionPlaceholder: 'Select the option that matters more to you' },
  cbc_conjoint:       { label: 'Choice-Based Conjoint (CBC)',      tooltip: 'Respondent picks from sets of product profiles (attribute combinations). Requires statistical design and HB estimation.', instructionPlaceholder: 'Choose the option you would most prefer, or "None"' },
  acbc_conjoint:      { label: 'Adaptive Conjoint (ACBC)',         tooltip: 'Conjoint with an adaptive front-end customised per respondent. Best for large attribute lists (8+).', instructionPlaceholder: 'Select the option closest to your ideal' },
  menu_conjoint:      { label: 'Menu-Based Conjoint (MBC)',        tooltip: 'Respondent builds their own bundle from a menu at given prices. Use only when real purchase context is menu-based.', instructionPlaceholder: 'Build your ideal bundle from the options below' },
  // ── Sorting and Classification ─────────────────────────────────────────────
  card_sort:          { label: 'Card Sort (Closed)',               tooltip: 'Items must be placed into pre-defined buckets. Limit to ~15 cards and 3–5 buckets on mobile.', instructionPlaceholder: 'Drag each card into the correct bucket' },
  card_sort_open:     { label: 'Card Sort (Open)',                 tooltip: 'Respondent creates their own categories and assigns cards. Used for taxonomy discovery and mental model research.', instructionPlaceholder: 'Create your own groups and name them' },
  q_sort:             { label: 'Q-Sort',                           tooltip: 'Items sorted into a fixed forced-normal distribution. Niche method for psychographic profiling.', instructionPlaceholder: 'Sort the statements into the distribution shown' },
  drag_classify:      { label: 'Drag-to-Classify',                tooltip: 'Generic drag-and-drop for assigning items to one or more groupings. May allow multi-tagging.', instructionPlaceholder: 'Drag each item to the appropriate category' },
  // ── Spatial and Visual Input ───────────────────────────────────────────────
  image_map:          { label: 'Image Hotspot',                    tooltip: 'Image with pre-defined invisible regions; respondent clicks to indicate a region of interest.', instructionPlaceholder: 'Click on the part of the image that best applies' },
  heatmap:            { label: 'Heatmap (Free-Form Click)',        tooltip: 'Image shown; respondent clicks any pixel. Coordinates captured; aggregated heatmap shows attention patterns.', instructionPlaceholder: 'Click anywhere on the image to show where your eye is drawn' },
  map_pin:            { label: 'Map Pin / Geolocation',            tooltip: 'Interactive map where respondent drops a pin or selects a geographic region. Provide a text search fallback.', instructionPlaceholder: 'Drop a pin on the map to indicate the location' },
  text_highlight:     { label: 'Text Highlight / Annotation',      tooltip: 'Block of text shown; respondent highlights words or phrases to indicate a specific reaction.', instructionPlaceholder: 'Highlight any words or phrases that apply' },
  // ── Media Capture and Stimulus ─────────────────────────────────────────────
  image_upload:       { label: 'Image Upload',                     tooltip: 'Respondent uploads an image from device library or captures one in-the-moment via camera.', instructionPlaceholder: 'Please upload a photo as your response' },
  audio_capture:      { label: 'Audio Capture',                    tooltip: 'Respondent records an audio clip. Plan ASR transcription pipeline before fielding at scale.', instructionPlaceholder: 'Record a short voice message in response to the prompt' },
  video_capture:      { label: 'Video Capture (Testimonial)',      tooltip: 'Respondent records a video response using their front-facing camera. Drop-off rates are high — provide clear consent.', instructionPlaceholder: 'Record a short video response' },
  video_player:       { label: 'Video Player',                     tooltip: 'Pre-recorded video shown to the respondent before a downstream response question. Enforce minimum watch time.', instructionPlaceholder: 'Watch the video and answer the questions below' },
  video_player_embed: { label: 'Video Player (YouTube / Vimeo)',   tooltip: 'Participants watch an embedded YouTube or Vimeo video. Enforce minimum view before continuing.', instructionPlaceholder: 'Watch the video and answer the questions below' },
  page_turner:        { label: 'Page Turner',                      tooltip: 'Participants page through a set of uploaded images or pages.', instructionPlaceholder: 'Click on the part of the image you like most' },
  signature_capture:  { label: 'Signature Capture',               tooltip: 'Touch or mouse-drawn signature on a canvas. Used for research consent flows and acknowledgement of terms.', instructionPlaceholder: 'Please sign to confirm your consent' },
  // ── Special and Advanced ───────────────────────────────────────────────────
  ai_probed_open:     { label: 'AI-Probed Open-End',              tooltip: 'Standard open-end with an LLM-driven follow-up that probes for depth based on the initial response. Audit probe quality regularly.', instructionPlaceholder: 'Answer in your own words — follow-up questions may appear based on your response' },
  chatbot_dialog:     { label: 'Chatbot / Multi-Turn Dialog',      tooltip: 'Entire question or section delivered as a chat conversation. Build structured validators on top of the free conversation output.', instructionPlaceholder: 'Type your replies in the chat' },
  iat:                { label: 'Implicit Association Test (IAT)',  tooltip: 'Timed categorisation task where reaction-time differences reveal implicit attitudes. Requires trained research design.', instructionPlaceholder: 'Sort the words as quickly as possible' },
  reaction_time:      { label: 'Reaction-Time Task',              tooltip: 'Response latency is the key measure alongside content. Use only on calibrated research platforms.', instructionPlaceholder: 'Respond as quickly as possible' },
  calculator_input:   { label: 'Calculator / Formula Input',       tooltip: 'Field whose value is computed from other fields, or validated against a formula. Always show the live calculated result.', instructionPlaceholder: 'Enter values — totals will be calculated automatically' },
  // ── Structural / Display ───────────────────────────────────────────────────
  section:            { label: 'Section',                          tooltip: 'Display a section header or intro block. No response is collected. Keep under 4 lines on mobile.', instructionPlaceholder: 'Content goes...' },
  note:               { label: 'Note',                             tooltip: 'Display a note or instruction to participants. No response is collected.', instructionPlaceholder: 'Please answer honestly' },
  stimulus_display:   { label: 'Stimulus Display',                 tooltip: 'Image, video, or rich-media stimulus shown with no captured response. Enforce minimum view time for video.', instructionPlaceholder: 'Review the stimulus carefully before continuing' },
  exec:               { label: 'Exec',                             tooltip: 'System execution element. No visible text shown to participants.', instructionPlaceholder: 'System execution, no visible text' },
  import_data:        { label: 'Import Data',                      tooltip: 'Import background data silently into the survey session.', instructionPlaceholder: 'Background data loaded silently' },
  captcha_check:      { label: 'Captcha / Quality Check',          tooltip: 'Element designed to catch bots, inattentive respondents, or fraudulent participants. Never rely on a single trap.', instructionPlaceholder: 'Quality assurance check' },
};

// ── Grouped options for the type dropdown ─────────────────────────────────────

const TYPE_GROUPS: { label: string; types: QuestionType[] }[] = [
  {
    label: 'Open-End',
    types: ['text', 'essay', 'number', 'number_decimal', 'date_picker', 'validated_input', 'auto_suggest'],
  },
  {
    label: 'Single-Choice Selection',
    types: ['single_select', 'button_single_select', 'image_single_select', 'binary_yes_no', 'dropdown'],
  },
  {
    label: 'Multi-Choice Selection',
    types: ['multi_select', 'button_multi_select', 'image_multi_select', 'top_n_select', 'constant_n_select'],
  },
  {
    label: 'Grid / Matrix',
    types: ['single_select_grid', 'multi_select_grid', 'mixed_format_grid', 'bipolar_grid', 'this_or_that', 'side_by_side_grid'],
  },
  {
    label: 'Rating Scales',
    types: ['likert_scale', 'importance_scale', 'satisfaction_scale', 'frequency_scale', 'star_rating', 'emoji_scale', 'slider', 'slider_continuous', 'vas_scale', 'nps', 'button_rating', 'rating_scale', 'card_rating', 'slider_rating'],
  },
  {
    label: 'Allocation / Summation',
    types: ['constant_sum', 'autosum', 'chip_allocation', 'sum_locked_sliders'],
  },
  {
    label: 'Ranking',
    types: ['rank_sort', 'top_n_ranking', 'forced_distribution_ranking', 'pairwise_comparison'],
  },
  {
    label: 'Trade-Off & Choice Modeling',
    types: ['maxdiff', 'pairwise_modeled', 'cbc_conjoint', 'acbc_conjoint', 'menu_conjoint'],
  },
  {
    label: 'Sorting & Classification',
    types: ['card_sort', 'card_sort_open', 'q_sort', 'drag_classify'],
  },
  {
    label: 'Spatial & Visual Input',
    types: ['image_map', 'heatmap', 'map_pin', 'text_highlight'],
  },
  {
    label: 'Media Capture & Stimulus',
    types: ['image_upload', 'audio_capture', 'video_capture', 'video_player', 'video_player_embed', 'page_turner', 'signature_capture'],
  },
  {
    label: 'Special & Advanced',
    types: ['ai_probed_open', 'chatbot_dialog', 'iat', 'reaction_time', 'calculator_input'],
  },
  {
    label: 'Structural',
    types: ['section', 'note', 'stimulus_display', 'exec', 'import_data', 'captcha_check'],
  },
];

// ── Question data model ───────────────────────────────────────────────────────

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  instruction?: string;

  // ── Generic option lists ───────────────────────────────────────────────────
  options?: string[];           // single_select / multi_select / dropdown / button variants / binary
  rows?: string[];              // grid rows, autosum rows, likert/importance/satisfaction/frequency rows
  columns?: string[];           // grid columns, scale labels
  leftOptions?: string[];       // this_or_that / bipolar left poles
  rightOptions?: string[];      // this_or_that / bipolar right poles

  // ── N-selection constraints ────────────────────────────────────────────────
  nValue?: number;              // top_n_select, constant_n_select, top_n_ranking

  // ── Rank Sort ─────────────────────────────────────────────────────────────
  rankLabels?: string[];
  rankItems?: string[];

  // ── Card Sort ─────────────────────────────────────────────────────────────
  cards?: string[];
  buckets?: string[];

  // ── Q-Sort ────────────────────────────────────────────────────────────────
  qSortItems?: string[];
  qSortBuckets?: string[];      // bucket names + required counts e.g. "Most like me (2)"
  qSortDistribution?: number[]; // count per bucket

  // ── Forced Distribution Ranking ───────────────────────────────────────────
  rankingItems?: string[];
  rankingBuckets?: string[];
  rankingDistribution?: number[];

  // ── Pairwise ──────────────────────────────────────────────────────────────
  pairItems?: string[];

  // ── MaxDiff ───────────────────────────────────────────────────────────────
  attributes?: string[];
  maxdiffColumns?: string[];

  // ── CBC / ACBC / MBC Conjoint ─────────────────────────────────────────────
  conjointAttributes?: string[];   // attribute names
  conjointLevels?: string[];        // "Attribute | Level" entries

  // ── Constant Sum / Chip / Sum-Locked ──────────────────────────────────────
  allocationItems?: string[];
  allocationTotal?: number;

  // ── Star Rating ───────────────────────────────────────────────────────────
  starTooltips?: string[];
  starRows?: string[];

  // ── Emoji Scale ───────────────────────────────────────────────────────────
  emojiRows?: string[];

  // ── NPS ───────────────────────────────────────────────────────────────────
  npsLowLabel?: string;
  npsHighLabel?: string;

  // ── Rating Scale (grid) ───────────────────────────────────────────────────
  scaleRows?: string[];
  scaleColumns?: string[];

  // ── Likert / Importance / Satisfaction / Frequency grids ──────────────────
  scaleItems?: string[];        // the row items being rated
  scalePoints?: string[];       // the column labels

  // ── Side-by-Side Grid ─────────────────────────────────────────────────────
  sxsEntities?: string[];       // e.g. ["Brand A", "Brand B"]
  sxsAttributes?: string[];
  sxsScalePoints?: string[];

  // ── Card Rating ───────────────────────────────────────────────────────────
  cardRatingCards?: string[];
  cardRatingButtons?: string[];

  // ── Slider Rating ─────────────────────────────────────────────────────────
  sliderPoints?: string[];
  sliders?: string[];

  // ── Slider (discrete / continuous / VAS) ──────────────────────────────────
  sliderMin?: string;
  sliderMax?: string;
  sliderStep?: string;

  // ── Button Rating ─────────────────────────────────────────────────────────
  buttonRatingRows?: string[];

  // ── Heatmap ───────────────────────────────────────────────────────────────
  heatmapFiles?: FileItem[];

  // ── Map Pin ───────────────────────────────────────────────────────────────
  mapCenter?: string;           // default location hint

  // ── Text Highlight ────────────────────────────────────────────────────────
  highlightText?: string;
  highlightReactions?: string[]; // labels respondents assign to highlights

  // ── Validated Input ───────────────────────────────────────────────────────
  validatedFormat?: string;     // 'email' | 'phone' | 'url' | 'postcode' | 'address'

  // ── Number Decimal ────────────────────────────────────────────────────────
  numberPrefix?: string;        // e.g. "$"
  numberSuffix?: string;        // e.g. "%"

  // ── Calculator / Formula ──────────────────────────────────────────────────
  calcFields?: string[];        // input field labels

  // ── IAT ───────────────────────────────────────────────────────────────────
  iatCategories?: string[];
  iatStimuli?: string[];

  // ── AI-Probed open-end ────────────────────────────────────────────────────
  aiProbeInstructions?: string;

  // ── Structural ────────────────────────────────────────────────────────────
  sectionName?: string;
  noteText?: string;
  execInstruction?: string;
  captchaInstruction?: string;

  // ── Auto Suggest ──────────────────────────────────────────────────────────
  autoSuggestSourceFile?: File | null;
  autoSuggestSourceFileName?: string;

  // ── File-based types ──────────────────────────────────────────────────────
  imageMapFiles?: FileItem[];
  imageMapMarkers?: string[];
  pageTurnerPages?: FileItem[];
  videoFile?: File | null;
  videoFileName?: string;
  videoEmbedName?: string;
  videoEmbedUrl?: string;
  imageUploadFiles?: FileItem[];
  stimulusFiles?: FileItem[];   // stimulus_display
}

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
  nValue: 3,
  rankLabels: ['Button 1', 'Button 2'],
  rankItems: ['Button 1', 'Button 2'],
  cards: ['Button 1', 'Button 2'],
  buckets: ['Button 1', 'Button 2'],
  qSortItems: ['', ''],
  qSortBuckets: ['Most like me (2)', 'Quite like me (4)', 'Neutral (8)', 'Quite unlike me (4)', 'Most unlike me (2)'],
  qSortDistribution: [2, 4, 8, 4, 2],
  rankingItems: ['', '', ''],
  rankingBuckets: ['Top', 'Middle', 'Bottom'],
  rankingDistribution: [3, 4, 3],
  pairItems: ['', ''],
  attributes: ['Button 1', 'Button 2'],
  maxdiffColumns: ['Button 1', 'Button 2'],
  conjointAttributes: ['Attribute 1', 'Attribute 2'],
  conjointLevels: ['Attribute 1 | Level A', 'Attribute 1 | Level B', 'Attribute 2 | Level A', 'Attribute 2 | Level B'],
  allocationItems: ['Option 1', 'Option 2', 'Option 3'],
  allocationTotal: 100,
  starTooltips: ['Text', 'Text', 'Text', 'Text', 'Text'],
  starRows: ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'],
  emojiRows: [''],
  npsLowLabel: 'Not at all likely',
  npsHighLabel: 'Extremely likely',
  scaleRows: ['Text', 'Text', 'Text', 'Text', 'Text'],
  scaleColumns: ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'],
  scaleItems: ['Item 1', 'Item 2', 'Item 3'],
  scalePoints: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
  sxsEntities: ['Brand A', 'Brand B'],
  sxsAttributes: ['Attribute 1', 'Attribute 2'],
  sxsScalePoints: ['1', '2', '3', '4', '5'],
  cardRatingCards: ['Text', 'Text', 'Text', 'Text', 'Text'],
  cardRatingButtons: ['Button 1', 'Button 2'],
  sliderPoints: ['Text', 'Text', 'Text', 'Text', 'Text'],
  sliders: ['Button 1', 'Button 2'],
  sliderMin: '0',
  sliderMax: '100',
  sliderStep: '1',
  buttonRatingRows: ['Text'],
  heatmapFiles: [],
  mapCenter: '',
  highlightText: '',
  highlightReactions: ['Resonates', 'Confusing', 'Concerning'],
  validatedFormat: 'email',
  numberPrefix: '',
  numberSuffix: '',
  calcFields: ['Field 1', 'Field 2'],
  iatCategories: ['Category A', 'Category B'],
  iatStimuli: ['', ''],
  aiProbeInstructions: '',
  sectionName: '',
  noteText: '',
  execInstruction: '',
  captchaInstruction: '',
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
  stimulusFiles: [],
});

// ── Sub-components ────────────────────────────────────────────────────────────

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

interface UploadZoneProps {
  label: string;
  accept?: string;
  onFiles: (files: File[]) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ label, accept = '*', onFiles }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="qm-upload-zone" onClick={() => inputRef.current?.click()}>
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

// Reusable multi-file upload field (upload zone → chips)
interface MultiFileFieldProps {
  label: string;
  files: FileItem[];
  accept: string;
  uploadBtnLabel?: string;
  zoneLabelEmpty: string;
  onAdd: (newFiles: FileItem[]) => void;
  onRemove: (i: number) => void;
}

const MultiFileField: React.FC<MultiFileFieldProps> = ({
  label, files, accept, uploadBtnLabel = 'Upload File',
  zoneLabelEmpty, onAdd, onRemove,
}) => (
  <div className="qm-field">
    <div className="qm-upload-field-header">
      <label className="qm-label">{label} <span className="qm-required">*</span></label>
      {files.length > 0 && (
        <button
          type="button"
          className="qm-upload-inline-btn"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.multiple = true;
            input.onchange = (e) => {
              const newFiles = Array.from((e.target as HTMLInputElement).files ?? []).map(f => ({ name: f.name }));
              onAdd(newFiles);
            };
            input.click();
          }}
        >
          <TbCloudUpload size={14} />
          {uploadBtnLabel}
        </button>
      )}
    </div>
    {files.length === 0 ? (
      <UploadZone
        label={zoneLabelEmpty}
        accept={accept}
        onFiles={(fs) => onAdd(fs.map(f => ({ name: f.name })))}
      />
    ) : (
      <div className="qm-file-chips">
        {files.map((f, i) => (
          <FileChip key={i} name={f.name} onRemove={() => onRemove(i)} />
        ))}
      </div>
    )}
  </div>
);

// Single-file upload field
interface SingleFileFieldProps {
  label: string;
  fileName: string;
  accept: string;
  zoneLabelEmpty: string;
  onFile: (file: File) => void;
  onRemove: () => void;
}

const SingleFileField: React.FC<SingleFileFieldProps> = ({
  label, fileName, accept, zoneLabelEmpty, onFile, onRemove,
}) => (
  <div className="qm-field">
    {fileName ? (
      <>
        <label className="qm-label">{label} <span className="qm-required">*</span></label>
        <FileChip name={fileName} onRemove={onRemove} />
      </>
    ) : (
      <UploadZone
        label={zoneLabelEmpty}
        accept={accept}
        onFiles={(fs) => { if (fs[0]) onFile(fs[0]); }}
      />
    )}
  </div>
);

interface PairEditorProps {
  leftItems: string[];
  rightItems: string[];
  onChangeLeft: (items: string[]) => void;
  onChangeRight: (items: string[]) => void;
}

const PairEditor: React.FC<PairEditorProps> = ({ leftItems, rightItems, onChangeLeft, onChangeRight }) => {
  const count = Math.max(leftItems.length, rightItems.length);
  const updateLeft = (i: number, val: string) => { const n = [...leftItems]; n[i] = val; onChangeLeft(n); };
  const updateRight = (i: number, val: string) => { const n = [...rightItems]; n[i] = val; onChangeRight(n); };
  const removePair = (i: number) => {
    onChangeLeft(leftItems.filter((_, idx) => idx !== i));
    onChangeRight(rightItems.filter((_, idx) => idx !== i));
  };
  const addPair = () => { onChangeLeft([...leftItems, '']); onChangeRight([...rightItems, '']); };

  return (
    <div className="qm-list-editor">
      <label className="qm-label">Options <span className="qm-required">*</span></label>
      <div className="qm-grid-header">
        <span>Left Legend</span>
        <span>Right Legend</span>
      </div>
      <div className="qm-list-editor__items">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="qm-pair-row">
            <TbGripVertical size={14} className="qm-drag-handle" />
            <div className="qm-pair-inputs">
              <input className="qm-row-input" value={leftItems[i] ?? ''} placeholder="Text" onChange={(e) => updateLeft(i, e.target.value)} />
              <input className="qm-row-input" value={rightItems[i] ?? ''} placeholder="Text" onChange={(e) => updateRight(i, e.target.value)} />
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

// Small number input field
const NumberInput: React.FC<{
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}> = ({ label, value, onChange, placeholder = '0', required = false }) => (
  <div className="qm-field">
    <label className="qm-label">{label} {required && <span className="qm-required">*</span>}</label>
    <input
      className="qm-text-input"
      type="number"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

// ── Type-specific fields renderer ─────────────────────────────────────────────

const TypeFields: React.FC<{
  q: Question;
  set: <K extends keyof Question>(k: K, v: Question[K]) => void;
}> = ({ q, set }) => {
  switch (q.type) {

    // ── Open-End ──────────────────────────────────────────────────────────────
    case 'text':
    case 'essay':
    case 'number':
    case 'date_picker':
    case 'ai_probed_open':
      return null;

    case 'number_decimal':
      return (
        <>
          <div className="qm-field">
            <label className="qm-label">Prefix (optional)</label>
            <input className="qm-text-input" value={q.numberPrefix ?? ''} placeholder="e.g. $" onChange={(e) => set('numberPrefix', e.target.value)} />
          </div>
          <div className="qm-field">
            <label className="qm-label">Suffix (optional)</label>
            <input className="qm-text-input" value={q.numberSuffix ?? ''} placeholder="e.g. %" onChange={(e) => set('numberSuffix', e.target.value)} />
          </div>
        </>
      );

    case 'validated_input': {
      const formats = ['email', 'phone', 'url', 'postcode', 'address'];
      return (
        <div className="qm-field">
          <label className="qm-label">Validation Format <span className="qm-required">*</span></label>
          <div className="qm-list-editor__items" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {formats.map((f) => (
              <button
                key={f}
                type="button"
                className={`qm-type-option ${q.validatedFormat === f ? 'qm-type-option--active' : ''}`}
                style={{ width: 'auto', padding: '7px 14px' }}
                onClick={() => set('validatedFormat', f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {q.validatedFormat === f && <TbCheck size={13} className="qm-type-option__check" style={{ marginLeft: 6 }} />}
              </button>
            ))}
          </div>
        </div>
      );
    }

    case 'auto_suggest': {
      const sourceFileName = q.autoSuggestSourceFileName ?? '';
      return (
        <>
          <div className="qm-field">
            {sourceFileName ? (
              <div className="qm-upload-header">
                <label className="qm-label">Source File <span className="qm-required">*</span></label>
                <FileChip name={sourceFileName} onRemove={() => { set('autoSuggestSourceFileName', ''); set('autoSuggestSourceFile', null); }} />
              </div>
            ) : (
              <UploadZone label="Upload Answer Source File" accept=".csv,.xlsx,.json" onFiles={(files) => { if (files[0]) { set('autoSuggestSourceFile', files[0] as any); set('autoSuggestSourceFileName', files[0].name); } }} />
            )}
          </div>
          <ListEditor label="Rows" items={q.rows ?? ['']} onChange={(v) => set('rows', v)} addLabel="Add New Row" placeholder="Text" />
          <ListEditor label="Columns" required={false} items={q.columns ?? ['']} onChange={(v) => set('columns', v)} addLabel="Add New Column" placeholder="Text" showImport={false} />
        </>
      );
    }

    // ── Single-Choice Selection ────────────────────────────────────────────────
    case 'single_select':
    case 'button_single_select':
    case 'dropdown':
      return (
        <ListEditor label="Options" items={q.options ?? ['']} onChange={(v) => set('options', v)} addLabel="Add Option" placeholder="Text" minItems={1} />
      );

    case 'image_single_select':
      return (
        <MultiFileField
          label="Option Images"
          files={q.imageUploadFiles ?? []}
          accept="image/*"
          uploadBtnLabel="Upload Image"
          zoneLabelEmpty="Upload option images (.jpg or .png)"
          onAdd={(nf) => set('imageUploadFiles', [...(q.imageUploadFiles ?? []), ...nf])}
          onRemove={(i) => set('imageUploadFiles', (q.imageUploadFiles ?? []).filter((_, idx) => idx !== i))}
        />
      );

    case 'binary_yes_no':
      return (
        <ListEditor label="Options" items={q.options ?? ['Yes', 'No']} onChange={(v) => set('options', v)} addLabel="Add Option" placeholder="Text" minItems={2} showImport={false} />
      );

    // ── Multi-Choice Selection ─────────────────────────────────────────────────
    case 'multi_select':
    case 'button_multi_select':
      return (
        <ListEditor label="Options" items={q.options ?? ['']} onChange={(v) => set('options', v)} addLabel="Add Option" placeholder="Text" minItems={1} />
      );

    case 'image_multi_select':
      return (
        <MultiFileField
          label="Option Images"
          files={q.imageUploadFiles ?? []}
          accept="image/*"
          uploadBtnLabel="Upload Image"
          zoneLabelEmpty="Upload option images (.jpg or .png)"
          onAdd={(nf) => set('imageUploadFiles', [...(q.imageUploadFiles ?? []), ...nf])}
          onRemove={(i) => set('imageUploadFiles', (q.imageUploadFiles ?? []).filter((_, idx) => idx !== i))}
        />
      );

    case 'top_n_select':
      return (
        <>
          <NumberInput label="Maximum Selections (N)" value={q.nValue ?? 3} onChange={(v) => set('nValue', Number(v))} required />
          <ListEditor label="Options" items={q.options ?? ['']} onChange={(v) => set('options', v)} addLabel="Add Option" placeholder="Text" minItems={1} />
        </>
      );

    case 'constant_n_select':
      return (
        <>
          <NumberInput label="Exact Selections Required (N)" value={q.nValue ?? 3} onChange={(v) => set('nValue', Number(v))} required />
          <ListEditor label="Options" items={q.options ?? ['']} onChange={(v) => set('options', v)} addLabel="Add Option" placeholder="Text" minItems={1} />
        </>
      );

    // ── Grid / Matrix ──────────────────────────────────────────────────────────
    case 'single_select_grid':
      return (
        <>
          <ListEditor label="Rows" required items={q.rows ?? ['']} onChange={(v) => set('rows', v)} addLabel="Add New Row" placeholder="Text" />
          <ListEditor label="Columns" required={false} items={q.columns ?? ['']} onChange={(v) => set('columns', v)} addLabel="Add New Column" placeholder="Text" />
        </>
      );

    case 'multi_select_grid':
      return (
        <>
          <ListEditor label="Attributes (Rows)" required items={q.rows ?? ['']} onChange={(v) => set('rows', v)} addLabel="Add New Row" placeholder="Attribute" />
          <ListEditor label="Entities (Columns)" required items={q.columns ?? ['']} onChange={(v) => set('columns', v)} addLabel="Add New Column" placeholder="Entity" />
        </>
      );

    case 'mixed_format_grid':
      return (
        <>
          <ListEditor label="Rows" required items={q.rows ?? ['']} onChange={(v) => set('rows', v)} addLabel="Add New Row" placeholder="Row label" />
          <ListEditor label="Column Headers" required items={q.columns ?? ['']} onChange={(v) => set('columns', v)} addLabel="Add New Column" placeholder="Column label" showImport={false} />
        </>
      );

    case 'bipolar_grid':
      return (
        <>
          <PairEditor
            leftItems={q.leftOptions ?? ['', '']}
            rightItems={q.rightOptions ?? ['', '']}
            onChangeLeft={(v) => set('leftOptions', v)}
            onChangeRight={(v) => set('rightOptions', v)}
          />
          <NumberInput label="Scale Points" value={q.nValue ?? 5} onChange={(v) => set('nValue', Number(v))} />
        </>
      );

    case 'this_or_that':
      return (
        <>
          <PairEditor
            leftItems={q.leftOptions ?? ['', '']}
            rightItems={q.rightOptions ?? ['', '']}
            onChangeLeft={(v) => set('leftOptions', v)}
            onChangeRight={(v) => set('rightOptions', v)}
          />
          <ListEditor label="" required={false} items={q.columns ?? ['']} onChange={(v) => set('columns', v)} addLabel="Add New Column" placeholder="Text" />
        </>
      );

    case 'side_by_side_grid':
      return (
        <>
          <ListEditor label="Entities (e.g. Brand A, Brand B)" required items={q.sxsEntities ?? ['Entity A', 'Entity B']} onChange={(v) => set('sxsEntities', v)} addLabel="Add Entity" placeholder="Entity name" showImport={false} />
          <ListEditor label="Attributes (Rows)" required items={q.sxsAttributes ?? ['']} onChange={(v) => set('sxsAttributes', v)} addLabel="Add New Row" placeholder="Attribute" />
          <ListEditor label="Scale Points (Columns)" required items={q.sxsScalePoints ?? ['1', '2', '3', '4', '5']} onChange={(v) => set('sxsScalePoints', v)} addLabel="Add Scale Point" placeholder="Label" showImport={false} />
        </>
      );

    // ── Rating Scales ──────────────────────────────────────────────────────────
    case 'likert_scale':
      return (
        <>
          <ListEditor label="Statements (Rows)" required items={q.scaleItems ?? ['']} onChange={(v) => set('scaleItems', v)} addLabel="Add Statement" placeholder="Statement text" />
          <ListEditor label="Scale Labels" required items={q.scalePoints ?? ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']} onChange={(v) => set('scalePoints', v)} addLabel="Add Scale Point" placeholder="Label" showImport={false} />
        </>
      );

    case 'importance_scale':
      return (
        <>
          <ListEditor label="Items (Rows)" required items={q.scaleItems ?? ['']} onChange={(v) => set('scaleItems', v)} addLabel="Add Item" placeholder="Item text" />
          <ListEditor label="Scale Labels" required items={q.scalePoints ?? ['Not at all important', 'Slightly important', 'Moderately important', 'Very important', 'Critical']} onChange={(v) => set('scalePoints', v)} addLabel="Add Scale Point" placeholder="Label" showImport={false} />
        </>
      );

    case 'satisfaction_scale':
      return (
        <>
          <ListEditor label="Items (Rows)" required items={q.scaleItems ?? ['']} onChange={(v) => set('scaleItems', v)} addLabel="Add Item" placeholder="Item text" />
          <ListEditor label="Scale Labels" required items={q.scalePoints ?? ['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied']} onChange={(v) => set('scalePoints', v)} addLabel="Add Scale Point" placeholder="Label" showImport={false} />
        </>
      );

    case 'frequency_scale':
      return (
        <>
          <ListEditor label="Behaviours (Rows)" required items={q.scaleItems ?? ['']} onChange={(v) => set('scaleItems', v)} addLabel="Add Item" placeholder="Behaviour text" />
          <ListEditor label="Scale Labels" required items={q.scalePoints ?? ['Never', 'Rarely', 'Sometimes', 'Often', 'Always']} onChange={(v) => set('scalePoints', v)} addLabel="Add Scale Point" placeholder="Label" showImport={false} />
        </>
      );

    case 'star_rating':
      return (
        <>
          <ListEditor label="Star Tooltip" required items={q.starTooltips ?? ['Text', 'Text', 'Text', 'Text', 'Text']} onChange={(v) => set('starTooltips', v)} addLabel="Add New Row" placeholder="Text" />
          <ListEditor label="Rows" required items={q.starRows ?? ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5']} onChange={(v) => set('starRows', v)} addLabel="Add New Row" placeholder="Row" />
        </>
      );

    case 'emoji_scale':
      return (
        <ListEditor label="Rows" required={false} items={q.emojiRows ?? ['']} onChange={(v) => set('emojiRows', v)} addLabel="Add New Row" placeholder="Row label" showImport={false} />
      );

    case 'slider':
      return (
        <ListEditor label="Sliders" required items={q.sliders ?? ['Button 1', 'Button 2']} onChange={(v) => set('sliders', v)} addLabel="Add New Slider" placeholder="Slider" />
      );

    case 'slider_continuous':
    case 'vas_scale':
      return (
        <>
          <div className="qm-field">
            <label className="qm-label">Left Anchor Label <span className="qm-required">*</span></label>
            <input className="qm-text-input" value={q.sliderMin ?? ''} placeholder="e.g. Not at all" onChange={(e) => set('sliderMin', e.target.value)} />
          </div>
          <div className="qm-field">
            <label className="qm-label">Right Anchor Label <span className="qm-required">*</span></label>
            <input className="qm-text-input" value={q.sliderMax ?? ''} placeholder="e.g. Extremely" onChange={(e) => set('sliderMax', e.target.value)} />
          </div>
        </>
      );

    case 'nps':
      return (
        <>
          <div className="qm-field">
            <label className="qm-label">Low Label (0)</label>
            <input className="qm-text-input" value={q.npsLowLabel ?? 'Not at all likely'} placeholder="e.g. Not at all likely" onChange={(e) => set('npsLowLabel', e.target.value)} />
          </div>
          <div className="qm-field">
            <label className="qm-label">High Label (10)</label>
            <input className="qm-text-input" value={q.npsHighLabel ?? 'Extremely likely'} placeholder="e.g. Extremely likely" onChange={(e) => set('npsHighLabel', e.target.value)} />
          </div>
        </>
      );

    case 'button_rating':
      return (
        <ListEditor label="Options" items={q.buttonRatingRows ?? ['']} onChange={(v) => set('buttonRatingRows', v)} addLabel="Add New Row" placeholder="Text" />
      );

    case 'rating_scale':
      return (
        <>
          <ListEditor label="Rows" required items={q.scaleRows ?? ['Text', 'Text', 'Text', 'Text', 'Text']} onChange={(v) => set('scaleRows', v)} addLabel="Add New Row" placeholder="Text" />
          <ListEditor label="Columns" required items={q.scaleColumns ?? ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5']} onChange={(v) => set('scaleColumns', v)} addLabel="Add New Row" placeholder="Row" />
        </>
      );

    case 'card_rating':
      return (
        <>
          <ListEditor label="Cards" required items={q.cardRatingCards ?? ['Text', 'Text', 'Text', 'Text', 'Text']} onChange={(v) => set('cardRatingCards', v)} addLabel="Add New Card" placeholder="Text" />
          <ListEditor label="Buttons" required items={q.cardRatingButtons ?? ['Button 1', 'Button 2']} onChange={(v) => set('cardRatingButtons', v)} addLabel="Add New Button" placeholder="Button" showImport={false} />
        </>
      );

    case 'slider_rating':
      return (
        <>
          <ListEditor label="Points" required items={q.sliderPoints ?? ['Text', 'Text', 'Text', 'Text', 'Text']} onChange={(v) => set('sliderPoints', v)} addLabel="Add New Point" placeholder="Text" />
          <ListEditor label="Sliders" required items={q.sliders ?? ['Button 1', 'Button 2']} onChange={(v) => set('sliders', v)} addLabel="Add New Slider" placeholder="Slider" />
        </>
      );

    // ── Allocation / Summation ─────────────────────────────────────────────────
    case 'constant_sum':
    case 'chip_allocation':
    case 'sum_locked_sliders':
      return (
        <>
          <NumberInput label="Total to Allocate" value={q.allocationTotal ?? 100} onChange={(v) => set('allocationTotal', Number(v))} required />
          <ListEditor label="Options" required items={q.allocationItems ?? ['']} onChange={(v) => set('allocationItems', v)} addLabel="Add Option" placeholder="Option label" />
        </>
      );

    case 'autosum':
      return (
        <>
          <ListEditor label="Options" required={false} items={q.rows ?? ['']} onChange={(v) => set('rows', v)} addLabel="Add New Row" placeholder="Text" />
          <ListEditor label="" required={false} items={q.columns ?? ['']} onChange={(v) => set('columns', v)} addLabel="Add New Column" placeholder="Text" />
        </>
      );

    // ── Ranking ────────────────────────────────────────────────────────────────
    case 'rank_sort':
      return (
        <>
          <ListEditor label="Rank Labels" required items={q.rankLabels ?? ['Button 1', 'Button 2']} onChange={(v) => set('rankLabels', v)} addLabel="Add New Rank Label" placeholder="Button" showImport />
          <ListEditor label="Rankable Items" required items={q.rankItems ?? ['Button 1', 'Button 2']} onChange={(v) => set('rankItems', v)} addLabel="Add New Rankable Item" placeholder="Button" />
        </>
      );

    case 'top_n_ranking':
      return (
        <>
          <NumberInput label="Rank Top N Items" value={q.nValue ?? 3} onChange={(v) => set('nValue', Number(v))} required />
          <ListEditor label="Items to Rank" required items={q.rankItems ?? ['']} onChange={(v) => set('rankItems', v)} addLabel="Add New Item" placeholder="Item" />
        </>
      );

    case 'forced_distribution_ranking':
      return (
        <>
          <ListEditor label="Items" required items={q.rankingItems ?? ['']} onChange={(v) => set('rankingItems', v)} addLabel="Add Item" placeholder="Item" />
          <ListEditor label="Buckets (include required count)" required items={q.rankingBuckets ?? ['Top', 'Middle', 'Bottom']} onChange={(v) => set('rankingBuckets', v)} addLabel="Add Bucket" placeholder="e.g. Top (3)" showImport={false} />
        </>
      );

    case 'pairwise_comparison':
    case 'pairwise_modeled':
      return (
        <ListEditor label="Items to Compare" required items={q.pairItems ?? ['', '']} onChange={(v) => set('pairItems', v)} addLabel="Add Item" placeholder="Item" minItems={2} showImport />
      );

    // ── Trade-Off & Choice Modeling ────────────────────────────────────────────
    case 'maxdiff':
      return (
        <>
          <ListEditor label="Attributes" required items={q.attributes ?? ['Button 1', 'Button 2']} onChange={(v) => set('attributes', v)} addLabel="Add New Attribute" placeholder="Button" />
          <ListEditor label="Columns" required items={q.maxdiffColumns ?? ['Button 1', 'Button 2']} onChange={(v) => set('maxdiffColumns', v)} addLabel="Add New Column" placeholder="Button" />
        </>
      );

    case 'cbc_conjoint':
    case 'acbc_conjoint':
    case 'menu_conjoint':
      return (
        <>
          <ListEditor label="Attributes" required items={q.conjointAttributes ?? ['Attribute 1', 'Attribute 2']} onChange={(v) => set('conjointAttributes', v)} addLabel="Add Attribute" placeholder="Attribute name" showImport={false} />
          <ListEditor label='Levels (format: "Attribute | Level")' required items={q.conjointLevels ?? ['']} onChange={(v) => set('conjointLevels', v)} addLabel="Add Level" placeholder="Attribute | Level" />
        </>
      );

    // ── Sorting & Classification ───────────────────────────────────────────────
    case 'card_sort':
      return (
        <>
          <ListEditor label="Cards" required items={q.cards ?? ['Button 1', 'Button 2']} onChange={(v) => set('cards', v)} addLabel="Add New Card" placeholder="Button" />
          <ListEditor label="Buckets" required items={q.buckets ?? ['Button 1', 'Button 2']} onChange={(v) => set('buckets', v)} addLabel="Add New Bucket" placeholder="Button" />
        </>
      );

    case 'card_sort_open':
      return (
        <ListEditor label="Cards" required items={q.cards ?? ['']} onChange={(v) => set('cards', v)} addLabel="Add New Card" placeholder="Card text" />
      );

    case 'q_sort':
      return (
        <>
          <ListEditor label="Items to Sort" required items={q.qSortItems ?? ['']} onChange={(v) => set('qSortItems', v)} addLabel="Add Item" placeholder="Statement or item" />
          <ListEditor label="Distribution Buckets (include count)" required items={q.qSortBuckets ?? ['Most like me (2)', 'Neutral (8)', 'Most unlike me (2)']} onChange={(v) => set('qSortBuckets', v)} addLabel="Add Bucket" placeholder="e.g. Positive (3)" showImport={false} />
        </>
      );

    case 'drag_classify':
      return (
        <>
          <ListEditor label="Items to Classify" required items={q.cards ?? ['']} onChange={(v) => set('cards', v)} addLabel="Add Item" placeholder="Item text" />
          <ListEditor label="Classification Labels" required items={q.buckets ?? ['', '']} onChange={(v) => set('buckets', v)} addLabel="Add Label" placeholder="Label" showImport={false} />
        </>
      );

    // ── Spatial & Visual Input ─────────────────────────────────────────────────
    case 'image_map': {
      const files = q.imageMapFiles ?? [];
      return (
        <>
          <MultiFileField
            label="Images"
            files={files}
            accept="image/*"
            uploadBtnLabel="Upload Image"
            zoneLabelEmpty="Upload Image .jpg or .png"
            onAdd={(nf) => set('imageMapFiles', [...files, ...nf])}
            onRemove={(i) => set('imageMapFiles', files.filter((_, idx) => idx !== i))}
          />
          <ListEditor label="" required={false} items={q.imageMapMarkers ?? ['']} onChange={(v) => set('imageMapMarkers', v)} addLabel="Add New Marker" placeholder="Text" showImport importLabel="Import Markers" />
        </>
      );
    }

    case 'heatmap': {
      const files = q.heatmapFiles ?? [];
      return (
        <MultiFileField
          label="Image"
          files={files}
          accept="image/*"
          uploadBtnLabel="Upload Image"
          zoneLabelEmpty="Upload Image .jpg or .png"
          onAdd={(nf) => set('heatmapFiles', [...files, ...nf])}
          onRemove={(i) => set('heatmapFiles', files.filter((_, idx) => idx !== i))}
        />
      );
    }

    case 'map_pin':
      return (
        <div className="qm-field">
          <label className="qm-label">Default Location Hint (optional)</label>
          <input className="qm-text-input" value={q.mapCenter ?? ''} placeholder="e.g. London, UK" onChange={(e) => set('mapCenter', e.target.value)} />
        </div>
      );

    case 'text_highlight':
      return (
        <>
          <div className="qm-field">
            <label className="qm-label">Text to Highlight <span className="qm-required">*</span></label>
            <textarea
              className="qm-textarea"
              value={q.highlightText ?? ''}
              placeholder="Paste the text block respondents will highlight..."
              rows={4}
              onChange={(e) => set('highlightText', e.target.value)}
            />
          </div>
          <ListEditor label="Reaction Labels" required={false} items={q.highlightReactions ?? ['Resonates', 'Confusing', 'Concerning']} onChange={(v) => set('highlightReactions', v)} addLabel="Add Label" placeholder="Label" showImport={false} />
        </>
      );

    // ── Media Capture & Stimulus ───────────────────────────────────────────────
    case 'image_upload': {
      const imgs = q.imageUploadFiles ?? [];
      return (
        <MultiFileField
          label="Images"
          files={imgs}
          accept="image/*"
          uploadBtnLabel="Upload Image"
          zoneLabelEmpty="Upload Image"
          onAdd={(nf) => set('imageUploadFiles', [...imgs, ...nf])}
          onRemove={(i) => set('imageUploadFiles', imgs.filter((_, idx) => idx !== i))}
        />
      );
    }

    case 'audio_capture':
    case 'video_capture':
    case 'signature_capture':
      return null; // Capture-only — no pre-configuration needed beyond question text

    case 'video_player':
      return (
        <SingleFileField
          label="Video"
          fileName={q.videoFileName ?? ''}
          accept="video/mp4,video/quicktime"
          zoneLabelEmpty="Upload Video .mp4 or .mov"
          onFile={(f) => { set('videoFile', f as any); set('videoFileName', f.name); }}
          onRemove={() => { set('videoFileName', ''); set('videoFile', null); }}
        />
      );

    case 'video_player_embed':
      return (
        <div className="qm-field">
          <label className="qm-label">URL <span className="qm-required">*</span></label>
          <div className="qm-url-input-wrap">
            <TbLink size={15} className="qm-url-input-wrap__icon" />
            <input className="qm-url-input" type="url" value={q.videoEmbedUrl ?? ''} placeholder="https://youtube.com/watch?v=..." onChange={(e) => set('videoEmbedUrl', e.target.value)} />
          </div>
        </div>
      );

    case 'page_turner': {
      const pages = q.pageTurnerPages ?? [];
      return (
        <MultiFileField
          label="Pages"
          files={pages}
          accept="image/*,video/*"
          uploadBtnLabel="Upload Image"
          zoneLabelEmpty="Upload Image"
          onAdd={(nf) => set('pageTurnerPages', [...pages, ...nf])}
          onRemove={(i) => set('pageTurnerPages', pages.filter((_, idx) => idx !== i))}
        />
      );
    }

    case 'stimulus_display': {
      const files = q.stimulusFiles ?? [];
      return (
        <MultiFileField
          label="Stimulus Media"
          files={files}
          accept="image/*,video/*"
          uploadBtnLabel="Upload File"
          zoneLabelEmpty="Upload image or video stimulus"
          onAdd={(nf) => set('stimulusFiles', [...files, ...nf])}
          onRemove={(i) => set('stimulusFiles', files.filter((_, idx) => idx !== i))}
        />
      );
    }

    // ── Special & Advanced ─────────────────────────────────────────────────────
    case 'chatbot_dialog':
    case 'reaction_time':
      return null;

    case 'iat':
      return (
        <>
          <ListEditor label="Categories" required items={q.iatCategories ?? ['Category A', 'Category B']} onChange={(v) => set('iatCategories', v)} addLabel="Add Category" placeholder="Category name" showImport={false} />
          <ListEditor label="Stimuli (words or concept labels)" required items={q.iatStimuli ?? ['']} onChange={(v) => set('iatStimuli', v)} addLabel="Add Stimulus" placeholder="Stimulus" />
        </>
      );

    case 'calculator_input':
      return (
        <ListEditor label="Input Fields" required items={q.calcFields ?? ['Field 1', 'Field 2']} onChange={(v) => set('calcFields', v)} addLabel="Add Field" placeholder="Field label" showImport={false} />
      );

    // ── Structural ─────────────────────────────────────────────────────────────
    case 'section':
      return (
        <div className="qm-field">
          <label className="qm-label">Section Name</label>
          <input className="qm-text-input" value={q.sectionName ?? ''} placeholder="Text" onChange={(e) => set('sectionName', e.target.value)} />
        </div>
      );

    case 'note':
      return (
        <div className="qm-field">
          <label className="qm-label">Note</label>
          <input className="qm-text-input" value={q.noteText ?? ''} placeholder="Enter note" onChange={(e) => set('noteText', e.target.value)} />
        </div>
      );

    case 'exec':
      return (
        <div className="qm-field">
          <label className="qm-label">Instruction</label>
          <input className="qm-text-input" value={q.execInstruction ?? ''} placeholder="Text" onChange={(e) => set('execInstruction', e.target.value)} />
        </div>
      );

    case 'import_data':
      return (
        <UploadZone label="Upload Data" onFiles={() => { /* wire as needed */ }} />
      );

    case 'captcha_check':
      return (
        <div className="qm-field">
          <label className="qm-label">Quality Check Instruction</label>
          <input className="qm-text-input" value={q.captchaInstruction ?? ''} placeholder="e.g. For quality purposes, please select Strongly disagree" onChange={(e) => set('captchaInstruction', e.target.value)} />
        </div>
      );

    default:
      return null;
  }
};

// ── Question field visibility ─────────────────────────────────────────────────

const hasQuestionField = (type: QuestionType): boolean => {
  const noQuestion: QuestionType[] = ['section', 'note', 'exec', 'import_data'];
  return !noQuestion.includes(type);
};

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
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
        <button className="qm-close" onClick={onClose} aria-label="Close">
          <TbX size={16} />
        </button>

        <div className="qm-header">
          <h2 className="qm-title">{initial ? 'Edit Question' : 'Add New Question'}</h2>
          <p className="qm-subtitle">Add your question, we'll take it from there.</p>
        </div>

        <div className="qm-body">

          {/* ── Type of question ── */}
          <div className="qm-field" ref={typeRef}>
            <label className="qm-label">Type of question <span className="qm-required">*</span></label>
            <div className="qm-type-wrap">
              <button type="button" className="qm-type-trigger" onClick={() => setTypeOpen((o) => !o)}>
                <span className="qm-type-trigger__left">
                  <span>{currentMeta.label}</span>
                  <InfoTooltip type={q.type} />
                </span>
                <TbChevronDown size={15} className="qm-type-trigger__chevron" style={{ transform: typeOpen ? 'rotate(180deg)' : 'none' }} />
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
                            {q.type === type && <TbCheck size={14} className="qm-type-option__check" />}
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
              <label className="qm-label">Question <span className="qm-required">*</span></label>
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

        <div className="qm-footer">
          <button type="button" className="qm-cancel-btn" onClick={onClose}>Cancel</button>
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