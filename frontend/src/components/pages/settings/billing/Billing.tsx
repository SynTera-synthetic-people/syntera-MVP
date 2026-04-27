import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  TbCheck,
  TbX,
  TbInfoCircle,
  TbChevronDown,
} from 'react-icons/tb';
import SpIcon from '../../../SPIcon';
import { useSelector } from 'react-redux';
import { ShareInvoiceModal, HowBillingWorksModal, SubmitQueryModal } from '../SettingModal';
import './BillingStyle.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartFilter = 'Monthly' | 'Yearly';

export type BillingView = 'billing' | 'invoice';

interface Invoice {
  id: string;
  poReference: string;
  title: string;
  invoiceNo: string;
  issuedOn: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  completedOn: string;
  amount: string;
  receiptUrl?: string;
}

interface RootState {
  auth: {
    user: {
      is_trial?: boolean;
      account_tier?: string;
      is_admin?: boolean;
      role?: string;
    } | null;
  };
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const MONTHLY_DATA: [number, number][] = [
  [60, 20], [75, 18], [90, 22], [55, 15], [160, 40], [100, 30],
  [70, 20], [65, 18], [80, 22], [95, 25], [110, 30], [145, 35],
];

const YEARLY_DATA: [number, number][] = [
  [600, 200], [750, 180], [900, 220], [550, 150], [1600, 400], [1000, 300],
  [700, 200], [650, 180], [800, 220], [950, 250], [1100, 300], [1450, 350],
];

const MOCK_INVOICES: Invoice[] = [
  {
    id: 'i1', poReference: '123456789...', title: 'Consumer...',
    invoiceNo: '123456789...', issuedOn: '23 Jan 2026',
    status: 'Paid', completedOn: '23 Jan 2026', amount: '$0000', receiptUrl: '#',
  },
  {
    id: 'i2', poReference: '987654321...', title: 'Enterprise research...',
    invoiceNo: '987654321...', issuedOn: '10 Feb 2026',
    status: 'Pending', completedOn: '—', amount: '$1,500',
  },
  {
    id: 'i3', poReference: '112233445...', title: 'Market analysis...',
    invoiceNo: '112233445...', issuedOn: '5 Mar 2026',
    status: 'Overdue', completedOn: '—', amount: '$3,200',
  },
];

const AVAILABLE_MONTHS = [
  'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026',
  'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026',
];

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  tooltip: string;
  value: string;
  sub: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, tooltip, value, sub }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="bl-stat-card-inner">
      <div className="bl-stat-label-row">
        <span className="bl-stat-label">{label}</span>
        <div
          className="bl-stat-info"
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
        >
          <TbInfoCircle size={14} />
          {show && <div className="bl-stat-tooltip">{tooltip}</div>}
        </div>
      </div>
      <div className="bl-stat-value">{value}</div>
      <div className="bl-stat-sub">{sub}</div>
    </div>
  );
};

// ── Month Dropdown ────────────────────────────────────────────────────────────

