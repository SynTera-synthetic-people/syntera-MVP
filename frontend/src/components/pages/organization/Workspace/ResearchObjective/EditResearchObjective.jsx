"use client";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from 'react-redux';
import { 
  updateResearchObjectiveStart, 
  getResearchObjectivesStart 
} from "../../../../../redux/slices/researchObjectiveSlice";
import { motion } from "framer-motion";
import { TbArrowLeft, TbCheck } from "react-icons/tb";

export default function EditResearchObjective() {
  const { workspaceId, objectiveId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Redux state
  const { objectives, loading } = useSelector((state) => state.researchObjective);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch objectives if not loaded (refresh case)
  /* 
  useEffect(() => {
    if ((!objectives || objectives.length === 0) && workspaceId) {
      dispatch(getResearchObjectivesStart({ workspaceId }));
    }
  }, [dispatch, workspaceId, objectives?.length]);
  */

  // Load data into form
  useEffect(() => {
    if (objectives && objectives.length > 0) {
      const found = objectives.find((obj) => 
        (obj.id === objectiveId) || (obj._id === objectiveId) || (obj.objective_id === objectiveId)
      );
      
      if (found) {
        setFormData({
          title: found.title || "",
          description: found.description || found.title || "",
        });
      }
    }
  }, [objectiveId, objectives]);

  // Update input
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    /* 
    dispatch(updateResearchObjectiveStart({
      objectiveId,
      data: formData
    }));
    */

    // Direct navigation for testing/demonstration
    const targetUrl = `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`;
    console.log('Direct navigation to:', targetUrl);
    navigate(targetUrl);
  };

  // Effect to navigate after successful update
  useEffect(() => {
    if (!loading && isSubmitting) {
        setIsSubmitting(false);
        navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`);
    }
  }, [loading, isSubmitting, navigate, workspaceId, objectiveId]);

  return (
    <div className="p-4 md:p-8 relative">
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
           initial={{ opacity: 0, y: -20 }}
           animate={{ opacity: 1, y: 0 }}
           className="mb-8"
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-4 group"
          >
            <TbArrowLeft size={20} />
            <span className="leading-none">Back</span>
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate(`/main/organization/workspace/explorations/${workspaceId}`)}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-blue-600 transition-all"
              title="Go to Explorations"
            >
              <TbArrowLeft size={28} />
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Research Objective
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Edit the details of your research initiative
          </p>
        </motion.div>

        {/* Main Content Card */}
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.1 }}
           className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Title Input */}
            <div className="w-full bg-gray-50/50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50 transition-all p-1">
                 <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    className="w-full p-4 bg-transparent border-none focus:ring-0 text-lg font-semibold text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                    placeholder="Objective Title"
                    required
                  />
            </div>

            {/* Description Textarea */}
            <div className="w-full bg-gray-50/50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50 transition-all">
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="w-full h-40 p-5 bg-transparent border-none focus:ring-0 resize-none text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none custom-scrollbar"
                placeholder="Briefly describe the objective and key hypothesis you intend to uncover?"
                required
              />
            </div>

            {/* Footer / Buttons */}
            <div className="flex gap-4 justify-end pt-4">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                 {isSubmitting ? (
                    <span className="flex items-center gap-2">
                         <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                         Saving...
                    </span>
                 ) : (
                    <>
                        <span>Save & Next</span>
                        <TbCheck size={18} />
                    </>
                 )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
