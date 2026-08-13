import React from 'react';
import DataGrid from './DataGrid';

interface LabelledDataProps {
  workspaceId?: string;
  explorationId?: string;
  datasetId?: string | null;
  active: boolean;
}

const LabelledData: React.FC<LabelledDataProps> = (props) => <DataGrid {...props} mode="labelled" />;

export default LabelledData;
