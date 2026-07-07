// ── Shared sample dataset for the Coded Data / Labelled Data tabs ──────────────
//
// Mirrors the table shown in "Table Behaviour" / "Iteration 35" (Labelled
// Data) and "Iteration 36" (Coded Data) screens in the Figma file: a
// respondent-level grid where open-ended columns show raw text and
// categorical columns show either "<code> = <label>" (Coded Data) or just
// "<label>" (Labelled Data).

export interface GridColumn {
  key: string;
  header: string;
  /** Sub-header shown under the column name, e.g. "(text)" or a type hint. */
  type: 'text' | 'not-defined' | 'categorical';
}

export interface GridCell {
  code?: number;
  label: string;
}

export const GRID_COLUMNS: GridColumn[] = [
  { key: 'respid', header: 'respid', type: 'not-defined' },
  { key: 'LOISec', header: 'LOISec', type: 'text' },
  { key: 'status', header: 'status', type: 'text' },
  { key: 'Comments', header: 'Comments', type: 'text' },
  { key: 'S1_country', header: 'S1_question', type: 'text' },
  { key: 'S1_other', header: 'S1_question', type: 'text' },
  { key: 'S1_employees', header: 'S1_question', type: 'categorical' },
  { key: 'S1_revenue', header: 'S1_question', type: 'categorical' },
  { key: 'S1_role', header: 'S1_question', type: 'categorical' },
  { key: 'S1_other2', header: 'S1_question', type: 'text' },
  { key: 'S1_title', header: 'S1_question', type: 'categorical' },
  { key: 'S1_numeric', header: 'S1_question', type: 'categorical' },
];

const COUNTRIES = [
  'India', 'China', 'United States', 'Brazil', 'Nigeria', 'Indonesia',
  'Pakistan', 'Bangladesh', 'Russia', 'Mexico', 'Japan', 'Philippines',
];

const EMPLOYEE_BANDS = [
  '2 to 99', '100 to 199', '200 to 299', '300 to 399', '400 to 499',
  '500 to 599', '600 to 699', '700 to 799', '800 to 899', '900 to 999',
  '1000 to 1099', '1100 to 1199',
];

const REVENUE_BANDS = [
  '< $1M', '$1M - $5M', '$5M - $10M', '$10M - $20M', '$20M - $50M',
  '$50M - $100M', '$100M - $250M', '$250M - $500M', '$500M - $1B',
  '$1B - $2B', '$2B - $5B', '> $5B',
];

const ROLES = [
  'C-Level', 'Advertising', 'Marketing', 'Public Relations', 'Social Media',
  'Content Marketing', 'Brand Development', 'SEO Optimization',
  'Email Campaigns', 'Event Planning', 'Market Research', 'Influencer Relations',
];

const TITLES = ['President', 'Vice President'];

export interface GridRow {
  respid: string;
  values: Record<string, GridCell>;
}

export const GRID_ROWS: GridRow[] = COUNTRIES.map((country, i) => ({
  respid: String(1001 + i),
  values: {
    LOISec: { label: '' },
    status: { label: '' },
    Comments: { label: '' },
    S1_country: { label: country },
    S1_other: { label: '' },
    S1_employees: { code: i + 1, label: EMPLOYEE_BANDS[i] ?? '' },
    S1_revenue: { code: i + 1, label: REVENUE_BANDS[i] ?? '' },
    S1_role: { code: i + 1, label: ROLES[i] ?? '' },
    S1_other2: { label: '' },
    S1_title: { code: i < 6 ? 1 : 2, label: i < 6 ? TITLES[0]! : TITLES[1]! },
    S1_numeric: i === 0 ? { label: '100.0' } : { label: '' },
  },
}));