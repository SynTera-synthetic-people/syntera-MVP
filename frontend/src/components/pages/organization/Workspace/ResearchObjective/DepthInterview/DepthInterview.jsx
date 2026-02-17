import React, { useState, useEffect } from 'react';
import { useObjectives } from '../../../../../../context/ObjectiveContext';
import ChatView from './ChatView';
import { motion } from "framer-motion";
import { TbArrowLeft, TbMessageCircle, TbPlus, TbTrash, TbBulb, TbLoader, TbEdit, TbCheck, TbX } from "react-icons/tb";
import { useTheme } from "../../../../../../context/ThemeContext";
import PremiumButton from "../../../../../common/PremiumButton";
import logoForDark from "../../../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../../../assets/Logo_Light_bg.png";
import { useNavigate, useParams } from 'react-router-dom';
import GuideValidationModal from './components/GuideValidationModal';
import {
  useDiscussionGuideWithAutoGenerate,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useCreateQuestion,
  useUpdateQuestion,
  useDeleteQuestion
} from '../../../../../../hooks/useDiscussionGuide';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';

const DepthInterview = () => {
  const { objectives } = useObjectives();
  const { theme } = useTheme();
  const { workspaceId, objectiveId } = useParams();
  const navigate = useNavigate();

  const latestObjective = objectives.length > 0 ? objectives[objectives.length - 1] : null;

  // Use the new combined hook
  const {
    data: guideData,
    isLoading: isGuideLoading,
    error: guideError,
    refetch: refetchGuide,
    generateGuide,
    isGenerating,
    generationError,
    shouldAutoGenerate
  } = useDiscussionGuideWithAutoGenerate(workspaceId, objectiveId);

  console.log("guideData => ", guideData);
  console.log("shouldAutoGenerate => ", shouldAutoGenerate);

  const createSectionMutation = useCreateSection(workspaceId, objectiveId);
  const updateSectionMutation = useUpdateSection(workspaceId, objectiveId);
  const deleteSectionMutation = useDeleteSection(workspaceId, objectiveId);
  const createQuestionMutation = useCreateQuestion(workspaceId, objectiveId);
  const updateQuestionMutation = useUpdateQuestion(workspaceId, objectiveId);
  const deleteQuestionMutation = useDeleteQuestion(workspaceId, objectiveId);

  const { trigger } = useOmniWorkflow();

  const [showChat, setShowChat] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [addingQuestionToSection, setAddingQuestionToSection] = useState(null);

  // State for editing questions
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editedQuestionText, setEditedQuestionText] = useState('');
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationReason, setValidationReason] = useState("");
  const [pendingValidationData, setPendingValidationData] = useState(null);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 }
  };

  useEffect(() => {
    if (objectiveId) {
      trigger({
        stage: 'persona_builder',
        event: 'BUILD_DISCUSSION_GUIDE',
        payload: {},
      });
    }
  }, [objectiveId]);

  // Auto-generate guide if no data exists
  useEffect(() => {
    const handleAutoGenerate = async () => {
      if (shouldAutoGenerate && workspaceId && objectiveId) {
        try {
          // Trigger loading event
          trigger({
            stage: 'discussion_guide',
            event: 'BUILD_DISCUSSION_GUIDE_LOAD',
            payload: {},
          });
          await generateGuide();
          // After successful generation, trigger created event with guideData
          if (guideData) {
            trigger({
              stage: 'discussion_guide',
              event: 'BUILD_DISCUSSION_GUIDE_CREATED',
              payload: {},
            });
          }
        } catch (error) {
          console.error("Failed to auto-generate guide:", error);
        }
      }
    };

    handleAutoGenerate();
  }, [shouldAutoGenerate, workspaceId, objectiveId, generateGuide, trigger, guideData]);

  // Format guide data for display
  const guide = guideData?.data || [];

  const handleRegenerateGuide = async () => {
    try {
      trigger({
        stage: 'discussion_guide',
        event: 'BUILD_DISCUSSION_GUIDE_LOAD',
        payload: {},
      });
      await generateGuide();
      trigger({
        stage: 'discussion_guide',
        event: 'BUILD_DISCUSSION_GUIDE_CREATED',
        payload: {},
      });
    } catch (error) {
      console.error("Failed to regenerate guide:", error);
    }
  };

  const handleValidationModalContinue = async () => {
    const data = pendingValidationData;
    if (!data) return;

    setShowValidationModal(false);
    setValidationReason("");
    setPendingValidationData(null);

    try {
      if (data.type === 'updateQuestion') {
        await handleSaveQuestion(data.questionId, true);
      } else if (data.type === 'createQuestion') {
        await handleAddQuestion(data.sectionId, true);
      } else if (data.type === 'updateSection') {
        await handleCategoryChange(data.sectionId, data.title, true);
      } else if (data.type === 'createSection') {
        await handleAddCategory(true);
      } else if (data.type === 'deleteQuestion') {
        await handleDeleteQuestion(data.questionId, true);
      } else if (data.type === 'deleteSection') {
        await handleDeleteCategory(data.sectionId, true);
      }
    } catch (error) {
      console.error("Retry failed:", error);
    }
  };

  const handleValidationModalClose = () => {
    setShowValidationModal(false);
    setValidationReason("");
    setPendingValidationData(null);
  };

  const handleStartEditQuestion = (questionId, currentText) => {
    setEditingQuestionId(questionId);
    setEditedQuestionText(currentText);
  };

  const handleCancelEditQuestion = () => {
    setEditingQuestionId(null);
    setEditedQuestionText('');
  };

  const handleSaveQuestion = async (questionId, isForce = false) => {
    if (!editedQuestionText.trim() && !isForce) {
      alert('Question cannot be empty');
      return;
    }

    const textToUse = isForce ? (pendingValidationData?.text || editedQuestionText) : editedQuestionText;

    try {
      const result = await updateQuestionMutation.mutateAsync({
        questionId,
        data: { text: textToUse, is_force_insert: isForce }
      });

      if (result?.data?.validation_status === "failed" && !isForce) {
        setValidationReason(result.data.reason);
        setPendingValidationData({ type: 'updateQuestion', questionId, text: textToUse });
        setShowValidationModal(true);
        return;
      }

      setEditingQuestionId(null);
      setEditedQuestionText('');
      refetchGuide(); // Refresh the data
    } catch (error) {
      console.error("Failed to update question:", error);
    }
  };

  const handleAddQuestion = async (sectionId, isForce = false) => {
    const textToUse = isForce ? (pendingValidationData?.text || newQuestionText) : newQuestionText;

    if (!textToUse.trim() && !isForce) {
      alert('Question cannot be empty');
      return;
    }

    try {
      const result = await createQuestionMutation.mutateAsync({
        sectionId: sectionId,
        text: textToUse,
        is_force_insert: isForce
      });

      if (result?.data?.validation_status === "failed" && !isForce) {
        setValidationReason(result.data.reason);
        setPendingValidationData({ type: 'createQuestion', sectionId, text: textToUse });
        setShowValidationModal(true);
        return;
      }

      // Trigger event after successful question addition
      trigger({
        stage: 'discussion_guide',
        event: 'BUILD_DISCUSSION_GUIDE_C_QUES',
        payload: {},
      });

      setNewQuestionText('');
      setAddingQuestionToSection(null);
      refetchGuide(); // Refresh the data
    } catch (error) {
      console.error("Failed to add question:", error);
    }
  };

  const handleDeleteQuestion = async (questionId, isForce = false) => {
    if (!isForce && !window.confirm('Are you sure you want to delete this question?')) {
      return;
    }

    try {
      const result = await deleteQuestionMutation.mutateAsync({
        questionId,
        data: { is_force_insert: isForce }
      });

      if (result?.data?.validation_status === "failed" && !isForce) {
        setValidationReason(result.data.reason);
        setPendingValidationData({ type: 'deleteQuestion', questionId });
        setShowValidationModal(true);
        return;
      }

      // Trigger event after successful question deletion
      trigger({
        stage: 'discussion_guide',
        event: 'BUILD_DISCUSSION_GUIDE_D_QUES',
        payload: {},
      });

      refetchGuide(); // Refresh the data
    } catch (error) {
      console.error("Failed to delete question:", error);
    }
  };

  const handleCategoryChange = async (sectionId, value, isForce = false) => {
    try {
      const result = await updateSectionMutation.mutateAsync({
        sectionId: sectionId,
        title: value,
        is_force_insert: isForce
      });

      if (result?.data?.validation_status === "failed" && !isForce) {
        setValidationReason(result.data.reason);
        setPendingValidationData({ type: 'updateSection', sectionId, title: value });
        setShowValidationModal(true);
        return;
      }

      setEditingSectionId(null);
      refetchGuide(); // Refresh the data
    } catch (error) {
      console.error("Failed to update section:", error);
    }
  };

  const handleStartEditing = (sectionId, currentTitle) => {
    setEditingSectionId(sectionId);
    setNewSectionTitle(currentTitle);
  };

  const handleSaveCategory = async (sectionId) => {
    console.log("SECTION ID => ", sectionId);

    if (!newSectionTitle.trim()) {
      alert('Section title cannot be empty');
      return;
    }

    await handleCategoryChange(sectionId, newSectionTitle);
  };

  const handleCancelEditing = () => {
    setEditingSectionId(null);
    setNewSectionTitle('');
  };

  const handleAddCategory = async (isForce = false) => {
    try {
      const result = await createSectionMutation.mutateAsync({
        title: 'New Section',
        is_force_insert: isForce
      });

      if (result?.data?.validation_status === "failed" && !isForce) {
        setValidationReason(result.data.reason);
        setPendingValidationData({ type: 'createSection' });
        setShowValidationModal(true);
        return;
      }

      // Trigger event after successful section creation
      trigger({
        stage: 'discussion_guide',
        event: 'BUILD_DISCUSSION_GUIDE_C_SECTION',
        payload: {},
      });

      refetchGuide(); // Refresh the data
    } catch (error) {
      console.error("Failed to add section:", error);
    }
  };

  const handleDeleteCategory = async (sectionId, isForce = false) => {
    if (!isForce && !window.confirm('Are you sure you want to delete this section and all its questions?')) {
      return;
    }

    try {
      const result = await deleteSectionMutation.mutateAsync({
        sectionId,
        data: { is_force_insert: isForce }
      });

      if (result?.data?.validation_status === "failed" && !isForce) {
        setValidationReason(result.data.reason);
        setPendingValidationData({ type: 'deleteSection', sectionId });
        setShowValidationModal(true);
        return;
      }

      // Trigger event after successful section deletion
      trigger({
        stage: 'discussion_guide',
        event: 'BUILD_DISCUSSION_GUIDE_D_SECTION',
        payload: {},
      });

      refetchGuide(); // Refresh the data
    } catch (error) {
      console.error("Failed to delete section:", error);
    }
  };

  const handleSubmit = () => {
    navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/chatview`);
  };

  // Determine loading state
  const isLoading = isGuideLoading || (shouldAutoGenerate && isGenerating);

  if (showChat) {
    return <ChatView />;
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 relative transition-colors duration-300 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <TbLoader className="w-12 h-12 animate-spin text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            {shouldAutoGenerate && isGenerating
              ? 'Generating discussion guide...'
              : 'Loading discussion guide...'}
          </p>
        </div>
      </div>
    );
  }

  if (guideError || generationError) {
    return (
      <div className="p-4 md:p-8 relative transition-colors duration-300 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <TbTrash className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 dark:text-red-400 mb-4">Failed to load discussion guide</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 relative transition-colors duration-300">
      <div className="max-w-[1400px] mx-auto relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate(-1)}
              className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
              title="Go Back"
            >
              <TbArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                Discussion Guide Builder
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Customize your interview questions and sections
              </p>
            </div>

            {/* <PremiumButton
              onClick={handleRegenerateGuide}
              variant="outline"
              icon={isGenerating ? <TbLoader className="animate-spin" /> : <TbBulb />}
              disabled={isGenerating}
              className="whitespace-nowrap"
            >
              {isGenerating ? 'Regenerating...' : 'Regenerate Guide'}
            </PremiumButton> */}
          </div>
        </motion.div>



        {/* Main Content Card */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="bg-white/80 dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8"
        >
          {guide.length === 0 ? (
            <div className="text-center py-12">
              <TbBulb className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-6">No discussion guide available</p>
              <div className="flex justify-center">
                <PremiumButton
                  onClick={handleRegenerateGuide}
                  variant="primary"
                  icon={isGenerating ? <TbLoader className="animate-spin" /> : <TbBulb />}
                  disabled={isGenerating}
                >
                  {isGenerating ? 'Generating...' : 'Generate Guide'}
                </PremiumButton>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {guide.map((section, sectionIndex) => (
                <motion.div
                  key={section.section_id}
                  className="bg-gray-50/50 dark:bg-black/20 rounded-xl p-6 border border-gray-200 dark:border-white/5"
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: sectionIndex * 0.1 }}
                >
                  {/* Section Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex-1">
                      {editingSectionId === section.section_id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newSectionTitle}
                            onChange={(e) => setNewSectionTitle(e.target.value)}
                            className="w-full bg-transparent text-xl font-bold text-gray-900 dark:text-white border-b-2 border-blue-500 outline-none transition-colors"
                            placeholder="Enter section title..."
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveCategory(section.section_id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1"
                            disabled={updateSectionMutation.isPending}
                          >
                            <TbCheck size={14} />
                            {updateSectionMutation.isPending ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEditing}
                            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm flex items-center gap-1"
                          >
                            <TbX size={14} />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {sectionIndex + 1}
                            </span>
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            {section.title}
                          </h3>
                          <button
                            onClick={() => handleStartEditing(section.section_id, section.title)}
                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-1"
                            title="Edit Section"
                          >
                            <TbEdit size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteCategory(section.section_id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete Section"
                      disabled={deleteSectionMutation.isPending}
                    >
                      {deleteSectionMutation.isPending ? (
                        <TbLoader className="animate-spin" size={18} />
                      ) : (
                        <TbTrash size={18} />
                      )}
                    </button>
                  </div>

                  {/* Questions List */}
                  <div className="space-y-4">
                    {section.questions?.map((question, qIndex) => (
                      <div className="flex items-start gap-4 group" key={question.id}>
                        <span className="font-mono text-gray-400 dark:text-gray-500 mt-2 text-sm">
                          Q{qIndex + 1}
                        </span>
                        <div className="flex-1">
                          {editingQuestionId === question.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editedQuestionText}
                                onChange={(e) => setEditedQuestionText(e.target.value)}
                                className="w-full p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none transition-all text-gray-700 dark:text-gray-200 resize-none min-h-[80px]"
                                rows="2"
                                placeholder="Edit your question here..."
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveQuestion(question.id)}
                                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1"
                                  disabled={updateQuestionMutation.isPending}
                                >
                                  <TbCheck size={14} />
                                  {updateQuestionMutation.isPending ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={handleCancelEditQuestion}
                                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm flex items-center gap-1"
                                >
                                  <TbX size={14} />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg min-h-[60px] flex items-center">
                              <p className="text-gray-700 dark:text-gray-200 flex-1">
                                {question.text}
                              </p>
                              <button
                                onClick={() => handleStartEditQuestion(question.id, question.text)}
                                className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors ml-2"
                                title="Edit Question"
                              >
                                <TbEdit size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                        {editingQuestionId !== question.id && (
                          <button
                            onClick={() => handleDeleteQuestion(question.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete Question"
                            disabled={deleteQuestionMutation.isPending}
                          >
                            {deleteQuestionMutation.isPending ? (
                              <TbLoader className="animate-spin" size={18} />
                            ) : (
                              <TbTrash size={18} />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Question Button */}
                  {addingQuestionToSection === section.section_id ? (
                    <div className="mt-4 pl-8 space-y-2">
                      <textarea
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        className="w-full p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none transition-all text-gray-700 dark:text-gray-200 resize-none min-h-[80px]"
                        rows="2"
                        placeholder="Enter new question text..."
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddQuestion(section.section_id)}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1"
                          disabled={!newQuestionText.trim() || createQuestionMutation.isPending}
                        >
                          <TbPlus size={14} />
                          {createQuestionMutation.isPending ? 'Adding...' : 'Add Question'}
                        </button>
                        <button
                          onClick={() => {
                            setAddingQuestionToSection(null);
                            setNewQuestionText('');
                          }}
                          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm flex items-center gap-1"
                        >
                          <TbX size={14} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pl-8">
                      <button
                        onClick={() => setAddingQuestionToSection(section.section_id)}
                        className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      >
                        <TbPlus size={16} />
                        Add Question
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-col md:flex-row gap-4 justify-between items-center border-t border-gray-200 dark:border-white/10 pt-8 mb-16">
            <div className="flex gap-4">
              {guide.length > 0 && (
                <button
                  onClick={() => handleAddCategory()}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors font-medium"
                  disabled={createSectionMutation.isPending}
                >
                  <TbPlus size={20} />
                  <span>
                    {createSectionMutation.isPending ? 'Adding...' : 'Add New Section'}
                  </span>
                </button>
              )}

              {/* <button
                onClick={handleRegenerateGuide}
                className="flex items-center gap-2 px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-colors font-medium"
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <TbLoader className="animate-spin" size={20} />
                    <span>Regenerating...</span>
                  </>
                ) : (
                  <>
                    <TbBulb size={20} />
                    <span>Regenerate Guide</span>
                  </>
                )}
              </button> */}
            </div>

            <PremiumButton
              onClick={handleSubmit}
              variant="primary"
              className="w-full md:w-auto min-w-[150px]"
              disabled={guide.length === 0}
            >
              Start Interview
            </PremiumButton>
          </div>
        </motion.div>
      </div>

      <GuideValidationModal
        show={showValidationModal}
        reason={validationReason}
        onContinue={handleValidationModalContinue}
        onClose={handleValidationModalClose}
      />
    </div>
  );
};

export default DepthInterview;