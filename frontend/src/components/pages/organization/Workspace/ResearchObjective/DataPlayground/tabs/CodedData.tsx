import React from 'react';
import DataGrid from './DataGrid';

interface CodedDataProps {
  workspaceId?: string;
  explorationId?: string;
  datasetId?: string | null;
  active: boolean;
}

const CodedData: React.FC<CodedDataProps> = (props) => <DataGrid {...props} mode="coded" />;

export default CodedData;
