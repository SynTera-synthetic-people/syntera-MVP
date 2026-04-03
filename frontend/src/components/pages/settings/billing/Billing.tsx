import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  TbSearch,
  TbChevronDown,
  TbFileInvoice,
  TbDownload,
  TbShare,
  TbInfoCircle,
  TbCheck,
  TbX,
} from 'react-icons/tb';
import { useSelector } from 'react-redux';
import PendingInvoiceCard from './PendingInvoiceCard';
import type { PendingInvoice } from './PendingInvoiceCard';
import {ShareInvoiceModal} from '../SettingModal';
import './BillingStyle.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartFilter = 'Monthly' | 'Yearly';

interface Invoice {
  id: string;
  poReference: string;
  title: string;
  invoiceNo: string;
  issuedOn: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  completedOn: string;
  amount: string;
  receiptUrl?: string;          // populated for paid invoices
}

// ── NEW: read account tier from Redux to decide which table to render ─────────
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

// ── Mock data — replace with real API hooks when available ────────────────────

const MOCK_PENDING_INVOICES: PendingInvoice[] = [
  {
    id: 'inv-001',
    title: 'Consumer research',
    poReference: '1234567890',
    invoiceNo: '1234567890',
    issuedDate: '12 Dec 2026',
    dueDate: '12 Dec 2026',
    amount: '$1,23,456',
    status: 'Pending',
  },
];

// Monthly exploration counts — replace with useExplorations hook data
const MONTHLY_DATA: Record<ChartFilter, number[]> = {
  Monthly: [80, 95, 110, 70, 200, 130, 90, 85, 100, 120, 140, 190],
  Yearly:  [800, 950, 1100, 700, 2000, 1300, 900, 850, 1000, 1200, 1400, 1900],
};

const MONTH_LABELS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const MOCK_INVOICES: Invoice[] = [
  {
    id: 'i1',
    poReference: '123456789...',
    title: 'Consumer...',
    invoiceNo: '123456789...',
    issuedOn: '23 Jan 2026',
    status: 'Paid',
    completedOn: '23 Jan 2026',
    amount: '$0000',
    receiptUrl: '#',            // paid — receipt available
  },
  {
    id: 'i2',
    poReference: '987654321...',
    title: 'Enterprise research...',
    invoiceNo: '987654321...',
    issuedOn: '10 Feb 2026',
    status: 'Pending',
    completedOn: '—',
    amount: '$1,500',
  },
  {
    id: 'i3',
    poReference: '112233445...',
    title: 'Market analysis...',
    invoiceNo: '112233445...',
    issuedOn: '5 Mar 2026',
    status: 'Overdue',
    completedOn: '—',
    amount: '$3,200',
  },
];

// ── Bar chart ─────────────────────────────────────────────────────────────────

interface BarChartProps {
  data: number[];
  labels: string[];
  filter: ChartFilter;
  onFilterChange: (f: ChartFilter) => void;
}

const FILTERS: ChartFilter[] = ['Monthly', 'Yearly'];

