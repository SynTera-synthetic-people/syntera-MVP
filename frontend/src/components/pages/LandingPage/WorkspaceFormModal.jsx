import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbX, TbBriefcase } from 'react-icons/tb';
import PremiumInput from '../../common/PremiumInput';
import PremiumButton from '../../common/PremiumButton';
import { validateWorkspace } from '../../../utils/validation';
import { useCreateWorkspace } from '../../../hooks/useWorkspaces';
import { useDispatch, useSelector } from 'react-redux';
import { validateStart } from '../../../redux/slices/omiSlice';

const WorkspaceFormModal = ({ isOpen, onClose, onSuccess }) => {
  const createMutation = useCreateWorkspace();
  const dispatch = useDispatch();
  const { orgId } = useSelector(state => state.omi);
  const { user } = useSelector(state => state.auth);
  const { organizations } = useSelector((state) => state.organizations);

  const activeOrgId = organizations?.data?.id ||
    organizations?.organization_id ||
    orgId ||
    user?.organization_id ||
    user?.org_id ||
    "default-org";

  const [form, setForm] = useState({ title: '', description: '' });
  const [errors, setErrors] = useState({});
  const loading = createMutation.isLoading;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const validationErrors = validateWorkspace(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    dispatch(validateStart({
      orgId: activeOrgId,
      stage: "workspace_setup",
      data: {
        name: form.title,
        description: form.description
      }
    }));

    const payload = {
      name: form.title,
      description: form.description,
    };

    createMutation.mutate(payload, {
      onSuccess: (res) => {
        setForm({ title: '', description: '' });
        setErrors({});
        onSuccess(res.data);
      },
      onError: (error) => {
        setErrors(prev => ({
          ...prev,
          api: error.response?.data?.message || "Failed to create workspace"
        }));
      }
    });
  };

  const handleClose = () => {
    if (!loading) {
      setForm({ title: '', description: '' });
      setErrors({});
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-white dark:bg-[#0a0e1a] rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
                    <TbBriefcase className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Create Workspace
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Set up a new workspace to organize your research
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors disabled:opacity-50"
                >
                  <TbX className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {/* Error Message */}
              {errors.api && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-6 mt-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm"
                >
                  {errors.api}
                </motion.div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Workspace Title *
                  </label>
                  <PremiumInput
                    name="title"
                    value={form.title}
                    onChange={handleChange}
                    error={errors.title}
                    placeholder="An Overarching Theme – Product Name or Campaign or Project"
                    disabled={loading}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Describe the big research theme this workflow will cover – a cluster of related explorations around one problem, audience, or initiative."
                    rows={4}
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <PremiumButton
                    type="submit"
                    variant="primary"
                    className="flex-1"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating...
                      </span>
                    ) : (
                      "Create Workspace"
                    )}
                  </PremiumButton>
                  <PremiumButton
                    type="button"
                    variant="secondary"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    Cancel
                  </PremiumButton>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default WorkspaceFormModal;
