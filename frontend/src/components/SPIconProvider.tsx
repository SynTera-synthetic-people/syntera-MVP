// ════════════════════════════════════════════════════════════════════════════
// SpIconProvider — injects the SVG sprite into the DOM once at app root
// Place <SpIconProvider /> near the top of your app, e.g. in main.tsx or App.tsx
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef } from 'react';
import spriteSrc from './sp-icon-sprite.svg?raw';

const SpIconProvider: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = spriteSrc;
    }
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ display: 'none', position: 'absolute' }}
    />
  );
};

export default SpIconProvider;