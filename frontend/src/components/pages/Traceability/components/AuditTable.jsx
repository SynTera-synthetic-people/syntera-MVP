import React from 'react';
import { motion } from 'framer-motion';
import { TbInfoCircle } from 'react-icons/tb';

const AuditTable = ({ columns, data, loading, emptyMessage = "No audit logs found" }) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 dark:text-gray-400 animate-pulse font-bold text-xs uppercase tracking-widest">Loading audit trail...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16 px-4 bg-white/50 dark:bg-white/5 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 backdrop-blur-xl">
        <TbInfoCircle className="w-12 h-12 text-gray-400 mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
          {emptyMessage}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-widest">
          Everything looks clear for now.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden relative group"
    >
      {/* Decorative top border gradient */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 transition-colors">
              {columns.map((column, idx) => (
                <th
                  key={idx}
                  className={`px-6 py-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.4em] ${column.className || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/10">
            {data.map((row, rowIdx) => (
              <motion.tr
                key={rowIdx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: rowIdx * 0.03 }}
                className="hover:bg-gray-50/50 dark:hover:bg-white/10 transition-colors group/row"
              >
                {columns.map((column, colIdx) => (
                  <td
                    key={colIdx}
                    className={`px-6 py-5 text-sm font-medium text-gray-700 dark:text-gray-300 ${column.wrap ? 'whitespace-normal' : 'whitespace-nowrap'} ${column.className || ''}`}
                  >
                    {column.render ? column.render(row) : row[column.accessor]}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

export default AuditTable;