const MonthDropdown: React.FC<{ selectedMonth: string; onMonthChange: (m: string) => void }> = ({
  selectedMonth, onMonthChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="bl-dropdown-wrap" ref={ref}>
      <button className="bl-dropdown-btn" onClick={() => setOpen(v => !v)}>
        {selectedMonth}
        <TbChevronDown size={13} className={`bl-dropdown-chevron ${open ? 'bl-dropdown-chevron--open' : ''}`} />
      </button>
      {open && (
        <div className="bl-dropdown-menu bl-dropdown-menu--right">
          {AVAILABLE_MONTHS.map(m => (
            <div
              key={m}
              className={`bl-dropdown-item ${selectedMonth === m ? 'bl-dropdown-item--active' : ''}`}
              onClick={() => { onMonthChange(m); setOpen(false); }}
            >
              {selectedMonth === m && <TbCheck size={13} />}{m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Filter Dropdown ───────────────────────────────────────────────────────────

const FilterDropdown: React.FC<{ chartFilter: ChartFilter; onFilterChange: (f: ChartFilter) => void }> = ({
  chartFilter, onFilterChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="bl-dropdown-wrap" ref={ref}>
      <button className="bl-dropdown-btn" onClick={() => setOpen(v => !v)}>
        {chartFilter}
        <TbChevronDown size={13} className={`bl-dropdown-chevron ${open ? 'bl-dropdown-chevron--open' : ''}`} />
      </button>
      {open && (
        <div className="bl-dropdown-menu bl-dropdown-menu--right">
          {(['Monthly', 'Yearly'] as ChartFilter[]).map(f => (
            <div
              key={f}
              className={`bl-dropdown-item ${chartFilter === f ? 'bl-dropdown-item--active' : ''}`}
              onClick={() => { onFilterChange(f); setOpen(false); }}
            >
              {chartFilter === f && <TbCheck size={13} />}{f}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Stacked Bar Chart ─────────────────────────────────────────────────────────

interface StackedBarChartProps {
  data: [number, number][];
  labels: string[];
}

const StackedBarChart: React.FC<StackedBarChartProps> = ({ data, labels }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [chartInfoShow, setChartInfoShow] = useState(false);
  const maxVal = Math.max(...data.map(([e, p]) => e + p), 1);

  return (
    <div className="bl-chart-section">
      <div className="bl-chart-header">
        <div className="bl-chart-title-row">
          <span className="bl-chart-title">Usage Overview</span>
          <div
            className="bl-stat-info"
            onMouseEnter={() => setChartInfoShow(true)}
            onMouseLeave={() => setChartInfoShow(false)}
            style={{ position: 'relative' }}
          >
            <TbInfoCircle size={14} />
            {chartInfoShow && (
              <div className="bl-stat-tooltip bl-stat-tooltip--chart">
                Monthly distribution of explorations and additional personas used.
              </div>
            )}
          </div>
        </div>
        <div className="bl-chart-legend">
          <span className="bl-legend-dot bl-legend-dot--explore" />
          <span className="bl-legend-label">Exploration</span>
          <span className="bl-legend-dot bl-legend-dot--persona" />
          <span className="bl-legend-label">Additional Personas</span>
        </div>
      </div>

      <div className="bl-chart-area">
        <div className="bl-bars">
          {data.map(([exploration, personas], i) => {
            const total = exploration + personas;
            const totalPct = (total / maxVal) * 100;
            const explorePct = (exploration / total) * 100;
            const personaPct = (personas / total) * 100;
            const isHovered = hoveredIdx === i;
            return (
              <div
                key={i}
                className="bl-bar-col"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {isHovered && (
                  <div className="bl-bar-tooltip">
                    <div className="bl-bar-tooltip-val">{total}</div>
                  </div>
                )}
                <div className="bl-stacked-bar" style={{ height: `${totalPct}%` }}>
                  <div className="bl-bar-segment bl-bar-segment--explore" style={{ height: `${explorePct}%` }} />
                  <div className="bl-bar-segment bl-bar-segment--persona" style={{ height: `${personaPct}%` }} />
                </div>
                <span className="bl-bar-label">{labels[i]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Status badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: Invoice['status'] }> = ({ status }) => (
  <span className={`bl-status-badge bl-status-badge--${status.toLowerCase()}`}>{status}</span>
);

// ── Invoice Table ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['All', 'Paid', 'Pending', 'Overdue'];

interface InvoiceTableProps {
  invoices: Invoice[];
  onShareInvoice: (invoice: Invoice) => void;
}

const InvoiceTable: React.FC<InvoiceTableProps> = ({ invoices, onShareInvoice }) => {
  const [statusFilter, setStatusFilter] = useState('All');
  const [nameFilter, setNameFilter] = useState('');
  const [search, setSearch] = useState('');
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const [nameDropOpen, setNameDropOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!statusRef.current?.contains(e.target as Node)) setStatusDropOpen(false);
      if (!nameRef.current?.contains(e.target as Node)) setNameDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      const matchStatus = statusFilter === 'All' || inv.status === statusFilter;
      const matchSearch = !q
        || inv.poReference.toLowerCase().includes(q)
        || inv.title.toLowerCase().includes(q)
        || inv.invoiceNo.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [invoices, statusFilter, search]);

  return (
    <div className="bl-invoices-section">
      <div className="bl-invoice-toolbar">
        <div className="bl-invoice-search-wrap">
          <SpIcon name="sp-Interface-Search_Magnifying_Glass" className="bl-invoice-search-icon" />
          <input
            type="text"
            className="bl-invoice-search-input"
            placeholder="Search by PO Reference, Invoice Name and Number"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="bl-filter-wrap" ref={statusRef}>
          <button
            className={`bl-filter-btn ${statusFilter !== 'All' ? 'bl-filter-btn--active' : ''}`}
            onClick={() => { setStatusDropOpen(v => !v); setNameDropOpen(false); }}
          >
            {statusFilter === 'All' ? 'Status' : statusFilter}
            <TbChevronDown size={13} className={`bl-dropdown-chevron ${statusDropOpen ? 'bl-dropdown-chevron--open' : ''}`} />
          </button>
          {statusDropOpen && (
            <div className="bl-dropdown-menu bl-dropdown-menu--right">
              {STATUS_OPTIONS.map(s => (
                <div
                  key={s}
                  className={`bl-dropdown-item ${statusFilter === s ? 'bl-dropdown-item--active' : ''}`}
                  onClick={() => { setStatusFilter(s); setStatusDropOpen(false); }}
                >
                  {statusFilter === s && <TbCheck size={13} />}
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bl-filter-wrap" ref={nameRef}>
          <button
            className="bl-filter-btn"
            onClick={() => { setNameDropOpen(v => !v); setStatusDropOpen(false); }}
          >
            Filter Name
            <TbChevronDown size={13} className={`bl-dropdown-chevron ${nameDropOpen ? 'bl-dropdown-chevron--open' : ''}`} />
          </button>
          {nameDropOpen && (
            <div className="bl-dropdown-menu bl-dropdown-menu--right">
              {['A → Z', 'Z → A', 'Newest', 'Oldest'].map(opt => (
                <div
                  key={opt}
                  className={`bl-dropdown-item ${nameFilter === opt ? 'bl-dropdown-item--active' : ''}`}
                  onClick={() => { setNameFilter(opt); setNameDropOpen(false); }}
                >
                  {nameFilter === opt && <TbCheck size={13} />}
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bl-table-card">
        <div className="bl-table-header">
          <div className="bl-hcell">PO REFERENCE</div>
          <div className="bl-hcell">TITLE</div>
          <div className="bl-hcell">INVOICE NO.</div>
          <div className="bl-hcell">ISSUED ON</div>
          <div className="bl-hcell">STATUS</div>
          <div className="bl-hcell">COMPLETED ON</div>
          <div className="bl-hcell">AMOUNT</div>
          <div className="bl-hcell bl-hcell--right">MANAGE</div>
        </div>
        <div className="bl-table-body">
          {filtered.length === 0 ? (
            <div className="bl-empty">No invoices match your search.</div>
          ) : (
            filtered.map(inv => (
              <div key={inv.id} className="bl-table-row">
                <div className="bl-cell bl-cell--mono">{inv.poReference}</div>
                <div className="bl-cell">{inv.title}</div>
                <div className="bl-cell bl-cell--mono">{inv.invoiceNo}</div>
                <div className="bl-cell bl-cell--muted">{inv.issuedOn}</div>
                <div className="bl-cell"><StatusBadge status={inv.status} /></div>
                <div className="bl-cell bl-cell--muted">{inv.completedOn}</div>
                <div className="bl-cell">{inv.amount}</div>
                <div className="bl-cell bl-cell--actions">
                  <button className="bl-action-btn" title="Download invoice">
                    <SpIcon name="sp-File-File_Download" />
                  </button>
                  <button className="bl-action-btn" title="Share invoice" onClick={() => onShareInvoice(inv)}>
                    <SpIcon name="sp-Communication-Share_iOS_Export" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ── Payment success toast ─────────────────────────────────────────────────────

const PaymentSuccessToast: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="bl-toast bl-toast--success">
    <TbCheck size={16} className="bl-toast-icon" />
    <span>Payment Successful</span>
    <button className="bl-toast-close" onClick={onClose} aria-label="Dismiss">
      <TbX size={14} />
    </button>
  </div>
);

// ── Main Billing component ────────────────────────────────────────────────────

interface BillingProps {
  view?: BillingView;
}

const Billing: React.FC<BillingProps> = ({ view = 'billing' }) => {
  const { user } = useSelector((state: RootState) => state.auth);

  // Chart state
  const [chartFilter, setChartFilter] = useState<ChartFilter>('Monthly');
  const [selectedMonth, setSelectedMonth] = useState('May 2026');
  const chartData = chartFilter === 'Monthly' ? MONTHLY_DATA : YEARLY_DATA;

  // Invoices
  const [invoices] = useState<Invoice[]>(MOCK_INVOICES);
  const [shareInvoice, setShareInvoice] = useState<Invoice | null>(null);

  // Modals
  const [showHowBilling, setShowHowBilling] = useState(false);
  const [showSubmitQuery, setShowSubmitQuery] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const triggerToast = () => {
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 4000);
  };

  // Invoice view
  if (view === 'invoice') {
    return (
      <div className="bl-page">
        {showSuccessToast && <PaymentSuccessToast onClose={() => setShowSuccessToast(false)} />}
        <InvoiceTable invoices={invoices} onShareInvoice={setShareInvoice} />
        <ShareInvoiceModal
          isOpen={shareInvoice !== null}
          onClose={() => setShareInvoice(null)}
          invoiceId={shareInvoice?.id ?? ''}
          invoiceTitle={shareInvoice?.title ?? ''}
          onSend={async () => { triggerToast(); }}
        />
      </div>
    );
  }

  // Billing overview view
  return (
    <div className="bl-page">
      {showSuccessToast && <PaymentSuccessToast onClose={() => setShowSuccessToast(false)} />}

      {/* ── Page title row ── */}
      <div className="bl-billing-header">
        <div className="bl-billing-title-row">
          <div className="bl-billing-title-left">
            <h2 className="bl-billing-title">Billing</h2>
            <button
              className="bl-how-billing-btn"
              onClick={() => setShowHowBilling(true)}
            >
              How billing works?
            </button>
          </div>
          <div className="bl-billing-header-dropdowns">
            <MonthDropdown selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
            <FilterDropdown chartFilter={chartFilter} onFilterChange={setChartFilter} />
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="bl-stat-cards">
        {/* Left card: Exploration + Personas */}
        <div className="bl-stat-card bl-stat-card--left">
          <StatCard
            label="Exploration Used"
            tooltip="Number of explorations executed in the selected billing period"
            value="200"
            sub="Resets on 1 Jan 2026"
          />
          <div className="bl-stat-divider" />
          <StatCard
            label="Additional Personas"
            tooltip="Personas added beyond the 4 included per exploration."
            value="24"
            sub="No Limit Billed as used"
          />
        </div>

        {/* Right card: Amount Payable */}
        {/* Right card: Amount Payable */}
        <div className="bl-stat-card bl-stat-card--payable">
          <div className="bl-payable-info">
            <div className="bl-stat-label-row">
              <span className="bl-stat-label">Amount Payable</span>
              <div className="bl-stat-info">
                <TbInfoCircle size={14} />
              </div>
            </div>
            <div className="bl-stat-value">$5,483</div>
            <div className="bl-stat-sub">Before Taxes</div>
          </div>
          <div className="bl-stat-actions">
            <button className="bl-download-invoice-btn">
              Download Invoice
              <SpIcon name="sp-File-File_Download" />
            </button>
            <button className="bl-share-invoice-btn">
              Share Invoice
              <SpIcon name="sp-Communication-Share_iOS_Export" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Stacked bar chart ── */}
      <StackedBarChart
        data={chartData}
        labels={MONTHS}
      />

      {/* ── Modals ── */}
      <HowBillingWorksModal
        isOpen={showHowBilling}
        onClose={() => setShowHowBilling(false)}
      />
      <SubmitQueryModal
        isOpen={showSubmitQuery}
        onClose={() => setShowSubmitQuery(false)}
        onSubmit={async (subject, description) => {
          await new Promise(r => setTimeout(r, 800));
          triggerToast();
        }}
      />
      <ShareInvoiceModal
        isOpen={shareInvoice !== null}
        onClose={() => setShareInvoice(null)}
        invoiceId={shareInvoice?.id ?? ''}
        invoiceTitle={shareInvoice?.title ?? ''}
        onSend={async () => { triggerToast(); }}
      />
    </div>
  );
};

export default Billing;