const BarChart: React.FC<BarChartProps> = ({ data, labels, filter, onFilterChange }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const maxVal = Math.max(...data, 1);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="bl-chart-section">
      <div className="bl-chart-header">
        <span className="bl-chart-title">Total Number of Exploration</span>
        {/* Filter dropdown */}
        <div className="bl-dropdown-wrap" ref={dropRef}>
          <button
            className="bl-dropdown-btn"
            onClick={() => setDropOpen((v) => !v)}
          >
            {filter}
            <TbChevronDown
              size={13}
              className={`bl-dropdown-chevron ${dropOpen ? 'bl-dropdown-chevron--open' : ''}`}
            />
          </button>
          {dropOpen && (
            <div className="bl-dropdown-menu">
              {FILTERS.map((f) => (
                <div
                  key={f}
                  className={`bl-dropdown-item ${filter === f ? 'bl-dropdown-item--active' : ''}`}
                  onClick={() => { onFilterChange(f); setDropOpen(false); }}
                >
                  {filter === f && <TbCheck size={13} />}
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bl-chart-area">
        <div className="bl-bars">
          {data.map((val, i) => {
            const heightPct = (val / maxVal) * 100;
            const isHovered = hoveredIdx === i;
            return (
              <div
                key={i}
                className="bl-bar-col"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div className="bl-bar-tooltip">{val}</div>
                )}
                <div
                  className={`bl-bar ${isHovered ? 'bl-bar--hovered' : ''}`}
                  style={{ height: `${heightPct}%` }}
                />
                <span className="bl-bar-label">{labels[i]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Invoice status badge ──────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: Invoice['status'] }> = ({ status }) => (
  <span className={`bl-status-badge bl-status-badge--${status.toLowerCase()}`}>
    {status}
  </span>
);

// ── Invoice table — FULL (Enterprise / Admin) — unchanged from original ───────

interface InvoiceTableProps {
  invoices: Invoice[];
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
  nameFilter: string;
  onNameFilterChange: (n: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  onShareInvoice: (invoice: Invoice) => void;
}

const STATUS_OPTIONS = ['All', 'Paid', 'Pending', 'Overdue'];

const InvoiceTable: React.FC<InvoiceTableProps> = ({
  invoices, statusFilter, onStatusFilterChange,
  nameFilter, onNameFilterChange, search, onSearchChange,onShareInvoice,
}) => {
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const [nameDropOpen, setNameDropOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const nameRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!statusRef.current?.contains(e.target as Node)) setStatusDropOpen(false);
      if (!nameRef.current?.contains(e.target as Node))   setNameDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter((inv) => {
      const matchStatus = statusFilter === 'All' || inv.status === statusFilter;
      const matchSearch = !q || inv.poReference.toLowerCase().includes(q)
        || inv.title.toLowerCase().includes(q)
        || inv.invoiceNo.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [invoices, statusFilter, search]);

  return (
    <div className="bl-invoices-section">
      <h3 className="bl-invoices-title">Invoices</h3>

      {/* Toolbar */}
      <div className="bl-invoice-toolbar">
        {/* Search */}
        <div className="bl-invoice-search-wrap">
          <TbSearch size={14} className="bl-invoice-search-icon" />
          <input
            type="text"
            className="bl-invoice-search-input"
            placeholder="Search by PO Reference, Invoice Name and Number"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Status filter */}
        <div className="bl-filter-wrap" ref={statusRef}>
          <button
            className={`bl-filter-btn ${statusFilter !== 'All' ? 'bl-filter-btn--active' : ''}`}
            onClick={() => { setStatusDropOpen((v) => !v); setNameDropOpen(false); }}
          >
            {statusFilter === 'All' ? 'Status' : statusFilter}
            <TbChevronDown size={13} className={`bl-dropdown-chevron ${statusDropOpen ? 'bl-dropdown-chevron--open' : ''}`} />
          </button>
          {statusDropOpen && (
            <div className="bl-dropdown-menu bl-dropdown-menu--right">
              {STATUS_OPTIONS.map((s) => (
                <div
                  key={s}
                  className={`bl-dropdown-item ${statusFilter === s ? 'bl-dropdown-item--active' : ''}`}
                  onClick={() => { onStatusFilterChange(s); setStatusDropOpen(false); }}
                >
                  {statusFilter === s && <TbCheck size={13} />}
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filter Name */}
        <div className="bl-filter-wrap" ref={nameRef}>
          <button
            className="bl-filter-btn"
            onClick={() => { setNameDropOpen((v) => !v); setStatusDropOpen(false); }}
          >
            Filter Name
            <TbChevronDown size={13} className={`bl-dropdown-chevron ${nameDropOpen ? 'bl-dropdown-chevron--open' : ''}`} />
          </button>
          {nameDropOpen && (
            <div className="bl-dropdown-menu bl-dropdown-menu--right">
              {['A → Z', 'Z → A', 'Newest', 'Oldest'].map((opt) => (
                <div
                  key={opt}
                  className={`bl-dropdown-item ${nameFilter === opt ? 'bl-dropdown-item--active' : ''}`}
                  onClick={() => { onNameFilterChange(opt); setNameDropOpen(false); }}
                >
                  {nameFilter === opt && <TbCheck size={13} />}
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
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
            filtered.map((inv) => (
              <div key={inv.id} className="bl-table-row">
                <div className="bl-cell bl-cell--mono">{inv.poReference}</div>
                <div className="bl-cell">{inv.title}</div>
                <div className="bl-cell bl-cell--mono">{inv.invoiceNo}</div>
                <div className="bl-cell bl-cell--muted">{inv.issuedOn}</div>
                <div className="bl-cell">
                  <StatusBadge status={inv.status} />
                </div>
                <div className="bl-cell bl-cell--muted">{inv.completedOn}</div>
                <div className="bl-cell">{inv.amount}</div>
                <div className="bl-cell bl-cell--actions">
                  <button
                    className="bl-action-btn"
                    title="Download invoice"
                    onClick={() => {/* TODO: download */}}
                  >
                    <TbFileInvoice size={16} />
                  </button>
                  <button
                    className="bl-action-btn"
                    title="Share invoice"
                    onClick={() => onShareInvoice(inv)}
                  >
                    <TbShare size={16} />
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

// ── NEW: Invoice table — SIMPLE (Explorer / Free trial) ───────────────────────
// Columns: Invoice No. | Title | Payment Date | Receipt | Manage

interface SimpleInvoiceTableProps {
  invoices: Invoice[];
  search: string;
  onSearchChange: (s: string) => void;
  onShareInvoice: (invoice: Invoice) => void;
}

const SimpleInvoiceTable: React.FC<SimpleInvoiceTableProps> = ({
  invoices, search, onSearchChange, onShareInvoice,
}) => {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter((inv) =>
      !q
      || inv.invoiceNo.toLowerCase().includes(q)
      || inv.title.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  return (
    <div className="bl-invoices-section">
      <h3 className="bl-invoices-title">Invoices</h3>

      {/* Toolbar — search only, no PO/status filters needed */}
      <div className="bl-invoice-toolbar">
        <div className="bl-invoice-search-wrap">
          <TbSearch size={14} className="bl-invoice-search-icon" />
          <input
            type="text"
            className="bl-invoice-search-input"
            placeholder="Search by Invoice Name and Number"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bl-table-card">
        <div className="bl-table-header bl-table-header--simple">
          <div className="bl-hcell">INVOICE NO.</div>
          <div className="bl-hcell">TITLE</div>
          <div className="bl-hcell">PAYMENT DATE</div>
          <div className="bl-hcell">RECEIPT</div>
          <div className="bl-hcell bl-hcell--right">MANAGE</div>
        </div>

        <div className="bl-table-body">
          {filtered.length === 0 ? (
            <div className="bl-empty">No invoices match your search.</div>
          ) : (
            filtered.map((inv) => (
              <div key={inv.id} className="bl-table-row bl-table-row--simple">
                <div className="bl-cell bl-cell--mono">{inv.invoiceNo}</div>
                <div className="bl-cell">{inv.title}</div>
                {/* Payment Date: completedOn when paid, issuedOn otherwise */}
                <div className="bl-cell bl-cell--muted">
                  {inv.status === 'Paid' ? inv.completedOn : inv.issuedOn}
                </div>
                {/* Receipt: download link when paid, dash otherwise */}
                <div className="bl-cell">
                  {inv.receiptUrl ? (
                    <a
                      href={inv.receiptUrl}
                      className="bl-receipt-link"
                      download
                      title="Download receipt"
                    >
                      <TbDownload size={14} />
                      Download
                    </a>
                  ) : (
                    <span className="bl-cell--muted">—</span>
                  )}
                </div>
                <div className="bl-cell bl-cell--actions">
                  <button
                    className="bl-action-btn"
                    title="View invoice"
                    onClick={() => {/* TODO: view invoice */}}
                  >
                    <TbFileInvoice size={16} />
                  </button>
                  <button
                    className="bl-action-btn"
                    title="Share invoice"
                    onClick={() => onShareInvoice(inv)}
                  >
                    <TbShare size={16} />
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

interface ToastProps {
  onClose: () => void;
}

const PaymentSuccessToast: React.FC<ToastProps> = ({ onClose }) => (
  <div className="bl-toast bl-toast--success">
    <TbCheck size={16} className="bl-toast-icon" />
    <span>Payment Successful</span>
    <button className="bl-toast-close" onClick={onClose} aria-label="Dismiss">
      <TbX size={14} />
    </button>
  </div>
);

// ── Main Billing component ────────────────────────────────────────────────────

const Billing: React.FC = () => {
  // NEW: derive table mode from Redux user state
  const { user } = useSelector((state: RootState) => state.auth);
  const isAdmin        = user?.is_admin || (user?.role ?? '').toLowerCase().includes('admin');
  const tier           = user?.account_tier ?? '';
  // Enterprise + admin → full table; explorer + free(trial) → simple table
  const useSimpleTable = !isAdmin && tier !== 'enterprise';

  // Pending invoices from API — replace with real hook
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>(MOCK_PENDING_INVOICES);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Chart state
  const [chartFilter, setChartFilter] = useState<ChartFilter>('Monthly');
  const chartData = MONTHLY_DATA[chartFilter];

  // Invoice table state
  const [invoices] = useState<Invoice[]>(MOCK_INVOICES);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [nameFilter, setNameFilter] = useState('');

  // Share invoice modal
  const [shareInvoice, setShareInvoice] = useState<Invoice | null>(null);

  const handleMakePayment = async (invoice: PendingInvoice) => {
    setPayingId(invoice.id);
    try {
      // TODO: call payment API
      await new Promise((r) => setTimeout(r, 1200));
      // On success — remove from pending, show toast
      setPendingInvoices((prev) => prev.filter((inv) => inv.id !== invoice.id));
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 4000);
    } finally {
      setPayingId(null);
    }
  };

  const hasPending = pendingInvoices.length > 0;

  const handleSendInvoice = async (invoiceId: string, emails: string[]) => {
    // TODO: wire to actual share API
    await new Promise((r) => setTimeout(r, 800));
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 4000);
  };

  return (
    <div className="bl-page">

      {/* Success toast — fixed top-center */}
      {showSuccessToast && (
        <PaymentSuccessToast onClose={() => setShowSuccessToast(false)} />
      )}

      {/* ── Pending invoice cards ── */}
      {hasPending ? (
        <div className="bl-pending-row">
          {pendingInvoices.map((inv) => (
            <PendingInvoiceCard
              key={inv.id}
              invoice={inv}
              onMakePayment={handleMakePayment}
              isPaying={payingId === inv.id}
            />
          ))}
        </div>
      ) : (
        <div className="bl-no-pending">
          <TbInfoCircle size={15} className="bl-no-pending-icon" />
          No pending payment
        </div>
      )}

      {/* ── Bar chart — Total Number of Explorations ── */}
      <BarChart
        data={chartData}
        labels={MONTH_LABELS}
        filter={chartFilter}
        onFilterChange={setChartFilter}
      />

      {/*
        NEW: Invoice table switches based on user type:
        - Enterprise / Admin  → InvoiceTable      (PO Reference, Status, Amount…)
        - Explorer / Free     → SimpleInvoiceTable (Invoice No., Title, Payment Date, Receipt)
      */}
      {useSimpleTable ? (
        <SimpleInvoiceTable
          invoices={invoices}
          search={invoiceSearch}
          onSearchChange={setInvoiceSearch}
          onShareInvoice={setShareInvoice}
        />
      ) : (
        <InvoiceTable
          invoices={invoices}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          nameFilter={nameFilter}
          onNameFilterChange={setNameFilter}
          search={invoiceSearch}
          onSearchChange={setInvoiceSearch}
          onShareInvoice={setShareInvoice}
        />
      )}

      {/* Share Invoice modal */}
      <ShareInvoiceModal
        isOpen={shareInvoice !== null}
        onClose={() => setShareInvoice(null)}
        invoiceId={shareInvoice?.id ?? ''}
        invoiceTitle={shareInvoice?.title ?? ''}
        onSend={handleSendInvoice}
      />
    </div>
  );
};

export default Billing;