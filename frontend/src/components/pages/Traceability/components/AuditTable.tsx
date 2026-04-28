import React from 'react';
import type {ReactNode} from 'react';
import '../Traceability.css';

export interface AuditColumn<T = Record<string, unknown>> {
  header: string;
  accessor: string;
  className?: string;
  wrap?: boolean;
  render?: (row: T) => ReactNode;
}

interface AuditTableProps<T = Record<string, unknown>> {
  columns: AuditColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
}

function AuditTable<T = Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No audit logs found',
}: AuditTableProps<T>): React.ReactElement {
  if (loading) {
    return (
      <div className="trc-loading">
        <div className="trc-spinner" />
        <span style={{ color: '#6b7280', fontSize: 13 }}>Loading audit trail...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <div className="trc-empty">{emptyMessage}</div>;
  }

  return (
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={col.className || ''}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {columns.map((col, colIdx) => (
                <td
                  key={colIdx}
                  className={col.className || ''}
                  style={col.wrap ? { whiteSpace: 'normal' } : undefined}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.accessor] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AuditTable;
