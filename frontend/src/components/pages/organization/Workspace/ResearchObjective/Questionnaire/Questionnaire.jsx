import React, { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TbArrowLeft, TbUpload, TbCheck, TbChevronDown, TbSend } from 'react-icons/tb';

const Questionnaire = () => {
    const navigate = useNavigate();
    const { workspaceId, objectiveId } = useParams();
    const [openDropdown, setOpenDropdown] = useState(null);
    const [selectedOptions, setSelectedOptions] = useState({});
    const fileInputRef = useRef(null);

    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            console.log('Uploaded file:', file.name);
            // Add further file handling logic here
        }
    };

    const sections = [
        {
            title: 'Section 1: Attitudes & Preferences',
            questions: [
                {
                    id: 'Q1',
                    text: 'How often do you consume pastries/desserts?',
                    options: ['Daily', '2-3 times a week', 'Once a week', 'Once a month or less']
                },
                {
                    id: 'Q2',
                    text: 'When choosing pastries, what factors matter most to you? (Rank top 3)',
                    options: ['Taste', 'Price', 'Healthiness', 'Brand']
                },
                {
                    id: 'Q3',
                    text: 'Would you be interested in healthier pastry options (e.g., reduced sugar, gluten-free, whole grains, plant-based ingredients)?',
                    options: ['Very interested', 'Somewhat interested', 'Not interested', 'Unsure']
                },
            ]
        },
        {
            title: 'Section 2: Perceptions & Acceptance',
            questions: [
                {
                    id: 'Q4',
                    text: 'Do you believe pastries can be made "healthier" without losing taste?',
                    options: ['Yes, definitely', 'Yes, possibly', 'No, not really', 'No, not at all']
                },
                {
                    id: 'Q5',
                    text: 'If a healthy gourmet patisserie opened in Whitefield, how likely are you to try it?',
                    options: ['Very likely', 'Somewhat likely', 'Not likely', 'I would not try it']
                },
                {
                    id: 'Q6',
                    text: 'What would make you choose a healthier pastry over a regular one?',
                    options: ['Better taste', 'Lower price', 'Clear nutritional info', 'Recommendation']
                },
            ]
        },
        {
            title: 'Section 3: Pricing & Purchase Intent',
            questions: [
                {
                    id: 'Q7',
                    text: 'What is your budget for a single pastry?',
                    options: ['Less than $3', '$3 - $5', '$5 - $7', 'More than $7']
                },
                {
                    id: 'Q8',
                    text: 'How much more would you be willing to pay for a healthier pastry?',
                    options: ['Nothing extra', 'Up to 10% more', '10-25% more', 'More than 25% more']
                },
                {
                    id: 'Q9',
                    text: 'Where do you typically buy pastries?',
                    options: ['Supermarket', 'Local bakery', 'Cafe/Coffee shop', 'Gourmet patisserie']
                },
            ]
        }
    ];

    return (
        <div className="p-4 md:p-8 min-h-screen relative">
            <div className="max-w-7xl mx-auto relative z-10">
                {/* Header Section */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
                                    title="Go Back"
                                >
                                    <TbArrowLeft className="w-6 h-6" />
                                </button>
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                    Questionnaire Builder
                                </h1>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                Review and customize the questions for your target audience.
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium border border-blue-100 dark:border-blue-500/20">
                                <span>✨ Omi Suggestions Active</span>
                            </div> */}

                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <button
                                onClick={handleUploadClick}
                                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition-colors font-medium"
                            >
                                <TbUpload size={18} />
                                <span>Upload</span>
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* Main Content */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    {sections.map((section, sectionIndex) => (
                        <div key={sectionIndex} className="mb-8">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4 pl-1 border-l-4 border-blue-500">
                                {section.title}
                            </h3>

                            <div className="space-y-4">
                                {section.questions.map((question) => (
                                    <div
                                        key={question.id}
                                        className={`bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative ${openDropdown === question.id ? 'z-20' : 'z-auto'}`}
                                    >
                                        <div className="flex flex-col md:flex-row md:items-start gap-4">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-sm">
                                                {question.id}
                                            </div>

                                            <div className="flex-grow space-y-3">
                                                <p className="text-gray-900 dark:text-gray-100 font-medium text-lg leading-snug">
                                                    {question.text}
                                                </p>

                                                <div className="relative">
                                                    <button
                                                        onClick={() => setOpenDropdown(openDropdown === question.id ? null : question.id)}
                                                        className={`w-full md:w-auto min-w-[240px] flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-left transition-all ${selectedOptions[question.id]
                                                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30'
                                                            : 'bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-transparent hover:bg-gray-100 dark:hover:bg-white/10'
                                                            }`}
                                                    >
                                                        <span className="truncate">
                                                            {selectedOptions[question.id] || 'Select an option to preview...'}
                                                        </span>
                                                        <TbChevronDown
                                                            className={`transition-transform duration-200 ${openDropdown === question.id ? 'rotate-180' : ''}`}
                                                        />
                                                    </button>

                                                    <AnimatePresence>
                                                        {openDropdown === question.id && (
                                                            <motion.div
                                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="absolute left-0 top-full mt-2 w-full md:w-72 bg-white/90 dark:bg-[#0f0f0f]/95 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
                                                            >
                                                                <div className="p-1.5 max-h-60 overflow-y-auto no-scrollbar">
                                                                    {question.options.map(option => (
                                                                        <button
                                                                            key={option}
                                                                            onClick={() => {
                                                                                setSelectedOptions(prev => ({ ...prev, [question.id]: option }));
                                                                                setOpenDropdown(null);
                                                                            }}
                                                                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between group ${selectedOptions[question.id] === option
                                                                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'
                                                                                }`}
                                                                        >
                                                                            <span className="font-medium">{option}</span>
                                                                            {selectedOptions[question.id] === option && (
                                                                                <TbCheck size={16} className="text-white" />
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </motion.div>

                {/* Footer Action */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex justify-end pt-8 pb-12 mb-16"
                >
                    <button
                        onClick={() => navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/survey-results`)}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all flex items-center gap-2"
                    >
                        <span>Confirm & Launch Survey</span>
                        <TbSend size={20} />
                    </button>
                </motion.div>
            </div>
        </div>
    );
};

export default Questionnaire;
