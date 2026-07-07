import React from 'react';
import '../DataPlayground.css';

const InsightsSummary: React.FC = () => (
  <div className="dp-content-area">
    <div className="dp-content-scroll">
      <div className="dp-report">
        <h3 className="dp-report-title">Title of the report</h3>

        <p className="dp-report-paragraph">
          Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has
          been the industry's standard dummy text ever since the 1500s, when an unknown printer took
          a galley of type and scrambled it to make a type specimen book. It has survived not only
          five centuries, but also the leap into electronic typesetting, remaining essentially
          unchanged. It was popularised in the 1960s with the release of Letraset sheets containing
          Lorem Ipsum passages, and more recently with desktop publishing software like Aldus
          PageMaker including versions of Lorem Ipsum.
        </p>

        <ul className="dp-report-list">
          <li>Lorem Ipsum is simply dummy text of the printing and typesetting industry.</li>
          <li>
            Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an
            unknown printer took a galley of type and scrambled it to make a type specimen book.
          </li>
          <li>It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged.</li>
          <li>
            It was popularised in the 1960s with the release of Letraset sheets containing Lorem
            Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker
            including versions of Lorem Ipsum.
          </li>
        </ul>
      </div>
    </div>
  </div>
);

export default InsightsSummary;