import React from 'react';

const TraceabilityInfoTable = ({ title, rows }) => {
  return (
    <div className="bg-[#1a1d24] rounded-xl border border-gray-800 overflow-hidden mt-8">
      <div className="px-6 py-4 border-b border-gray-800 bg-[#232730]">
        <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider">
          {title}
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-800 bg-blue-900/20">
              <th className="px-6 py-4 text-xs font-bold text-gray-300 uppercase tracking-wider w-1/2">
                Evidence Metric
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-300 uppercase tracking-wider text-center w-1/2 border-l border-gray-800">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {row.icon}
                    <span className="font-bold text-gray-200 text-sm">
                      {row.metric}
                    </span>
                  </div>
                </td>
                <td className={`px-6 py-4 text-center border-l border-gray-800 font-bold ${row.isDynamic ? 'text-green-400' : 'text-gray-400'}`}>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TraceabilityInfoTable;
