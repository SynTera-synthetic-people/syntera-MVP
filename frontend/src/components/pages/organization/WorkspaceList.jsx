// src/pages/Workspace/WorkspaceList.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspaces, useDeleteWorkspace } from "../../../hooks/useWorkspaces";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { TbPlus, TbEdit, TbTrash, TbUsers, TbBriefcase, TbTelescope, TbCalendar, TbSearch } from "react-icons/tb";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import { useTheme } from "../../../context/ThemeContext";
import { formatDateToDDMMYYYY } from "../../../utils/formatDate";
import { useWorkspace as useWorkspaceContext } from "../../../context/WorkspaceContext";
// Internal component for individual floating particles
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

// Custom Tooltip Button Component
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

const WorkspaceList = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { setSelectedWorkspace } = useWorkspaceContext();

  const { data: workspaces = [], isLoading, error, refetch } = useWorkspaces();
  const deleteMutation = useDeleteWorkspace();

  const [isHovered, setIsHovered] = React.useState(false);

  // Mouse Follow Logic
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  };

  const handleDelete = (id, title) => {
    if (window.confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      deleteMutation.mutate(id, {
        onSuccess: () => {
          refetch();
        }
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-8 relative overflow-x-hidden flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-border animate-spin inline-block w-12 h-12 border-4 rounded-full border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading workspaces...</p>
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
            <TbBriefcase className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-red-600 dark:text-red-400 text-lg mb-4">Error loading workspaces</p>
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
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
              <TbBriefcase className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                My Workspaces
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                All your research initiatives, neatly boxed
              </p>
            </div>
          </div>

          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onClick={() => navigate("/main/organization/workspace/add")}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-600 bg-[length:200%_auto] hover:bg-right text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all font-medium"
            >
              <TbPlus size={20} />
              <span>Create Workspace</span>
            </motion.button>

            {/* Tooltip */}
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="absolute right-0 top-full mt-2 z-50 w-64 p-3 text-xs font-medium text-white bg-gray-900 dark:bg-gray-800 rounded-xl shadow-2xl pointer-events-none"
              >
                Create dedicated spaces for each department, product, or market to keep research initiatives organized in one hub.
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
          {workspaces.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="inline-block p-6 rounded-full bg-gray-100 dark:bg-white/5 mb-4">
                <TbBriefcase className="w-16 h-16 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No workspaces… yet.
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Create your first workspace to group research initiatives by department, product, or market
              </p>
            </div>
          ) : (
            <>
              {/* List Header */}
              <div className="grid grid-cols-12 gap-4 p-6 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <div className="col-span-12 md:col-span-4 pl-2">Title</div>
                <div className="col-span-12 md:col-span-4 hidden md:block">Description</div>
                <div className="col-span-12 md:col-span-4 md:text-right pr-2">Actions</div>
              </div>

              {/* Workspace Rows */}
              <div className="divide-y divide-gray-200 dark:divide-white/10">
                {[...workspaces].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((ws, index) => (
                  <motion.div
                    key={ws.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="grid grid-cols-12 gap-4 p-6 items-center hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group"
                  >
                    {/* Title Column */}
                    <div className="col-span-12 md:col-span-4 flex items-center gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <TbBriefcase size={20} />
                      </div>
                      <div>
                        <div className="flex flex-col truncate">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                            {ws.name || ws.title || "Untitled Workspace"}
                          </h3>
                          {ws.department_name && (
                            <span className="text-[10px] text-blue-500 font-bold uppercase tracking-tight truncate">
                              {ws.department_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1 md:hidden">
                          <TbCalendar size={12} />
                          <span>
                            {new Date(ws.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description Column */}
                    <div className="col-span-12 md:col-span-4 hidden md:block">
                      <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                        {ws.description || "No description provided."}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mt-2">
                        <TbCalendar size={12} />
                        Created on {formatDateToDDMMYYYY(ws.created_at)}
                      </div>
                    </div>

                    {/* Actions Column */}
                    <div className="col-span-12 md:col-span-4 flex items-center justify-start md:justify-end gap-2 overflow-visible">
                      <TooltipButton
                        onClick={() => navigate(`/main/organization/workspace/edit/${ws.id}`)}
                        icon={<TbEdit size={18} />}
                        label="Edit Workspace"
                        colorClass="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20"
                      />

                      <TooltipButton
                        onClick={() => navigate(`/main/organization/workspace/manage/${ws.id}`)}
                        icon={<TbUsers size={18} />}
                        label="Manage Users"
                        colorClass="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20"
                      />

                      <TooltipButton
                        onClick={() => {
                          setSelectedWorkspace(ws);
                          navigate(`/main/organization/workspace/explorations/${ws.id}`);
                        }}
                        icon={<TbTelescope size={18} />}
                        label="Explorations"
                        colorClass="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20"
                      />

                      <div className="h-6 w-px bg-gray-300 dark:bg-white/10 mx-2 hidden md:block"></div>

                      <TooltipButton
                        onClick={() => handleDelete(ws.id, ws.name)}
                        icon={<TbTrash size={18} />}
                        label="Delete Workspace"
                        colorClass="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20"
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default WorkspaceList;
