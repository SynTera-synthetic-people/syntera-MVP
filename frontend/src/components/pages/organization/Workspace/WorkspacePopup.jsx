// src/components/Workspace/WorkspacePopup.jsx
import React, { useState } from "react";
import PremiumInput from "../../../common/PremiumInput";
import PremiumButton from "../../../common/PremiumButton";
import { validateWorkspace } from "../../../../utils/validation";
import { useCreateWorkspace } from "../../../../hooks/useWorkspaces";
import { useDispatch, useSelector } from "react-redux";
import { validateStart } from "../../../../redux/slices/omiSlice";
import { motion, AnimatePresence } from "framer-motion";
import { TbBriefcase, TbX } from "react-icons/tb";

const WorkspacePopup = ({ isOpen = true, onClose, onSuccess }) => {
  const createMutation = useCreateWorkspace();
  const loading = createMutation.isLoading;

  const [form, setForm] = useState({ title: "", description: "", department_name: "" });
  const [errors, setErrors] = useState({});

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
        description: form.description,
        department_name: form.department_name
      }
    }));

    const payload = {
      name: form.title,
      description: form.description,
      department_name: form.department_name
    };

    createMutation.mutate(payload, {
      onSuccess: (res) => {
        onSuccess?.(res.data);
        onClose();
      },
      onError: (error) => {
        setErrors(prev => ({
          ...prev,
          api: error.response?.data?.message || "Failed to create workspace"
        }));
      }
    });
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-lg"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 text-white">
                  <TbBriefcase className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Create Workspace
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Set up a new workspace to organize your research
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <TbX size={24} />
              </button>
            </div>

            {/* Form Content */}
            <div className="p-6">
              {/* Error Message */}
              {errors.api && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {errors.api}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Workspace Name
                  </label>
                  <PremiumInput
                    name="title"
                    value={form.title}
                    onChange={handleChange}
                    error={errors.title}
                    placeholder="An Overarching Theme – Product Name or Campaign or Project"
                    disabled={loading}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Department Name
                  </label>
                  <PremiumInput
                    name="department_name"
                    value={form.department_name}
                    onChange={handleChange}
                    error={errors.department_name}
                    placeholder="Enter department name (e.g., Marketing, Research)"
                    disabled={loading}
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
                    rows={3}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-3 pt-2">
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
                    onClick={handleCancel}
                    disabled={loading}
                  >
                    Cancel
                  </PremiumButton>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default WorkspacePopup;