import React from "react";
import { useWorkspace } from "../../../context/WorkspaceContext";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../../context/ThemeContext";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { TbPlus, TbEdit, TbTrash, TbUsers, TbBriefcase } from "react-icons/tb";

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

const Workspace = () => {
  const { workspaces, deleteWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [isHovered, setIsHovered] = React.useState(false);

  // Mouse Follow Logic
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen p-4 md:p-8 relative overflow-x-hidden"
    >
      {/* Fixed Background Layer */}
      <div className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
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
              onClick={() => navigate("/main/organization/workspace")}
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

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...workspaces].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((ws, index) => (
            <motion.div
              key={ws.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all group hover:border-blue-400 dark:hover:border-blue-500/30"
            >
              {/* Workspace Info */}
              <div className="mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {ws.name || ws.title}
                </h2>
                {ws.department_name && (
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider">
                    {ws.department_name}
                  </p>
                )}
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                  {ws.description}
                </p>
              </div>

              {/* Members Count */}
              <div className="flex items-center gap-2 mb-4 text-gray-500 dark:text-gray-400">
                <TbUsers size={18} />
                <span className="text-sm font-medium">
                  {ws.users?.length || 0} {ws.users?.length === 1 ? "Member" : "Members"}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-white/10">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(`/main/workspace/edit/${ws.id}`)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg transition-colors font-medium text-sm"
                >
                  <TbEdit size={16} />
                  Edit
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (window.confirm("Are you sure you want to delete this workspace?")) {
                      deleteWorkspace(ws.id);
                    }
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors font-medium text-sm"
                >
                  <TbTrash size={16} />
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Empty State */}
        {workspaces.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="inline-block p-6 rounded-full bg-gray-100 dark:bg-white/5 mb-4">
              <TbBriefcase className="w-16 h-16 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No workspaces… yet.
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Create your first workspace to group research initiatives by department, product, or market
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/main/organization/workspace")}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 font-medium"
            >
              <TbPlus size={20} />
              Create Workspace
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Workspace;
