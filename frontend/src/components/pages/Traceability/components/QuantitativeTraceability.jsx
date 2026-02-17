import React from 'react';
import TraceabilityScore from './TraceabilityScore';
import AuditTable from './AuditTable';
import {
  TbTargetArrow,
  TbLayoutDashboard,
  TbScale,
  TbBulb,
  TbUsers
} from 'react-icons/tb';

const CoreDesignAnchorsTable = () => {
  const columns = [
    {
      header: 'Core Anchor',
      accessor: 'anchor',
      className: 'w-1/4',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.icon}
          <span className="font-bold text-blue-900 dark:text-blue-100 text-sm">
            {row.anchor}
          </span>
        </div>
      )
    },
    {
      header: 'Definition & Rationale',
      accessor: 'definition',
      className: 'w-2/3',
      render: (row) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.definition}
        </span>
      )
    },
    {
      header: 'Weight',
      accessor: 'weight',
      className: 'w-24 text-center',
      render: (row) => (
        <div className="flex justify-center">
          <span className="font-bold text-green-600 dark:text-green-400 text-sm">
            {row.weight}
          </span>
        </div>
      )
    }
  ];

  const data = [
    {
      icon: <TbTargetArrow className="w-5 h-5 text-blue-500 dark:text-blue-400" />,
      anchor: "Objective Alignment",
      definition: "Every question serves a testable hypothesis or business decision, not just data collection.",
      weight: "25%"
    },
    {
      icon: <TbLayoutDashboard className="w-5 h-5 text-blue-500 dark:text-blue-400" />,
      anchor: "Thematic Integration",
      definition: "Captures 8 qualitative themes: Context, Behavior, Attitudes, Emotions, Motivations, Barriers, Scenarios, Identity.",
      weight: "20%"
    },
    {
      icon: <TbScale className="w-5 h-5 text-blue-500 dark:text-blue-400" />,
      anchor: "Methodological Rigor",
      definition: "Proper scales, unbiased wording, validated constructs. Statistical analysis-ready.",
      weight: "25%"
    },
    {
      icon: <TbBulb className="w-5 h-5 text-blue-500 dark:text-blue-400" />,
      anchor: "Hypothesis Architecture",
      definition: "Each hypothesis has primary test question + 2-3 validation questions + moderating variables.",
      weight: "20%"
    },
    {
      icon: <TbUsers className="w-5 h-5 text-blue-500 dark:text-blue-400" />,
      anchor: "Respondent Optimization",
      definition: "Minimizes cognitive load, fatigue, and bias. Efficient question count with strategic depth.",
      weight: "10%"
    }
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-2xl font-black text-blue-500 dark:text-blue-400 uppercase tracking-wide">
          SECTION 1: CORE DESIGN ANCHORS
        </h3>
        <p className="text-gray-500 dark:text-gray-400 italic text-sm">
          Foundational principles bridging quantitative rigor with qualitative depth
        </p>
      </div>

      <AuditTable
        columns={columns}
        data={data}
        loading={false}
        emptyMessage="No core anchors defined"
      />
    </div>
  );
};

const DecisionIntelligenceFrameworkTable = () => {
  const columns = [
    {
      header: 'Hypothesis Type',
      accessor: 'type',
      className: 'w-1/3',
      render: (row) => (
        <span className="font-bold text-blue-900 dark:text-blue-100 text-sm">
          {row.type}
        </span>
      )
    },
    {
      header: 'Statistical Test',
      accessor: 'test',
      className: 'w-1/4 text-center',
      render: (row) => (
        <div className="flex justify-center">
          <span className="font-bold text-red-500 dark:text-red-300 text-sm">
            {row.test}
          </span>
        </div>
      )
    },
    {
      header: 'Required Question Design',
      accessor: 'design',
      className: 'w-5/12',
      render: (row) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.design}
        </span>
      )
    }
  ];

  const data = [
    {
      type: "H₁: Segment Difference",
      test: "ANOVA / t-test",
      design: "Scaled comparisons across demographic/behavioral segments"
    },
    {
      type: "H₂: Driver Correlation",
      test: "Pearson / Regression",
      design: "Importance ratings + outcome measures (e.g., purchase intent)"
    },
    {
      type: "H₃: Barrier Identification",
      test: "MaxDiff / Importance",
      design: "Barrier multi-select + severity ratings + ranking"
    }
  ];

  return (
    <div className="space-y-4 pt-8">
      <div>
        <h3 className="text-2xl font-black text-blue-500 dark:text-blue-400 uppercase tracking-wide">
          SECTION 2: DECISION INTELLIGENCE FRAMEWORK
        </h3>
        <p className="text-gray-500 dark:text-gray-400 italic text-sm">
          Hypothesis-driven design for statistically testable business decisions
        </p>
      </div>

      <AuditTable
        columns={columns}
        data={data}
        loading={false}
        emptyMessage="No framework defined"
      />
    </div>
  );
};

const QualityScoringFrameworkTable = ({ scores = [] }) => {
  const columns = [
    {
      header: 'Quality Dimension',
      accessor: 'dimension',
      className: 'w-1/4',
      render: (row) => (
        <span className="font-bold text-blue-900 dark:text-blue-100 text-sm">
          {row.dimension}
        </span>
      )
    },
    {
      header: 'Score',
      accessor: 'score',
      className: 'w-24 text-center',
      render: (row) => (
        <div className="flex justify-center">
          <span className="font-bold text-green-600 dark:text-green-400 text-sm">
            {row.score}/100
          </span>
        </div>
      )
    },
    {
      header: 'Justification Rationale',
      accessor: 'justification',
      className: 'w-1/2',
      wrap: true,
      render: (row) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.justification}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-4 pt-8">
      <div>
        <h3 className="text-2xl font-black text-blue-500 dark:text-blue-400 uppercase tracking-wide">
          SECTION 3: QUALITY SCORING FRAMEWORK
        </h3>
        <p className="text-gray-500 dark:text-gray-400 italic text-sm">
          Multi-dimensional evaluation system for research excellence
        </p>
      </div>

      <AuditTable
        columns={columns}
        data={scores}
        loading={false}
        emptyMessage="No quality scores available"
      />
    </div>
  );
};

const getScoreLabel = (score) => {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'ACCEPTABLE';
  return 'POOR';
};

const QuantitativeTraceability = ({ data = {} }) => {
  const { quality_scores = [], overall_score = 0 } = data;

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700 max-w-5xl mx-auto pb-12">
      <CoreDesignAnchorsTable />
      <DecisionIntelligenceFrameworkTable />

      <QualityScoringFrameworkTable scores={quality_scores} />

      <div className="max-w-2xl mx-auto w-full mt-4">
        <TraceabilityScore
          title="Overall Quality Score"
          score={overall_score / 100}
          percentage={overall_score}
          label={getScoreLabel(overall_score)}
          description="Aggregated score based on all quality dimensions"
          breakdown={[]}
        />
      </div>
    </div>
  );
};

export default QuantitativeTraceability;
