import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TbX, TbTrash, TbPencil,
    TbPlus, TbDotsVertical, TbGripVertical, TbCheck,
    TbChevronDown, TbDownload, TbSend, TbInfoCircle, TbArrowNarrowRight,
} from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import QuestionModal, { defaultQuestion } from './QuestionModal';
import type { Question } from './QuestionModal';
import './QuestionnaireGuide.css';

// ── Question Types ─────────────────────────────────────────────────────────────

export type { Question };
export type { QuestionType } from './QuestionModal';

// ── Data types ────────────────────────────────────────────────────────────────

interface Section {
    id: string;
    title: string;
    questions: Question[];
}

// ── Default demo data ─────────────────────────────────────────────────────────

const makeId = () => Math.random().toString(36).slice(2, 8);

const INITIAL_SECTIONS: Section[] = [
    {
        id: makeId(),
        title: 'Section Name',
        questions: [
            {
                id: makeId(),
                type: 'multi_select',
                text: 'Can you walk me through a recent challenge you faced in your startup?',
                required: true,
                options: ['Design', 'Dev', 'Lack of transparency in pricing', 'Too many steps or platforms involved', 'Managing changes, cancellations, or disruptions', 'Not knowing where to start', 'Difficulty coordinating multiple providers (flights, hotels, etc.)', 'Difficulty using or understanding loyalty programs'],
            },
            {
                id: makeId(),
                type: 'single_select',
                text: 'Can you walk me through a recent challenge you faced in your startup?',
                required: false,
                options: ['Yes', 'No'],
            },
            {
                id: makeId(),
                type: 'rank_sort',
                text: 'Can you walk me through a recent challenge you faced in your startup?',
                required: false,
                rankItems: ['Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text'],
            },
        ],
    },
    {
        id: makeId(),
        title: 'Section Name',
        questions: [
            {
                id: makeId(),
                type: 'multi_select',
                text: 'Can you walk me through a recent challenge you faced in your startup?',
                required: true,
                options: ['Design', 'Dev', 'Lack of transparency in pricing', 'Too many steps or platforms involved', 'Managing changes, cancellations, or disruptions', 'Not knowing where to start', 'Difficulty coordinating multiple providers (flights, hotels, etc.)', 'Difficulty using or understanding loyalty programs'],
            },
            {
                id: makeId(),
                type: 'single_select',
                text: 'Can you walk me through a recent challenge you faced in your startup?',
                required: false,
                options: ['Yes', 'No'],
            },
            {
                id: makeId(),
                type: 'rank_sort',
                text: 'Can you walk me through a recent challenge you faced in your startup?',
                required: false,
                rankItems: ['Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text', 'Text text text text'],
            },
            {
                id: makeId(),
                type: 'single_select',
                text: 'Can you walk me through a recent challenge you faced in your startup?',
                required: false,
                options: ['Yes', 'No'],
            },
        ],
    },
];

// ── Options preview box ───────────────────────────────────────────────────────

const MAX_VISIBLE = 7;

interface OptionsBoxProps {
    items: string[];
}

const OptionsBox: React.FC<OptionsBoxProps> = ({ items }) => {
    const filtered = items.filter(Boolean);
    if (!filtered.length) return null;
    const visible = filtered.slice(0, MAX_VISIBLE);
    const overflow = filtered.length - MAX_VISIBLE;

    return (
        <div className="qdg-options-box">
            {visible.map((item, i) => (
                <div key={i} className="qdg-option-row">
                    <span className="qdg-option-pill">{item}</span>
                </div>
            ))}
            {overflow > 0 && (
                <div className="qdg-option-row">
                    <span className="qdg-options-overflow">+{overflow}</span>
                </div>
            )}
        </div>
    );
};

// ── Context menu ──────────────────────────────────────────────────────────────

interface QuestionMenuProps {
    onEdit: () => void;
    onDelete: () => void;
    onClose: () => void;
}

