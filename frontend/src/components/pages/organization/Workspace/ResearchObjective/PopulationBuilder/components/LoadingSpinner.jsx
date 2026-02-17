import React from 'react';
import { TbLoader } from 'react-icons/tb';

const LoadingSpinner = () => {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <TbLoader className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
};

export default LoadingSpinner;