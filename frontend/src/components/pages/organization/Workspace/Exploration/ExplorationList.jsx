import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { TbPlus, TbEdit, TbTrash, TbArrowLeft, TbTelescope, TbSearch, TbChartDots } from "react-icons/tb";
import { useTheme } from "../../../../../context/ThemeContext";
import logoForDark from "../../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../../assets/Logo_Light_bg.png";
import {
  useExplorations,
  useDeleteExploration
} from "../../../../../hooks/useExplorations";
import { useWorkspace } from "../../../../../hooks/useWorkspaces";
import { formatDateToDDMMYYYY } from "../../../../../utils/formatDate";

const MouseParticle = ({ mouseX, mouseY, damping, stiffness, offsetX = 0, offsetY = 0, className }) => {
  const springX = useSpring(mouseX, { stiffness, damping });
  const springY = useSpring(mouseY, { stiffness, damping });

  const x = useTransform(springX, (value) => value + offsetX);
  const y = useTransform(springY, (value) => value + offsetY);

  return (
    <motion.div
      style={{ x, y }}
      className={`fixed top-0 left-0 pointer-events-none ${className}`}
    />
  );
};

const TooltipButton = ({ onClick, icon, label, colorClass, className }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div className="relative flex items-center justify-center">
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`p-2 rounded-lg transition-colors relative ${colorClass} ${className || ''}`}
        aria-label={label}
      >
        {icon}
      </motion.button>

      {/* Tooltip */}
      {isHovered && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: -40, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          className="absolute z-50 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-xl whitespace-nowrap pointer-events-none"
        >
          {label}
          {/* Arrow */}
          <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </motion.div>
      )}
    </div>
  );
};

