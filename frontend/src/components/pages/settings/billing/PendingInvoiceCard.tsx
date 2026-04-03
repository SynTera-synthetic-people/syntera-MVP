import React from 'react';
import { TbCalendar } from 'react-icons/tb';
import './PendingInvoiceCardStyle.css';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'Pending' | 'Overdue';

export interface PendingInvoice {
  id: string;
  title: string;
  poReference: string;
  invoiceNo: string;
  issuedDate: string;
  dueDate: string;
  amount: string;
  status: InvoiceStatus;
}

interface PendingInvoiceCardProps {
  invoice: PendingInvoice;
  onMakePayment: (invoice: PendingInvoice) => void;
  isPaying?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

const PendingInvoiceCard: React.FC<PendingInvoiceCardProps> = ({
  invoice,
  onMakePayment,
  isPaying = false,
}) => {
  return (
    <div className="pic-card">
      {/* Status badge */}
      <span className={`pic-status-badge pic-status-badge--${invoice.status.toLowerCase()}`}>
        {invoice.status}
      </span>

      {/* Title */}
      <h3 className="pic-title">{invoice.title}</h3>

      {/* PO Reference + Invoice No */}
      <div className="pic-meta-grid">
        <div className="pic-meta-item">
          <span className="pic-meta-label">PO Reference</span>
          <span className="pic-meta-value">{invoice.poReference}</span>
        </div>
        <div className="pic-meta-item">
          <span className="pic-meta-label">Invoice No.</span>
          <span className="pic-meta-value">{invoice.invoiceNo}</span>
        </div>
      </div>

      {/* Dates */}
      <div className="pic-meta-grid">
        <div className="pic-meta-item">
          <span className="pic-meta-label">
            <TbCalendar size={12} className="pic-cal-icon" />
            Issued Date
          </span>
          <span className="pic-meta-value">{invoice.issuedDate}</span>
        </div>
        <div className="pic-meta-item">
          <span className="pic-meta-label">
            <TbCalendar size={12} className="pic-cal-icon" />
            Due Date
          </span>
          <span className="pic-meta-value">{invoice.dueDate}</span>
        </div>
      </div>

      <div className="pic-divider" />

      {/* Amount */}
      <div className="pic-amount-row">
        <span className="pic-amount-label">Amount</span>
        <span className="pic-amount-value">{invoice.amount}</span>
      </div>

      {/* CTA */}
      <button
        className="pic-pay-btn"
        onClick={() => onMakePayment(invoice)}
        disabled={isPaying}
      >
        {isPaying ? 'Processing…' : 'Make Payment'}
      </button>
    </div>
  );
};

export default PendingInvoiceCard;