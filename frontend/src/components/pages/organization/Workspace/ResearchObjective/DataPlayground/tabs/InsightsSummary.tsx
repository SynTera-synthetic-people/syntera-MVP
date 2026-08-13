import React from 'react';
import '../DataPlayground.css';
import EmptyState from '../EmptyState';
import { useRunInsights } from '../../../../../../../hooks/useDataPlaygroundQueries';
import { extractErrorMessage } from '../../../../../../../services/dataPlaygroundService';

interface InsightsSummaryProps {
  workspaceId?: string;
  explorationId?: string;
  datasetId?: string | null;
  active: boolean;
}

const InsightsSummary: React.FC<InsightsSummaryProps> = ({
  workspaceId,
  explorationId,
  datasetId,
  active,
}) => {
  const query = useRunInsights(workspaceId, explorationId, datasetId, active);

  let body: React.ReactNode;

  if (!datasetId) {
    body = <EmptyState title="No dataset yet" subtitle="Upload a CSV or XLSX file to get started" />;
  } else if (query.isLoading) {
    body = <EmptyState title="Generating insights..." subtitle="This will only take a moment" />;
  } else if (query.isError) {
    body = (
      <EmptyState
        title="Couldn't generate insights"
        subtitle={extractErrorMessage(query.error, 'Something went wrong — please try again')}
      />
    );
  } else if (query.data) {
    const { title, summary, key_patterns, anomalies } = query.data;
    body = (
      <div className="dp-report">
        <h3 className="dp-report-title">{title}</h3>
        <p className="dp-report-paragraph">{summary}</p>

        {key_patterns.length > 0 && (
          <>
            <h4 className="dp-report-subtitle">Key Patterns</h4>
            <ul className="dp-report-list">
              {key_patterns.map((pattern, i) => (
                <li key={i}>{pattern}</li>
              ))}
            </ul>
          </>
        )}

        {anomalies.length > 0 && (
          <>
            <h4 className="dp-report-subtitle">Anomalies</h4>
            <ul className="dp-report-list">
              {anomalies.map((anomaly, i) => (
                <li key={i}>{anomaly}</li>
              ))}
            </ul>
          </>
        )}

        {key_patterns.length === 0 && anomalies.length === 0 && (
          <p className="dp-report-paragraph">No notable patterns or anomalies were found in this dataset.</p>
        )}
      </div>
    );
  } else {
    body = <EmptyState />;
  }

  return <div className="dp-report-zone">{body}</div>;
};

export default InsightsSummary;
