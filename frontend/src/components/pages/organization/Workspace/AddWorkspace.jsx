import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PremiumInput from "../../../common/PremiumInput";
import PremiumButton from "../../../common/PremiumButton";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { validateWorkspace } from "../../../../utils/validation";
import { useDispatch, useSelector } from "react-redux";
import { validateStart } from "../../../../redux/slices/omiSlice";
import { motion } from "framer-motion";
import { TbBriefcase, TbArrowLeft } from "react-icons/tb";
import { useTheme } from "../../../../context/ThemeContext";
import logoForDark from "../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../assets/Logo_Light_bg.png";
const AddWorkspace = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { addWorkspace } = useWorkspace();

  const [form, setForm] = useState({ title: "", description: "" });
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

    addWorkspace(form);
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
              <TbBriefcase className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-none mb-2">
                Create Workspace
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
                Set up a new research environment
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
              <PremiumInput
                name="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe your workspace objectives and scope"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <PremiumButton type="submit" variant="primary" className="flex-1">
                Create Workspace
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

export default AddWorkspace;
