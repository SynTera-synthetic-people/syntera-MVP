import React from 'react';
import '../DataPlayground.css';
import { GRID_COLUMNS, GRID_ROWS } from './sampleGridData';

const LabelledData: React.FC = () => (
  <div className="dp-data-full-bleed">
    <div className="dp-data-table-wrap">
      <table className="dp-data-table">
        <thead>
          <tr>
            <th>respid</th>
            {GRID_COLUMNS.slice(1).map((col, i) => (
              <th key={`${col.key}-${i}`}>{col.header}</th>
            ))}
          </tr>
          <tr className="dp-data-subrow">
            <td>(Not Defined)</td>
            {GRID_COLUMNS.slice(1).map((col, i) => (
              <td key={`${col.key}-type-${i}`}>
                {col.type === 'text' ? '(text)' : ''}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRID_ROWS.map((row) => (
            <tr key={row.respid}>
              <td>{row.respid}</td>
              {GRID_COLUMNS.slice(1).map((col, i) => {
                const cell = row.values[col.key];
                if (!cell || cell.label === '') return <td key={i} />;
                // Labelled Data shows the human-readable label only — no
                // underlying numeric code — unlike the Coded Data tab.
                return <td key={i}>{cell.label}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default LabelledData;