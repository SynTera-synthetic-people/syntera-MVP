/**
 * Build CSV: Q No., Question Description, Options, Count (one row per option).
 * @param {Array<{ title?: string, questions?: Array<{ text?: string, options?: string[] }> }>} sections
 * @param {Record<string, Array<{ option?: string, count?: number }>>|null} resultsMap - optional, same shape as SurveySimulation.results (question text -> rows)
 */
function escapeCsvCell(val) {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function lookupCount(resultsMap, qText, optLabel) {
  if (!resultsMap || typeof resultsMap !== 'object') return 0;
  const block = resultsMap[qText] ?? resultsMap[String(qText).trim()];
  if (!Array.isArray(block)) return 0;
  const o = String(optLabel).trim();
  const hit = block.find((x) => String(x?.option ?? '').trim() === o);
  return hit != null && hit.count != null ? Number(hit.count) || 0 : 0;
}

export function buildQuestionnaireCsvString(sections, resultsMap = null) {
  if (!Array.isArray(sections) || sections.length === 0) return '';

  const header = ['Q No.', 'Question Description', 'Options', 'Count'];
  const rows = [];
  let qNo = 0;

  for (const sec of sections) {
    for (const q of sec.questions || []) {
      const qText = String(q.text || '').trim();
      const opts = Array.isArray(q.options) ? q.options : [];
      qNo += 1;
      if (opts.length) {
        for (const opt of opts) {
          const label = opt == null ? '' : String(opt);
          rows.push([qNo, qText, label, lookupCount(resultsMap, qText, label)]);
        }
      } else {
        rows.push([qNo, qText, '', 0]);
      }
    }
  }

  const lines = [
    header.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  return lines.join('\r\n');
}

/**
 * Trigger a browser download of the questionnaire as CSV (UTF-8 with BOM for Excel).
 * @param {Parameters<typeof buildQuestionnaireCsvString>[0]} sections
 * @param {string} [filename]
 * @param {Parameters<typeof buildQuestionnaireCsvString>[1]} [resultsMap]
 */
export function downloadQuestionnaireCsv(sections, filename = 'questionnaire_exploration.csv', resultsMap = null) {
  const csv = buildQuestionnaireCsvString(sections, resultsMap);
  if (!csv) return;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