const ExplorationList = () => {
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const { theme } = useTheme();

  // Use React Query hook to fetch explorations
  const { data: explorations, isLoading, error, refetch } = useExplorations(workspaceId);
  const deleteExplorationMutation = useDeleteExploration();

  // Fetch current workspace details
  const { data: currentWorkspace } = useWorkspace(workspaceId);

  const [isTooltipHovered, setIsTooltipHovered] = React.useState(false);

  // Mouse Follow Logic
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  };

  const handleDelete = async (id, title) => {
    if (window.confirm(`Are you sure you want to delete "${title || 'this exploration'}"? This action cannot be undone.`)) {
      try {
        await deleteExplorationMutation.mutateAsync(id);
        // No need to manually refetch - useDeleteExploration hook handles invalidation
      } catch (error) {
        console.error("Failed to delete exploration:", error);
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-8 relative overflow-x-hidden flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-border animate-spin inline-block w-12 h-12 border-4 rounded-full border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading explorations...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen p-4 md:p-8 relative overflow-x-hidden">
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <TbTelescope className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-red-600 dark:text-red-400 text-lg mb-4">Error loading explorations</p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => refetch()}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold shadow-lg"
          >
            Retry
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen p-4 md:p-8 relative overflow-x-hidden"
    >
      {/* Fixed Background Layer */}
      <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen pointer-events-none overflow-hidden z-0">
        {/* Base Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e]" />

        {/* Background Gradient Orbs */}
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
        <div className="absolute top-[30%] right-[10%] w-[35%] h-[35%] bg-gradient-to-bl from-cyan-400/20 to-blue-500/15 dark:from-cyan-500/30 dark:to-blue-600/20 rounded-full blur-[80px]" />

        {/* Interactive Mouse Trail - Floating Elements */}
        <MouseParticle
          mouseX={mouseX} mouseY={mouseY}
          stiffness={150} damping={15} offsetX={-50} offsetY={-50}
          className="w-[100px] h-[100px] bg-cyan-400/20 dark:bg-cyan-400/20 rounded-full blur-[30px]"
        />
        <MouseParticle
          mouseX={mouseX} mouseY={mouseY}
          stiffness={200} damping={10} offsetX={-10} offsetY={-10}
          className="w-[20px] h-[20px] bg-white/40 dark:bg-white/20 rounded-full blur-[15px]"
        />
      </div>



      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8"
        >
          <div className="flex items-center gap-4">
            {/* <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/main/organization/workspace')}
              className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              <TbArrowLeft className="w-6 h-6" />
            </motion.button> */}
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
              <TbTelescope className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                Research Exploration
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                All your research explorations, neatly stacked in one place.
              </p>
            </div>
          </div>

          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onMouseEnter={() => setIsTooltipHovered(true)}
              onMouseLeave={() => setIsTooltipHovered(false)}
              onClick={() => navigate(`/main/organization/workspace/explorations/${workspaceId}/create`)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-600 bg-[length:200%_auto] hover:bg-right text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all font-medium"
            >
              <TbPlus size={20} />
              <span>Research Exploration</span>
            </motion.button>

            {/* Tooltip */}
            {isTooltipHovered && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="absolute right-0 top-full mt-2 z-50 w-64 p-3 text-xs font-medium text-white bg-gray-900 dark:bg-gray-800 rounded-xl shadow-2xl pointer-events-none"
              >
                Create a dedicated exploration for each research question or study.
                {/* Arrow */}
                <div className="absolute right-6 -top-1 border-4 border-transparent border-b-gray-900 dark:border-b-gray-800" />
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Main Card Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
        >
          {!explorations || explorations.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="inline-block p-6 rounded-full bg-gray-100 dark:bg-white/5 mb-4">
                <TbTelescope className="w-16 h-16 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No research explorations… yet.
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Create your first exploration to group research initiatives by department, product, or market
              </p>
            </div>
          ) : (
            <>
              {/* List Header */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-6 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <div className="md:col-span-5 pl-2">Title</div>
                <div className="md:col-span-3 hidden md:block">Description</div>
                <div className="md:col-span-2 hidden md:block">Created On</div>
                <div className="md:col-span-2 text-right pr-2">Actions</div>
              </div>

              {/* Exploration Rows */}
              <div className="divide-y divide-gray-200 dark:divide-white/10">
                {[...explorations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((exploration, index) => {
                  // DEEP DEBUG: Log everything about this exploration
                  console.log(`[RENDER] Exploration: "${exploration.title}"`, {
                    id: exploration.id,
                    is_end: exploration.is_end,
                    type_of_is_end: typeof exploration.is_end,
                    all_keys: Object.keys(exploration)
                  });
                  return (
                    <motion.div
                      key={exploration.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="grid grid-cols-1 md:grid-cols-12 gap-4 p-6 items-center hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group"
                    >
                      {/* Title Column */}
                      <div className="md:col-span-5 flex items-center gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                          <TbTelescope size={20} />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                            {exploration.title || "Untitled Exploration"}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2 mt-1 md:hidden">
                            {exploration.description || "No description provided."}
                          </p>
                          <p className="text-gray-500 dark:text-gray-500 text-xs mt-1 md:hidden">
                            Created: {formatDateToDDMMYYYY(exploration.created_at) || "N/A"}
                          </p>
                        </div>
                      </div>

                      {/* Description Column - Desktop only */}
                      <div className="md:col-span-3 hidden md:block">
                        <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                          {exploration.description || "No description provided."}
                        </p>
                      </div>

                      {/* Created On Column - Desktop only */}
                      <div className="md:col-span-2 hidden md:block">
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                          {formatDateToDDMMYYYY(exploration.created_at) || "N/A"}
                        </p>
                      </div>

                      {/* Actions Column */}
                      <div className="md:col-span-2 flex items-center justify-start md:justify-end gap-2 overflow-visible">
                        <div className="flex items-center gap-2">
                          {Boolean(exploration.is_end) && (
                            <TooltipButton
                              onClick={() => navigate(`/main/traceability/${workspaceId}/${exploration.id}`)}
                              icon={<TbChartDots size={18} />}
                              label="Traceability"
                              colorClass="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20"
                            />
                          )}

                          <TooltipButton
                            onClick={() => navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${exploration.id}/research-mode`)}
                            icon={<TbSearch size={18} />}
                            label="Start Research"
                            colorClass="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20"
                          />

                          <TooltipButton
                            onClick={() => navigate(`/main/organization/workspace/explorations/${workspaceId}/${exploration.id}/edit`)}
                            icon={<TbEdit size={18} />}
                            label="Edit"
                            colorClass="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20"
                          />

                          <div className="h-4 w-px bg-gray-300 dark:bg-white/10 mx-1 hidden md:block"></div>

                          <TooltipButton
                            onClick={() => handleDelete(exploration.id, exploration.title)}
                            icon={<TbTrash size={18} />}
                            label="Delete"
                            colorClass="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20"
                            disabled={deleteExplorationMutation.isPending}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default ExplorationList;