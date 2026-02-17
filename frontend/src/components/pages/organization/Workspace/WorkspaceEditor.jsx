// workspace/WorkspaceEditor.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUpdateWorkspace } from '../../../../hooks/useWorkspaces';
import PremiumButton from '../../../common/PremiumButton';
import { motion } from 'framer-motion';
import { TbEdit, TbArrowLeft } from 'react-icons/tb';

const WorkspaceEditor = ({ workspace, onBack, onWorkspaceUpdated }) => {
  const navigate = useNavigate();
  const updateMutation = useUpdateWorkspace();

  const [formData, setFormData] = useState({
    name: workspace?.name || workspace?.title || '',
    description: workspace?.description || '',
    department_name: workspace?.department_name || workspace?.departmentName || workspace?.department || ''
  });

  React.useEffect(() => {
    const getField = (obj, keys) => {
      if (!obj) return '';
      for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) return obj[key];
      }
      if (obj.data) return getField(obj.data, keys);
      return '';
    };

    if (workspace) {
      console.log('DEBUG: Workspace object keys:', Object.keys(workspace));
      console.log('DEBUG: Workspace stringified:', JSON.stringify(workspace));

      setFormData({
        name: getField(workspace, ['name', 'title']),
        description: getField(workspace, ['description']),
        department_name: getField(workspace, ['department_name', 'departmentName', 'department', 'dept_name', 'dept'])
      });
    }
  }, [workspace]);

  const [errors, setErrors] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);

  if (!workspace) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleUpdate = async () => {
    // Basic validation
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Workspace name is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: workspace.id,
        data: {
          name: formData.name,
          description: formData.description,
          department_name: formData.department_name
        }
      });

      // Notify parent component
      if (onWorkspaceUpdated) {
        onWorkspaceUpdated({
          ...workspace,
          ...formData
        });
      }

      // Show success message (you could add a toast notification here)
      alert('Workspace updated successfully!');

    } catch (error) {
      setErrors({
        api: error.response?.data?.message || 'Failed to update workspace'
      });
    }
  };


  return (
    <div className="max-w-full mx-auto relative z-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
            <TbEdit className="w-6 h-6" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
            Edit Workspace
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400 ml-16">
          Update your workspace details and configuration
        </p>
      </motion.div>

      {/* Error Message */}
      {errors.api && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl mb-6 text-sm"
        >
          {errors.api}
        </motion.div>
      )}

      {/* Form Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-lg"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Workspace Name *
            </label>
            <input
              type='text'
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full px-4 py-3 rounded-xl border-2 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 transition-all outline-none ${errors.name
                ? 'border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400'
                : 'border-gray-300 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-400'
                }`}
              placeholder="Enter workspace name"
            />
            {errors.name && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Department Name
            </label>
            <input
              type='text'
              name="department_name"
              value={formData.department_name}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 transition-all outline-none"
              placeholder="Enter department name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className='w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 transition-all outline-none'
              placeholder="Describe your workspace"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end items-center pt-6 border-t border-gray-300/60 dark:border-white/10">
            <div className='flex gap-3'>
              <PremiumButton
                type="button"
                variant="secondary"
                onClick={onBack}
                disabled={updateMutation.isLoading || isDeleting}
              >
                Cancel
              </PremiumButton>
              <PremiumButton
                onClick={handleUpdate}
                variant="primary"
                className="flex items-center gap-2"
                disabled={updateMutation.isLoading || isDeleting}
              >
                {updateMutation.isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Updating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Update Workspace
                  </>
                )}
              </PremiumButton>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default WorkspaceEditor;