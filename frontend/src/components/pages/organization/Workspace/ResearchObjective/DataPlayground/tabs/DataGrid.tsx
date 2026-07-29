import React, { useState } from 'react';
import '../DataPlayground.css';
import EmptyState from '../EmptyState';
import { useDatasetRows } from '../../../../../../../hooks/useDataPlaygroundQueries';
import { extractErrorMessage } from '../../../../../../../services/dataPlaygroundService';

// Shared respondent-level grid backing both Coded Data (mode="coded", cells
// render "<code> = <label>") and Labelled Data (mode="labelled", label
// only — the backend always omits code in this mode, so the two modes
// naturally render differently just from what comes back over the wire).

interface DataGridProps {
  workspaceId?: string;
  explorationId?: string;
  datasetId?: string | null;
  active: boolean;
  mode: 'coded' | 'labelled';
}

function typeHint(type: string): string {
  if (type === 'identifier') return '(Not Defined)';
  if (type === 'open_text') return '(text)';
  return '';
}

const DataGrid: React.FC<DataGridProps> = ({ workspaceId, explorationId, datasetId, active, mode }) => {
  const [page, setPage] = useState(1);
  const query = useDatasetRows(workspaceId, explorationId, datasetId, mode, page, active);

  if (!datasetId) {
    return (
      <div className="dp-data-full-bleed">
        <EmptyState title="No dataset yet" subtitle="Upload a CSV or XLSX file to get started" />
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="dp-data-full-bleed">
        <EmptyState title="Loading data..." subtitle="This will only take a moment" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="dp-data-full-bleed">
        <EmptyState
          title="Couldn't load data"
          subtitle={extractErrorMessage(query.error, 'Something went wrong — please try again')}
        />
      </div>
    );
  }

  const data = query.data;
  if (!data || data.rows.length === 0) {
    return (
      <div className="dp-data-full-bleed">
        <EmptyState title="No rows" subtitle="This dataset has no respondent rows" />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total_rows / data.page_size));

  return (
    <div className="dp-data-full-bleed">
      <div className="dp-data-table-wrap">
        <table className="dp-data-table">
          <thead>
            <tr>
              {data.columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
            <tr className="dp-data-subrow">
              {data.columns.map((col) => (
                <td key={col.key}>{typeHint(col.type)}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.respid}>
                <td>{row.respid}</td>
                {data.columns.slice(1).map((col) => {
                  const cell = row.values[col.key];
                  if (!cell || cell.label === '') return <td key={col.key} />;
                  return (
                    <td key={col.key}>
                      {cell.code != null ? `${cell.code} = ${cell.label}` : cell.label}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="dp-data-pager">
          <button
            className="dp-data-pager-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Prev
          </button>
          <span className="dp-data-pager-label">
            Page {data.page} of {totalPages} ({data.total_rows} rows)
          </span>
          <button
            className="dp-data-pager-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default DataGrid;
