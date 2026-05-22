import React from 'react';
import { TbEdit } from 'react-icons/tb';
import './CompactHeader.css';

interface SelectedPersona {
  id: string;
  name: string;
}

interface SampleSizes {
  [personaId: string]: number;
}

interface CompactHeaderProps {
  selectedPersonas: SelectedPersona[];
  sampleSizes: SampleSizes;
  simulationResult: any;
  onEditConfiguration: () => void;
}

const CompactHeader: React.FC<CompactHeaderProps> = ({
  selectedPersonas,
  sampleSizes,
  simulationResult,
  onEditConfiguration,
}) => {
  const totalParticipants = Object.values(sampleSizes).reduce((sum, size) => sum + size, 0);

  return (
    <div className="ch-root">
      <div className="ch-left">
        <div className="ch-group">
          <span className="ch-group__label">Personas</span>
          <div className="ch-tags">
            {selectedPersonas.slice(0, 2).map((persona) => (
              <span key={persona.id} className="ch-tag ch-tag--blue">
                {persona.name}
              </span>
            ))}
            {selectedPersonas.length > 2 && (
              <span className="ch-tag ch-tag--blue">+{selectedPersonas.length - 2} more</span>
            )}
          </div>
        </div>

        <div className="ch-divider" />

        <div className="ch-group">
          <span className="ch-group__label">Total Sample</span>
          <span className="ch-tag ch-tag--blue">{totalParticipants} Participants</span>
        </div>

        {simulationResult && (
          <>
            <div className="ch-divider" />
            <div className="ch-group">
              <span className="ch-group__label">Confidence Score</span>
              <span className="ch-tag ch-tag--green">{simulationResult.weighted_score}%</span>
            </div>
          </>
        )}
      </div>

      <button className="ch-edit-btn" onClick={onEditConfiguration}>
        <TbEdit size={14} />
        Edit Configuration
      </button>
    </div>
  );
};

export default CompactHeader;