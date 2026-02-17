// src/pages/Workspace/WorkspaceForm.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PremiumInput from "../../../common/PremiumInput";
import PremiumButton from "../../../common/PremiumButton";
import { validateWorkspace } from "../../../../utils/validation";
import { useWorkspace, useCreateWorkspace, useUpdateWorkspace } from "../../../../hooks/useWorkspaces";
import { useDispatch, useSelector } from "react-redux";
import { validateStart } from "../../../../redux/slices/omiSlice";
import { motion } from "framer-motion";
import { TbBriefcase, TbEdit, TbArrowLeft } from "react-icons/tb";
import { useTheme } from "../../../../context/ThemeContext";
import logoForDark from "../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../assets/Logo_Light_bg.png";
import { useWorkspace as useWorkspaceContext } from "../../../../context/WorkspaceContext";
const WorkspaceForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { theme } = useTheme();
  const { setSelectedWorkspace } = useWorkspaceContext();
  const isEditMode = !!id;

  const { data: workspaceData, isLoading: isFetching } = useWorkspace(id, {
    enabled: isEditMode,
  });

  const createMutation = useCreateWorkspace();
  const updateMutation = useUpdateWorkspace();

  const loading = createMutation.isLoading || updateMutation.isLoading || isFetching;

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

  useEffect(() => {
    const getField = (obj, keys) => {
      if (!obj) return '';
      for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) return obj[key];
      }
      if (obj.data) return getField(obj.data, keys);
      return '';
    };

    if (workspaceData && isEditMode) {
      console.log('DEBUG: WorkspaceForm data object keys:', Object.keys(workspaceData));
      console.log('DEBUG: WorkspaceForm data stringified:', JSON.stringify(workspaceData));

      setForm({
        title: getField(workspaceData, ['name', 'title']),
        description: getField(workspaceData, ['description']),
        department_name: getField(workspaceData, ['department_name', 'departmentName', 'department', 'dept_name', 'dept']),
      });
    }
  }, [workspaceData, isEditMode]);

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

    if (isEditMode) {
      updateMutation.mutate({ id, data: payload }, {
        onSuccess: () => {
          navigate("/main/organization/workspace");
        },
        onError: (error) => {
          setErrors(prev => ({
            ...prev,
            api: error.response?.data?.message || "Failed to update workspace"
          }));
        }
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: (res) => {
          const newWS = res.data;
          setSelectedWorkspace(newWS);
          navigate(`/main/organization/workspace/explorations/${newWS.id}`);
        },
        onError: (error) => {
          setErrors(prev => ({
            ...prev,
            api: error.response?.data?.message || "Failed to create workspace"
          }));
        }
      });
    }
  };

  const handleCancel = () => {
    navigate("/main/organization/workspace");
  };

  if (isEditMode && isFetching) {
    return (
      <div className="min-h-full p-4 md:p-8 relative overflow-x-hidden flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-border animate-spin inline-block w-12 h-12 border-4 rounded-full border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 md:p-8 relative overflow-x-hidden">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-2xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => navigate("/main/organization/workspace")}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors"
          >
            <TbArrowLeft size={20} />
            <span>Back to Workspaces</span>
          </button>

          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
              {isEditMode ? <TbEdit className="w-6 h-6" /> : <TbBriefcase className="w-6 h-6" />}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
              {isEditMode ? "Edit Workspace" : "Create Workspace"}
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 ml-16">
            {isEditMode
              ? "Update your workspace details"
              : "Set up a new workspace to organize your research activities"
            }
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
          <form onSubmit={handleSubmit} className="space-y-6">
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
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe your workspace objectives and scope"
                rows={4}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300/60 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 transition-all outline-none"
              />
            </div>

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
                    {isEditMode ? "Updating..." : "Creating..."}
                  </span>
                ) : (
                  isEditMode ? "Update Workspace" : "Create Workspace"
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
        </motion.div>
      </div>
    </div>
  );
};

export default WorkspaceForm;
