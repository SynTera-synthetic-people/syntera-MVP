import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PremiumInput from "../../../../common/PremiumInput";
import PremiumButton from "../../../../common/PremiumButton";
import { motion } from "framer-motion";
import { TbArrowLeft, TbTelescope } from "react-icons/tb";
import { useTheme } from "../../../../../context/ThemeContext";
import logoForDark from "../../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../../assets/Logo_Light_bg.png";
import {
  useCreateExploration,
  useUpdateExploration,
  useExploration
} from "../../../../../hooks/useExplorations"; // Adjust path as needed
import { useWorkspace } from "../../../../../hooks/useWorkspaces";

const CreateExploration = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { workspaceId, explorationId } = useParams();

  // Fetch current workspace details
  const { data: currentWorkspace } = useWorkspace(workspaceId);

  const isEditMode = !!explorationId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState({});

  // Fetch exploration data if in edit mode
  const { data: exploration, isLoading: isLoadingExploration, error: fetchError } =
    useExploration(explorationId, { enabled: isEditMode });

  const createExplorationMutation = useCreateExploration();
  const updateExplorationMutation = useUpdateExploration();

  // Populate form when in edit mode and data is loaded
  useEffect(() => {
    if (isEditMode && exploration) {
      setTitle(exploration.title || "");
      setDescription(exploration.description || "");
    }
  }, [isEditMode, exploration]);

  const handleValidateAndSubmit = async (e) => {
    e.preventDefault();

    // Clear previous errors
    setErrors({});

    // Validation
    if (!title.trim()) {
      setErrors({ title: "Exploration title is required" });
      return;
    }

    try {
      if (isEditMode) {
        // Update existing exploration
        const updateData = {
          title: title.trim(),
          description: description.trim()
        };

        await updateExplorationMutation.mutateAsync({
          id: explorationId,
          data: updateData
        });
      } else {
        // Create new exploration
        const explorationData = {
          workspace_id: workspaceId,
          title: title.trim(),
          description: description.trim()
        };

        await createExplorationMutation.mutateAsync(explorationData);
      }

      // Navigation is handled in the onSuccess callback of the mutations
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    } catch (error) {
      console.error(`Failed to ${isEditMode ? 'update' : 'create'} exploration:`, error);
      // Error is already handled by the mutation's onError callback
    }
  };

  const handleCancel = () => {
    navigate(`/main/organization/workspace/explorations/${workspaceId}`);
  };

  // Determine which mutation to use for loading state
  const isLoading = isEditMode ?
    (isLoadingExploration || updateExplorationMutation.isPending) :
    createExplorationMutation.isPending;

  // Loading state for edit mode
  if (isEditMode && isLoadingExploration) {
    return (
      <div className="min-h-full p-4 md:p-8 relative overflow-x-hidden flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-border animate-spin inline-block w-12 h-12 border-4 rounded-full border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading exploration...</p>
        </div>
      </div>
    );
  }

  // Error state for fetching in edit mode
  if (isEditMode && fetchError) {
    return (
      <div className="min-h-full p-4 md:p-8 relative overflow-x-hidden">
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <TbTelescope className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-red-600 dark:text-red-400 text-lg mb-4">
            {fetchError?.response?.data?.message || "Error loading exploration"}
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCancel}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold shadow-lg"
          >
            Back to Explorations
          </motion.button>
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
          <div className="flex items-center gap-4 mb-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCancel}
              className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              <TbArrowLeft className="w-6 h-6" />
            </motion.button>
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
              <TbTelescope className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                {isEditMode ? "Edit Research Exploration" : "Create Research Exploration"}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">Give your study a clear title and a short description so it’s easy to find, recognize, and share
              </p>
            </div>

          </div>
          <p className="text-gray-600 dark:text-gray-400 ml-16">
            {currentWorkspace ? `In workspace: ${currentWorkspace.name}` : (isEditMode
              ? "Update the details of your exploration"
              : "Define the goals and scope of your research initiative")}
          </p>
        </motion.div>

        {/* Main Content Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8"
        >
          <form onSubmit={handleValidateAndSubmit} className="space-y-6">
            {/* Title Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Research Exploration Title *
              </label>
              <PremiumInput
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={errors.title}
                placeholder="e.g.,Credit Card Rewards Messaging, Premium Pricing Test, Healthy Snacks Positioning"
                disabled={isLoading}
                required
              />
            </div>

            {/* Description Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a one–two sentence about this exploration like“exploring which benefits, tones, and formats most effectively drive card sign-ups, usage with Gen Z professionals,"
                rows={4}
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <PremiumButton
                type="submit"
                variant="primary"
                className="flex-1"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2 justify-center">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {isEditMode ? 'Updating...' : 'Creating...'}
                  </span>
                ) : (
                  isEditMode ? "Update Exploration" : "Create Exploration"
                )}
              </PremiumButton>
              <PremiumButton
                type="button"
                variant="secondary"
                onClick={handleCancel}
                disabled={isLoading}
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

export default CreateExploration;