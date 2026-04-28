import React from 'react';
import type {ReactNode} from 'react';
import '../Traceability.css';

interface TraceabilityInfoTableRow {
  icon?: ReactNode;
  metric: string;
  value: string | number;
  isDynamic?: boolean;
}

interface TraceabilityInfoTableProps {
  title: string;
  rows: TraceabilityInfoTableRow[];
}

const TraceabilityInfoTable: React.FC<TraceabilityInfoTableProps> = ({ title, rows }) => {
  return (
    <div style={{ marginTop: 24 }}>
      <h4 className="trc-section-title" style={{ marginBottom: 12 }}>{title}</h4>
      <div className="trc-table-wrap">
        <table className="trc-table">
          <thead className="trc-table-head">
            <tr>
              <th>Evidence Metric</th>
              <th style={{ textAlign: 'right' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {row.icon}
                    <span style={{ fontWeight: 600, color: '#fff' }}>{row.metric}</span>
                  </div>
                </td>
                <td style={{
                  textAlign: 'right',
                  fontWeight: 600,
                  color: row.isDynamic ? '#22c55e' : '#9ca3af',
                }}>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TraceabilityInfoTable;