const QuestionMenu: React.FC<QuestionMenuProps> = ({ onEdit, onDelete, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    return (
        <div className="qdg-q-menu" ref={ref}>
            <button className="qdg-q-menu__item" onClick={() => { onEdit(); onClose(); }}>
                <SpIcon name="sp-Edit-Edit_Pencil_01" size={14} />
                Edit Question
            </button>
            <button className="qdg-q-menu__item qdg-q-menu__item--danger" onClick={() => { onDelete(); onClose(); }}>
                <SpIcon name="sp-Interface-Trash_Full" size={14} />
                Delete Question
            </button>
        </div>
    );
};

// ── Get preview items ─────────────────────────────────────────────────────────

const getPreviewItems = (q: Question): string[] => {
    switch (q.type) {
        case 'single_select':
        case 'multi_select':
        case 'dropdown':
            return q.options ?? [];
        case 'rank_sort':
            return q.rankItems ?? [];
        case 'card_sort':
            return q.buckets ?? [];
        case 'maxdiff':
            return q.attributes ?? [];
        case 'this_or_that':
            return q.leftOptions ?? [];
        case 'single_select_grid':
            return q.rows ?? [];
        default:
            return [];
    }
};

// ── Main component ────────────────────────────────────────────────────────────

interface QuestionnaireGuideProps {
    onConfirm: () => void;
    onUpload?: () => void;
    showReadyToast?: boolean;
    onDismissToast?: () => void;
}

const QuestionnaireGuide: React.FC<QuestionnaireGuideProps> = ({
    onConfirm,
    onUpload,
    showReadyToast = false,
    onDismissToast,
}) => {
    const [sections, setSections] = useState<Section[]>(INITIAL_SECTIONS);

    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<{ sectionId: string; question: Question | null } | null>(null);

    const [openMenu, setOpenMenu] = useState<string | null>(null);

    const [renamingSection, setRenamingSection] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // ── Section helpers ───────────────────────────────────────────────────────

    const addSection = () => {
        const newSection: Section = { id: makeId(), title: 'New Section', questions: [] };
        setSections((prev) => [...prev, newSection]);
        setRenamingSection(newSection.id);
        setRenameValue('New Section');
    };

    const deleteSection = (sectionId: string) => {
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
    };

    const commitRename = () => {
        if (renamingSection) {
            setSections((prev) => prev.map((s) =>
                s.id === renamingSection ? { ...s, title: renameValue.trim() || 'New Section' } : s
            ));
            setRenamingSection(null);
        }
    };

    // ── Question helpers ──────────────────────────────────────────────────────

    const openAddModal = (sectionId: string) => {
        setEditTarget({ sectionId, question: null });
        setModalOpen(true);
    };

    const openEditModal = (sectionId: string, question: Question) => {
        setEditTarget({ sectionId, question });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditTarget(null);
    };

    const saveQuestion = (q: Question) => {
        if (!editTarget) return;
        setSections((prev) => prev.map((s) => {
            if (s.id !== editTarget.sectionId) return s;
            const exists = s.questions.some((eq) => eq.id === q.id);
            return {
                ...s,
                questions: exists
                    ? s.questions.map((eq) => eq.id === q.id ? q : eq)
                    : [...s.questions, q],
            };
        }));
        closeModal();
    };

    const deleteQuestion = (sectionId: string, questionId: string) => {
        setSections((prev) => prev.map((s) =>
            s.id === sectionId
                ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) }
                : s
        ));
    };

    const activeSectionTitle = editTarget
        ? (sections.find((s) => s.id === editTarget.sectionId)?.title ?? '')
        : '';

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="qdg-page">

            {/* ── Page header ── */}
            <div className="qdg-page-header">
                <div>
                    <h1 className="qdg-page-title">Questionnaire</h1>
                    <p className="qdg-page-subtitle">
                        Structured to uncover behaviours, motivations, and decision triggers.
                    </p>
                </div>

                <div className="qdg-header-actions">
                    <AnimatePresence>
                        {showReadyToast && (
                            <motion.div
                                className="qdg-ready-toast"
                                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                                transition={{ duration: 0.22 }}
                            >
                                <span className="qdg-ready-toast__dot" />
                                <span>Your Questionnaire is Ready</span>
                                <button className="qdg-ready-toast__close" onClick={onDismissToast}>
                                    <TbX size={14} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Guide card ── */}
            <div className="qdg-guide-card">
                {sections.map((section, sIdx) => (
                    <motion.div
                        key={section.id}
                        className="qdg-section"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: sIdx * 0.04 }}
                    >
                        {/* Section header */}
                        <div className="qdg-section__header">
                            {/* FIX: use sIdx + 1 for sequential section numbers */}
                            <div className="qdg-section__num">{sIdx + 1}</div>

                            {renamingSection === section.id ? (
                                <input
                                    autoFocus
                                    className="qdg-section__rename-input"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitRename();
                                        if (e.key === 'Escape') setRenamingSection(null);
                                    }}
                                />
                            ) : (
                                <>
                                    <h3 className="qdg-section__title">{section.title}</h3>
                                    <button
                                        className="qdg-section__pencil"
                                        onClick={() => { setRenamingSection(section.id); setRenameValue(section.title); }}
                                        aria-label="Rename section"
                                    >
                                        <SpIcon name="sp-Edit-Edit_Pencil_01" size={16} />
                                    </button>
                                </>
                            )}

                            <div className="qdg-section__spacer" />

                            <button
                                className="qdg-section__icon-btn qdg-section__icon-btn--danger"
                                onClick={() => deleteSection(section.id)}
                                aria-label="Delete section"
                            >
                                <SpIcon name="sp-Interface-Trash_Full" size={15} />
                            </button>
                        </div>

                        {/* Questions */}
                        <div className="qdg-questions">
                            {section.questions.map((q, qIdx) => {
                                const previewItems = getPreviewItems(q);
                                return (
                                    <div key={q.id} className="qdg-question">
                                        <div className="qdg-question__top-row">
                                            <span className="qdg-question__num">Q{qIdx + 1}.</span>

                                            <p className="qdg-question__text">{q.text}</p>

                                            <span className="qdg-video-badge">Video</span>

                                            <div className="qdg-question__actions">
                                                <div className="qdg-q-menu-wrap">
                                                    <button
                                                        className="qdg-q-action-btn"
                                                        onClick={() => setOpenMenu(openMenu === q.id ? null : q.id)}
                                                        aria-label="More actions"
                                                    >
                                                        <SpIcon name="sp-Menu-More_Vertical" size={15} />
                                                    </button>
                                                    <AnimatePresence>
                                                        {openMenu === q.id && (
                                                            <motion.div
                                                                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                                                                transition={{ duration: 0.12 }}
                                                            >
                                                                <QuestionMenu
                                                                    onEdit={() => openEditModal(section.id, q)}
                                                                    onDelete={() => deleteQuestion(section.id, q.id)}
                                                                    onClose={() => setOpenMenu(null)}
                                                                />
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>

                                        {previewItems.length > 0 && (
                                            <OptionsBox items={previewItems} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* + Add Question */}
                        <button className="qdg-add-question-btn" onClick={() => openAddModal(section.id)}>
                            <SpIcon name="sp-Edit-Add_Plus" size={13} />
                            Add Question
                        </button>
                    </motion.div>
                ))}

                {/* + Add New Section */}
                <button className="qdg-add-section-btn" onClick={addSection}>
                    <SpIcon name="sp-Edit-Add_Plus" size={14} />
                    Add New Section
                </button>
            </div>

            {/* ── Bottom action bar ── */}
            <div className="qdg-launch-bar">
                <button className="qdg-btn--outline" onClick={() => { }}>
                    Download Questionnaire
                    <SpIcon name="sp-File-File_Download" size={15} />
                </button>
                <button className="qdg-launch-btn" onClick={onConfirm}>
                    Create Population
                    <SpIcon name="sp-Arrow-Arrow_Right_SM" size={16} />
                </button>
            </div>

            {/* ── Modal (now a separate component) ── */}
            <AnimatePresence>
                {modalOpen && editTarget && (
                    <QuestionModal
                        initial={editTarget.question}
                        sectionTitle={activeSectionTitle}
                        onSave={saveQuestion}
                        onClose={closeModal}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default QuestionnaireGuide;