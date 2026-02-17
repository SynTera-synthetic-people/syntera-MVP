// import React from "react";
// import { useNavigate } from "react-router-dom";
// import { useObjectives } from "../../../context/ObjectiveContext";
// import ProgressBar from "../../common/ProgressBar";

// const ResearchObjectives = () => {
//   const navigate = useNavigate();

//   const { objectives, deleteObjective } = useObjectives();

//   return (
//     <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-white dark:bg-black-primary-dark">
//       <ProgressBar currentStep="Research objective" />

//       {/* Header */}
//       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 my-10">
//         <div>
//           <h1 className="text-4xl sm:text-4xl font-extrabold text-blue-primary-dark dark:text-white">
//             Research Objectives
//           </h1>
//           <p className="text-gray-600 dark:text-gray-400 mt-2">
//             Design and manage your research initiatives
//           </p>
//         </div>

//         <button
//           onClick={() => navigate("/main/organization/research-objectives/add")}
//           className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-blue-primary to-blue-primary-dark dark:from-primary dark:to-primary-dark text-white rounded-lg font-semibold shadow-lg hover:scale-105 transition"
//         >
//           + Create New Exploration
//         </button>
//       </div>

//       {/* Empty State */}
//       {objectives.length === 0 ? (
//         <div className="text-center py-20">
//           <p className="text-gray-500 dark:text-gray-400 text-lg mb-6">
//             No research objectives created yet.
//           </p>
//           <button
//             onClick={() =>
//               navigate("/main/organization/research-objectives/add")
//             }
//             className="px-6 py-2.5 bg-blue-primary dark:bg-primary text-white rounded-lg font-semibold shadow-lg hover:scale-105 transition"
//           >
//             Create New Exploration
//           </button>
//         </div>
//       ) : (
//         <>
//           {/* Research Objectives List */}
//           <div className="space-y-4">
//             {objectives.map((objective) => (
//               <div
//                 key={objective.id}
//                 className="bg-blue-primary-lighter/20 dark:bg-black-primary-light/60 backdrop-blur-lg 
//       border border-blue-primary-light/30 dark:border-dark-border/50 p-5 rounded-xl
//       flex flex-col md:flex-row justify-between 
//       items-start md:items-center gap-4"
//               >
//                 {/* Left Side Content */}
//                 <div className="flex-1">
//                   <h3 className="text-blue-primary-dark dark:text-white text-xl font-semibold">
//                     {objective.title}
//                   </h3>
//                   <p className="text-gray-600 dark:text-gray-400 mt-1">{objective.description}</p>
//                   <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
//                     Created: {new Date(objective.createdAt).toLocaleDateString()}
//                   </p>
//                 </div>

//                 {/* Buttons Group */}
//                 <div className="flex gap-3">
//                   <button
//                     onClick={() =>
//                       navigate(
//                         `/main/organization/research-objectives/${objective.id}/edit`
//                       )
//                     }
//                     className="px-5 py-2 bg-yellow-100 dark:bg-yellow-500/20 border border-yellow-200 dark:border-yellow-500/40 
//           text-yellow-700 dark:text-yellow-400 rounded-lg font-semibold hover:bg-yellow-200 dark:hover:bg-yellow-500/30 transition"
//                   >
//                     Edit
//                   </button>

//                   <button
//                     onClick={() => deleteObjective(objective.id)}
//                     className="px-5 py-2 bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-500/40 
//           text-red-700 dark:text-red-400 rounded-lg font-semibold hover:bg-red-200 dark:hover:bg-red-500/30 transition"
//                   >
//                     Delete
//                   </button>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </>
//       )}
//     </div>
//   );
// };

// export default ResearchObjectives;
import React from "react";
import { useNavigate } from "react-router-dom";
import { useObjectives } from "../../../context/ObjectiveContext";
import { useTheme } from "../../../context/ThemeContext";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { TbPlus, TbEdit, TbTrash, TbTarget, TbCalendar, TbSearch, TbBulb } from "react-icons/tb";

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

const ResearchObjectives = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { objectives, deleteObjective } = useObjectives();

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
              <TbTarget className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                Research Objectives
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Design and manage your research initiatives
              </p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/main/organization/research-objectives/add")}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-600 bg-[length:200%_auto] hover:bg-right text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all font-medium"
          >
            <TbPlus size={20} />
            <span>Create Exploration</span>
          </motion.button>
        </motion.div>

        {/* Main Card Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
        >
          {objectives.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="inline-block p-6 rounded-full bg-gray-100 dark:bg-white/5 mb-4">
                <TbBulb className="w-16 h-16 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No research objectives yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Start by creating your first research objective.
              </p>
              <button
                onClick={() => navigate("/main/organization/research-objectives/add")}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Create Exploration
              </button>
            </div>
          ) : (
            <>
              {/* List Header */}
              <div className="grid grid-cols-12 gap-4 p-6 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <div className="col-span-12 md:col-span-4 pl-2">Title</div>
                <div className="col-span-12 md:col-span-4 hidden md:block">Description</div>
                <div className="col-span-12 md:col-span-4 md:text-right pr-2">Actions</div>
              </div>

              {/* Objectives List */}
              <div className="divide-y divide-gray-200 dark:divide-white/10">
                {objectives.map((objective, index) => (
                  <motion.div
                    key={objective.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="grid grid-cols-12 gap-4 p-6 items-center hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group"
                  >
                    {/* Title Column */}
                    <div className="col-span-12 md:col-span-4 flex items-center gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <TbTarget size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {objective.title}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1 md:hidden">
                          <TbCalendar size={12} />
                          <span>
                            {new Date(objective.createdAt).toLocaleDateString('en-US', {
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
                        {objective.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mt-2">
                        <TbCalendar size={12} />
                        Created on {new Date(objective.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </div>

                    {/* Actions Column */}
                    <div className="col-span-12 md:col-span-4 flex items-center justify-start md:justify-end gap-2">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => navigate(`/main/organization/research-objectives/${objective.id}/edit`)}
                        className="p-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors relative"
                        title="Edit Objective"
                      >
                        <TbEdit size={18} />
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => deleteObjective(objective.id)}
                        className="p-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                        title="Delete Objective"
                      >
                        <TbTrash size={18} />
                      </motion.button>
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

export default ResearchObjectives;

