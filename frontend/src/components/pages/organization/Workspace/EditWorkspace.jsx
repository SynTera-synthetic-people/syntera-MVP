import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PremiumInput from "../../../common/PremiumInput";
import PremiumButton from "../../../common/PremiumButton";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { validateWorkspace } from "../../../../utils/validation";
import { motion } from "framer-motion";
import { TbEdit, TbArrowLeft } from "react-icons/tb";
import { useTheme } from "../../../../context/ThemeContext";
import logoForDark from "../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../assets/Logo_Light_bg.png";
const EditWorkspace = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { id } = useParams();
  const { workspaces, updateWorkspace } = useWorkspace();

  const wsId = String(id);
  const workspace = workspaces.find((w) => String(w.id) === wsId);

  const [form, setForm] = useState({ title: "", description: "", department_name: "" });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const getField = (obj, keys) => {
      if (!obj) return '';
      for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) return obj[key];
      }
      if (obj.data) return getField(obj.data, keys);
      return '';
    };

    if (workspace) {
      console.log('DEBUG: EditWorkspace data object keys:', Object.keys(workspace));
      console.log('DEBUG: EditWorkspace stringified:', JSON.stringify(workspace));

      setForm({
        title: getField(workspace, ['name', 'title']),
        description: getField(workspace, ['description']),
        department_name: getField(workspace, ['department_name', 'departmentName', 'department', 'dept_name', 'dept'])
      });
    }
  }, [workspace]);

  if (!workspace) return <p className="text-center mt-10 text-red-500">Workspace not found.</p>;

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validateWorkspace(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    updateWorkspace(workspace.id, form);
    navigate("/main/organization/workspace");
  };

  return (
    <div className="min-h-screen p-4 md:p-8 relative overflow-x-hidden">
      {/* Fixed Background Layer */}
      <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen pointer-events-none overflow-hidden z-0">
        {/* Base Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e]" />

        {/* Background Gradient Orbs */}
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
        <div className="absolute top-[30%] right-[10%] w-[35%] h-[35%] bg-gradient-to-bl from-cyan-400/20 to-blue-500/15 dark:from-cyan-500/30 dark:to-blue-600/20 rounded-full blur-[80px]" />
      </div>

      <div className="max-w-2xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <motion.button
            whileHover={{ scale: 1.05, backgroundColor: "rgba(255, 255, 255, 0.1)" }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/main/organization/workspace")}
            className="w-14 h-14 rounded-[1.25rem] flex items-center justify-center bg-white/5 backdrop-blur-xl border border-gray-300/20 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-all mb-8 shadow-lg shadow-black/5"
            title="Back to Workspaces"
          >
            <TbArrowLeft size={24} />
          </motion.button>

          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white flex-shrink-0">
              <TbEdit className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-none mb-2">
                Edit Workspace
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
                Update your workspace details
              </p>
            </div>
          </div>
        </motion.div>

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
                Workspace Title
              </label>
              <PremiumInput
                name="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                error={errors.title}
                placeholder="e.g., Product Research 2024"
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
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 transition-all outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Department Name
              </label>
              <PremiumInput
                name="department_name"
                value={form.department_name}
                onChange={(e) => setForm({ ...form, department_name: e.target.value })}
                error={errors.department_name}
                placeholder="Enter department name (e.g., Marketing, Research)"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <PremiumButton type="submit" variant="primary" className="flex-1">
                Save Changes
              </PremiumButton>
              <PremiumButton
                type="button"
                variant="secondary"
                onClick={() => navigate("/main/organization/workspace")}
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

export default EditWorkspace;
