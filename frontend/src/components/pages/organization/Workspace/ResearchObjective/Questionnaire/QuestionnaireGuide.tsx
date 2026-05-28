import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {TbX} from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import QuestionModal, { defaultQuestion, TYPE_META } from './QuestionModal';
import type { Question } from './QuestionModal';
import {
    useCreateQuestionnaireQuestion,
    useCreateQuestionnaireSection,
    useDeleteQuestionnaireQuestion,
    useDeleteQuestionnaireSection,
    useUpdateQuestionnaireQuestion,
    useUpdateQuestionnaireSection,
} from '../../../../../../hooks/useQuantitativeQueries';
import { downloadExplorationQuestionnaireCsv } from '../../../../../../services/quantitativeServices';
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

const MODAL_TO_BACKEND_TYPE: Partial<Record<Question['type'], string>> = {
    single_select_grid: 'grid_single_select',
    rank_sort: 'ranking',
    video_player_embed: 'video_player_url',
};

const buildQuestionApiPayload = (q: Question) => {
    const question_type = MODAL_TO_BACKEND_TYPE[q.type] || q.type;

    let options: string[] = [];
    switch (q.type) {
        case 'single_select':
        case 'multi_select':
        case 'dropdown':
            options = (q.options || []).filter(Boolean);
            break;
        case 'button_rating':
            options = (q.buttonRatingRows || []).filter(Boolean);
            break;
        case 'single_select_grid':
            options = (q.rows || []).filter(Boolean);
            break;
        case 'this_or_that':
            options = [...(q.leftOptions || []), ...(q.rightOptions || [])].filter(Boolean);
            break;
        case 'star_rating':
            options = (q.starTooltips || []).filter(Boolean);
            break;
        case 'rating_scale':
            options = (q.scaleRows || []).filter(Boolean);
            break;
        case 'card_rating':
            options = (q.cardRatingCards || []).filter(Boolean);
            break;
        case 'slider_rating':
        case 'slider':
            options = (q.sliders || []).filter(Boolean);
            break;
        case 'rank_sort':
            options = (q.rankItems || []).filter(Boolean);
            break;
        case 'card_sort':
            options = (q.cards || []).filter(Boolean);
            break;
        case 'maxdiff':
            options = (q.attributes || []).filter(Boolean);
            break;
        default:
            options = [];
    }

    const config: Record<string, unknown> = {};
    if (q.instruction) config.instruction = q.instruction;

    switch (q.type) {
        case 'single_select':
            config.min_select = 1;
            config.max_select = 1;
            break;
        case 'multi_select':
            config.min_select = 1;
            config.max_select = options.length || 1;
            break;
        case 'dropdown':
            config.min_select = 1;
            config.max_select = 1;
            config.searchable = false;
            break;
        case 'this_or_that':
            config.left_options = (q.leftOptions || []).filter(Boolean);
            config.right_options = (q.rightOptions || []).filter(Boolean);
            config.columns = (q.columns || []).filter(Boolean);
            break;
        case 'single_select_grid':
            config.rows = (q.rows || []).filter(Boolean).map((row) => ({ text: row }));
            config.columns = (q.columns || []).filter(Boolean).map((column) => ({ text: column }));
            break;
        case 'button_rating':
            config.rows = (q.buttonRatingRows || []).filter(Boolean);
            break;
        case 'star_rating':
            config.max_stars = (q.starTooltips || []).length || 5;
            config.star_tooltip = q.starTooltips?.[0] || '';
            config.rows = (q.starRows || []).filter(Boolean);
            break;
        case 'rating_scale':
            config.rows = (q.scaleRows || []).filter(Boolean);
            config.columns = (q.scaleColumns || []).filter(Boolean);
            config.scale = { min: 1, max: (q.scaleColumns || []).length || 5, step: 1 };
            break;
        case 'card_rating':
            config.cards = (q.cardRatingCards || []).filter(Boolean);
            config.buttons = (q.cardRatingButtons || []).filter(Boolean);
            break;
        case 'slider_rating':
            config.sliders = (q.sliders || []).filter(Boolean);
            config.points = (q.sliderPoints || []).filter(Boolean);
            config.scale = { min: 0, max: 100, step: 1 };
            break;
        case 'slider':
            config.sliders = (q.sliders || []).filter(Boolean);
            config.scale = { min: 0, max: 100, step: 1 };
            break;
        case 'rank_sort':
            config.rank_labels = (q.rankLabels || []).filter(Boolean);
            config.rankable_items = (q.rankItems || []).filter(Boolean);
            break;
        case 'card_sort':
            config.cards = (q.cards || []).filter(Boolean);
            config.buckets = (q.buckets || []).filter(Boolean);
            break;
        case 'maxdiff':
            config.attributes = (q.attributes || []).filter(Boolean);
            config.columns = (q.maxdiffColumns || []).filter(Boolean);
            break;
        case 'auto_suggest':
            config.source_file_name = q.autoSuggestSourceFileName || '';
            break;
        case 'image_map':
            config.markers = (q.imageMapMarkers || []).filter(Boolean);
            config.images = (q.imageMapFiles || []).map((file) => ({ name: file.name }));
            break;
        case 'page_turner':
            config.pages = (q.pageTurnerPages || []).map((file) => ({ name: file.name }));
            break;
        case 'video_player':
            config.video_filename = q.videoFileName || '';
            break;
        case 'video_player_embed':
            config.name = q.videoEmbedName || '';
            config.url = q.videoEmbedUrl || '';
            break;
        case 'image_upload':
            config.images = (q.imageUploadFiles || []).map((file) => ({ name: file.name }));
            break;
        case 'section':
            config.section_name = q.sectionName || '';
            break;
        case 'note':
            config.note_text = q.noteText || '';
            break;
        case 'exec':
            config.exec_instruction = q.execInstruction || '';
            break;
        case 'autosum':
            config.rows = (q.rows || []).filter(Boolean);
            config.columns = (q.columns || []).filter(Boolean);
            break;
        default:
            break;
    }

    return { text: q.text, options, question_type, config };
};

const unwrapMutationData = (response: any) => response?.data ?? response;

// ── Question preview renderers ─────────────────────────────────────────────────

const MAX_VISIBLE = 7;

/**
 * Pill-chip list — used by multi_select / single_select / dropdown / rank_sort / card_sort / maxdiff / this_or_that
 */
const PillPreview: React.FC<{ items: string[] }> = ({ items }) => {
    const filtered = items.filter(Boolean);
    if (!filtered.length) return null;
    const visible = filtered.slice(0, MAX_VISIBLE);
    const overflow = filtered.length - MAX_VISIBLE;
    return (
        <div className="qdg-preview qdg-preview--pills">
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

/** Number / number_decimal — shows a single input-style box with a placeholder number */
const NumberPreview: React.FC = () => (
    <div className="qdg-preview qdg-preview--number">
        <div className="qdg-preview-input-mock">1234567890</div>
    </div>
);

/** Autosum / constant_sum / chip_allocation / sum_locked_sliders — shows small numbered badge chips */
const AutosumPreview: React.FC<{ min?: number; max?: number }> = ({ min = 22, max = 23 }) => (
    <div className="qdg-preview qdg-preview--autosum">
        <span className="qdg-autosum-badge">{min}</span>
        <span className="qdg-autosum-badge">{max}</span>
    </div>
);

/** text / essay / validated_input / ai_probed_open — full-width input mock */
const TextPreview: React.FC<{ placeholder?: string }> = ({ placeholder }) => (
    <div className="qdg-preview qdg-preview--text">
        <div className="qdg-text-input-mock">{placeholder || 'Can you walk me through a recent challenge you faced in your startup?'}</div>
    </div>
);

/** date_picker — shows a "Calendar" badge */
const DatePickerPreview: React.FC = () => (
    <div className="qdg-preview qdg-preview--datepicker">
        <span className="qdg-datepicker-badge">Calendar</span>
    </div>
);

/** Grid-style types — two-column table preview */
const GridPreview: React.FC<{ rows: string[]; columns: string[] }> = ({ rows, columns }) => {
    const colA = columns[0] || 'Core Attributes';
    const colB = columns[1] || 'Core Attributes';
    const displayRows = rows.length ? rows : [
        'Value for money', 'Performance speed', 'Level of security',
        'Level of security', 'Level of security', 'Level of security',
        'Level of security', 'ease of use',
    ];
    return (
        <div className="qdg-preview qdg-preview--grid">
            <table className="qdg-grid-table">
                <thead>
                    <tr>
                        <th>{colA}</th>
                        <th>{colB}</th>
                    </tr>
                </thead>
                <tbody>
                    {displayRows.map((row, i) => (
                        <tr key={i}>
                            <td>{row}</td>
                            <td>{row}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

/** video_player / video_player_embed / video_capture — play-icon row with filename */
const VideoPreview: React.FC<{ filename?: string }> = ({ filename = 'video.mp4' }) => (
    <div className="qdg-preview qdg-preview--media">
        <div className="qdg-media-row">
            <span className="qdg-media-icon qdg-media-icon--video">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeWidth="1"/>
                    <polygon points="6.5,5 11.5,8 6.5,11" fill="currentColor"/>
                </svg>
            </span>
            <span className="qdg-media-filename">{filename}</span>
        </div>
    </div>
);

/** image_upload / image_single_select / image_multi_select / heatmap / image_map / page_turner / stimulus_display */
const ImagePreview: React.FC<{ filenames?: string[] }> = ({ filenames = ['image.jpeg', 'image.jpeg'] }) => (
    <div className="qdg-preview qdg-preview--media">
        {filenames.map((f, i) => (
            <div key={i} className="qdg-media-row">
                <span className="qdg-media-icon qdg-media-icon--image">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="0.5" y="0.5" width="13" height="13" rx="2" stroke="currentColor"/>
                        <circle cx="4.5" cy="4.5" r="1.5" fill="currentColor"/>
                        <path d="M0.5 9.5L4 6.5L6.5 9L9 7L13.5 11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </span>
                <span className="qdg-media-filename">{f}</span>
            </div>
        ))}
    </div>
);

/** auto_suggest source file / import_data */
const DataFilePreview: React.FC<{ filenames?: string[] }> = ({ filenames = ['datafile.csv'] }) => (
    <div className="qdg-preview qdg-preview--media">
        {filenames.map((f, i) => (
            <div key={i} className="qdg-media-row">
                <span className="qdg-media-icon qdg-media-icon--file">
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                        <path d="M1 1.5C1 0.947 1.448 0.5 2 0.5H7.586L11 3.914V12.5C11 13.052 10.552 13.5 10 13.5H2C1.448 13.5 1 13.052 1 12.5V1.5Z" stroke="currentColor"/>
                        <path d="M7.5 0.5V3.5H11" stroke="currentColor" strokeLinecap="round"/>
                        <line x1="3.5" y1="6.5" x2="8.5" y2="6.5" stroke="currentColor" strokeLinecap="round"/>
                        <line x1="3.5" y1="8.5" x2="8.5" y2="8.5" stroke="currentColor" strokeLinecap="round"/>
                        <line x1="3.5" y1="10.5" x2="6.5" y2="10.5" stroke="currentColor" strokeLinecap="round"/>
                    </svg>
                </span>
                <span className="qdg-media-filename">{f}</span>
            </div>
        ))}
    </div>
);

/**
 * Master dispatcher — maps every QuestionType from QuestionModal to its preview.
 */
const QuestionPreview: React.FC<{ q: Question }> = ({ q }) => {
    switch (q.type) {

        case 'text':
        case 'essay':
        case 'validated_input':
        case 'auto_suggest':
        case 'ai_probed_open':
        case 'chatbot_dialog':
            return <TextPreview placeholder={q.text} />;

        case 'number':
        case 'number_decimal':
        case 'calculator_input':
            return <NumberPreview />;

        case 'date_picker':
            return <DatePickerPreview />;

        case 'single_select':
        case 'button_single_select':
        case 'binary_yes_no':
        case 'dropdown': {
            const items = q.options ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'image_single_select': {
            const files = (q.imageUploadFiles ?? []).map(f => f.name);
            return files.length ? <ImagePreview filenames={files} /> : <ImagePreview />;
        }

        case 'multi_select':
        case 'button_multi_select':
        case 'top_n_select':
        case 'constant_n_select': {
            const items = q.options ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'image_multi_select': {
            const files = (q.imageUploadFiles ?? []).map(f => f.name);
            return files.length ? <ImagePreview filenames={files} /> : <ImagePreview />;
        }

        case 'single_select_grid':
        case 'multi_select_grid':
        case 'mixed_format_grid':
        case 'side_by_side_grid':
            return <GridPreview rows={q.rows ?? []} columns={q.columns ?? []} />;

        case 'bipolar_grid': {
            const items = [...(q.leftOptions ?? []), ...(q.rightOptions ?? [])].filter(Boolean);
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'this_or_that': {
            const items = q.leftOptions ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'likert_scale':
        case 'importance_scale':
        case 'satisfaction_scale':
        case 'frequency_scale': {
            const items = q.scaleItems ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'star_rating': {
            const items = q.starRows ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'emoji_scale': {
            const items = q.emojiRows ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'slider':
        case 'slider_rating': {
            const items = q.sliders ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'slider_continuous':
        case 'vas_scale':
            return <AutosumPreview min={Number(q.sliderMin ?? 0)} max={Number(q.sliderMax ?? 100)} />;

        case 'nps':
            return <AutosumPreview min={0} max={10} />;

        case 'button_rating': {
            const items = q.buttonRatingRows ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'rating_scale':
            return <GridPreview rows={q.scaleRows ?? []} columns={q.scaleColumns ?? []} />;

        case 'card_rating': {
            const items = q.cardRatingCards ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'constant_sum':
        case 'chip_allocation':
        case 'sum_locked_sliders': {
            const items = q.allocationItems ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'autosum':
            return <AutosumPreview />;

        case 'rank_sort': {
            const items = q.rankItems ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'top_n_ranking': {
            const items = q.rankItems ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'forced_distribution_ranking': {
            const items = q.rankingItems ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'pairwise_comparison':
        case 'pairwise_modeled': {
            const items = q.pairItems ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'maxdiff': {
            const items = q.attributes ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'cbc_conjoint':
        case 'acbc_conjoint':
        case 'menu_conjoint': {
            const items = q.conjointAttributes ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'card_sort': {
            const items = q.buckets ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'card_sort_open': {
            const items = q.cards ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'q_sort': {
            const items = q.qSortItems ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'drag_classify': {
            const items = q.buckets ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'image_map':
        case 'heatmap': {
            const files = ((q.imageMapFiles ?? q.heatmapFiles) ?? []).map(f => f.name);
            return files.length ? <ImagePreview filenames={files} /> : <ImagePreview />;
        }

        case 'map_pin':
            return q.mapCenter ? <TextPreview placeholder={q.mapCenter} /> : <DatePickerPreview />;

        case 'text_highlight':
            return q.highlightText ? <TextPreview placeholder={q.highlightText} /> : null;

        case 'image_upload': {
            const files = (q.imageUploadFiles ?? []).map(f => f.name);
            return files.length ? <ImagePreview filenames={files} /> : <ImagePreview />;
        }

        case 'audio_capture':
            return <DatePickerPreview />;

        case 'video_capture':
        case 'video_player': {
            const fn = q.videoFileName || 'video.mp4';
            return <VideoPreview filename={fn} />;
        }

        case 'video_player_embed': {
            const name = q.videoEmbedName || q.videoEmbedUrl || 'video.mp4';
            return <VideoPreview filename={name} />;
        }

        case 'page_turner': {
            const files = (q.pageTurnerPages ?? []).map(f => f.name);
            return files.length ? <ImagePreview filenames={files} /> : <ImagePreview />;
        }

        case 'signature_capture':
            return <DatePickerPreview />;

        case 'stimulus_display': {
            const files = (q.stimulusFiles ?? []).map(f => f.name);
            return files.length ? <ImagePreview filenames={files} /> : <ImagePreview />;
        }

        case 'iat': {
            const items = q.iatCategories ?? [];
            return items.length ? <PillPreview items={items} /> : null;
        }

        case 'reaction_time':
            return <NumberPreview />;

        case 'import_data':
            return <DataFilePreview />;

        case 'section':
        case 'note':
        case 'exec':
        case 'captcha_check':
            return null;

        default:
            return null;
    }
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

// ── Main component ────────────────────────────────────────────────────────────

interface QuestionnaireGuideProps {
    onConfirm: () => void;
    onUpload?: () => void;
    showReadyToast?: boolean;
    onDismissToast?: () => void;
    /** Pre-populated sections from the backend (LLM-generated or uploaded). */
    initialSections?: Section[];
    /** When true, hides all edit/delete/add controls. */
    isViewOnly?: boolean;
    workspaceId?: string | undefined;
    explorationId?: string | undefined;
    onSectionsChange?: (sections: Section[]) => void;
}

const QuestionnaireGuide: React.FC<QuestionnaireGuideProps> = ({
    onConfirm,
    onUpload,
    showReadyToast = false,
    onDismissToast,
    initialSections,
    isViewOnly = false,
    workspaceId,
    explorationId,
    onSectionsChange,
}) => {
    const [sections, setSections] = useState<Section[]>(initialSections ?? []);
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = async () => {
        if (!workspaceId || !explorationId || isDownloading) return;
        setIsDownloading(true);
        try {
            await downloadExplorationQuestionnaireCsv({ workspaceId, explorationId });
        } catch (err) {
            console.error('Download questionnaire failed', err);
        } finally {
            setIsDownloading(false);
        }
    };

    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<{ sectionId: string; question: Question | null } | null>(null);

    const [openMenu, setOpenMenu] = useState<string | null>(null);

    const [renamingSection, setRenamingSection] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [creatingSection, setCreatingSection] = useState(false);
    const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
    const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
    const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);
    const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
    const pendingSectionSaveIds = useRef<Set<string>>(new Set());
    const pendingQuestionSave = useRef(false);
    const cancelRenameRef = useRef(false);

    const createSectionMutation = useCreateQuestionnaireSection(workspaceId, explorationId);
    const updateSectionMutation = useUpdateQuestionnaireSection(workspaceId, explorationId);
    const deleteSectionMutation = useDeleteQuestionnaireSection(workspaceId, explorationId);
    const createQuestionMutation = useCreateQuestionnaireQuestion(workspaceId, explorationId);
    const updateQuestionMutation = useUpdateQuestionnaireQuestion(workspaceId, explorationId);
    const deleteQuestionMutation = useDeleteQuestionnaireQuestion(workspaceId, explorationId);

    const persistedSectionIds = useMemo(
        () => new Set((initialSections ?? []).map((s) => s.id)),
        [initialSections]
    );

    const persistedQuestionIds = useMemo(
        () => new Set((initialSections ?? []).flatMap((s) => s.questions.map((q) => q.id))),
        [initialSections]
    );

    useEffect(() => {
        setSections(initialSections ?? []);
    }, [initialSections]);

    const updateSections = (updater: (prev: Section[]) => Section[]) => {
        const next = updater(sections);
        setSections(next);
        onSectionsChange?.(next);
    };

    // ── Section helpers ───────────────────────────────────────────────────────

    const addSection = async () => {
        if (creatingSection) return;
        setCreatingSection(true);
        try {
            const savedSection = workspaceId && explorationId
                ? unwrapMutationData(await createSectionMutation.mutateAsync({ title: 'New Section' }))
                : null;
            const newSection: Section = {
                id: savedSection?.id || makeId(),
                title: savedSection?.title || 'New Section',
                questions: [],
            };
            updateSections((prev) => [...prev, newSection]);
            cancelRenameRef.current = false;
            setRenamingSection(newSection.id);
            setRenameValue(newSection.title);
        } catch (err) {
            console.error('Failed to create questionnaire section:', err);
        } finally {
            setCreatingSection(false);
        }
    };

    const deleteSection = async (sectionId: string) => {
        if (deletingSectionId) return;
        setDeletingSectionId(sectionId);
        try {
            if (workspaceId && explorationId && persistedSectionIds.has(sectionId)) {
                await deleteSectionMutation.mutateAsync({ sectionId });
            }
            updateSections((prev) => prev.filter((s) => s.id !== sectionId));
        } catch (err) {
            console.error('Failed to delete questionnaire section:', err);
        } finally {
            setDeletingSectionId(null);
        }
    };

    const commitRename = async () => {
        if (cancelRenameRef.current) {
            cancelRenameRef.current = false;
            return;
        }
        if (!renamingSection || pendingSectionSaveIds.current.has(renamingSection)) return;

        const sectionId = renamingSection;
        const title = renameValue.trim() || 'New Section';
        pendingSectionSaveIds.current.add(sectionId);
        setSavingSectionId(sectionId);

        try {
            if (workspaceId && explorationId && persistedSectionIds.has(sectionId)) {
                await updateSectionMutation.mutateAsync({ sectionId, title });
            }
            updateSections((prev) => prev.map((s) =>
                s.id === sectionId ? { ...s, title } : s
            ));
            setRenamingSection(null);
        } catch (err) {
            console.error('Failed to rename questionnaire section:', err);
        } finally {
            pendingSectionSaveIds.current.delete(sectionId);
            setSavingSectionId(null);
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

    const saveQuestion = async (q: Question) => {
        if (!editTarget || pendingQuestionSave.current) return;

        const target = editTarget;
        const payload = buildQuestionApiPayload(q);
        const existingQuestionId = target.question?.id;
        pendingQuestionSave.current = true;
        setSavingQuestionId(existingQuestionId || q.id);

        try {
            const savedQuestion = workspaceId && explorationId && existingQuestionId && persistedQuestionIds.has(existingQuestionId)
                ? unwrapMutationData(await updateQuestionMutation.mutateAsync({ questionId: existingQuestionId, ...payload }))
                : workspaceId && explorationId && persistedSectionIds.has(target.sectionId)
                    ? unwrapMutationData(await createQuestionMutation.mutateAsync({ sectionId: target.sectionId, ...payload }))
                    : null;

            const nextQuestion: Question = {
                ...q,
                id: savedQuestion?.id || existingQuestionId || q.id,
                text: savedQuestion?.text ?? q.text,
                options: Array.isArray(savedQuestion?.options) ? savedQuestion.options.filter(Boolean) : q.options,
            };

            updateSections((prev) => prev.map((s) => {
                if (s.id !== target.sectionId) return s;
                const exists = existingQuestionId
                    ? s.questions.some((eq) => eq.id === existingQuestionId)
                    : s.questions.some((eq) => eq.id === nextQuestion.id);
                return {
                    ...s,
                    questions: exists
                        ? s.questions.map((eq) => eq.id === (existingQuestionId || nextQuestion.id) ? nextQuestion : eq)
                        : [...s.questions, nextQuestion],
                };
            }));
            closeModal();
        } catch (err) {
            console.error('Failed to save questionnaire question:', err);
        } finally {
            pendingQuestionSave.current = false;
            setSavingQuestionId(null);
        }
    };

    const deleteQuestion = async (sectionId: string, questionId: string) => {
        if (deletingQuestionId) return;
        setDeletingQuestionId(questionId);
        try {
            if (workspaceId && explorationId && persistedQuestionIds.has(questionId)) {
                await deleteQuestionMutation.mutateAsync({ questionId });
            }
            updateSections((prev) => prev.map((s) =>
                s.id === sectionId
                    ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) }
                    : s
            ));
        } catch (err) {
            console.error('Failed to delete questionnaire question:', err);
        } finally {
            setDeletingQuestionId(null);
        }
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
                            <div className="qdg-section__num">{sIdx + 1}</div>

                            {/* Section rename — disabled in view-only mode */}
                            {!isViewOnly && renamingSection === section.id ? (
                                <input
                                    autoFocus
                                    className="qdg-section__rename-input"
                                    value={renameValue}
                                    disabled={savingSectionId === section.id}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitRename();
                                        if (e.key === 'Escape') {
                                            cancelRenameRef.current = true;
                                            setRenamingSection(null);
                                        }
                                    }}
                                />
                            ) : (
                                <>
                                    <h3 className="qdg-section__title">{section.title}</h3>
                                    {/* Edit pencil — hidden in view-only mode */}
                                    {!isViewOnly && (
                                        <button
                                            className="qdg-section__pencil"
                                            onClick={() => { cancelRenameRef.current = false; setRenamingSection(section.id); setRenameValue(section.title); }}
                                            aria-label="Rename section"
                                            disabled={savingSectionId === section.id}
                                        >
                                            <SpIcon name="sp-Edit-Edit_Pencil_01" size={16} />
                                        </button>
                                    )}
                                </>
                            )}

                            <div className="qdg-section__spacer" />

                            {/* Delete section — hidden in view-only mode */}
                            {!isViewOnly && (
                                <button
                                    className="qdg-section__icon-btn qdg-section__icon-btn--danger"
                                    onClick={() => deleteSection(section.id)}
                                    aria-label="Delete section"
                                    disabled={deletingSectionId === section.id || savingSectionId === section.id}
                                >
                                    <SpIcon name="sp-Interface-Trash_Full" size={15} />
                                </button>
                            )}
                        </div>

                        {/* Questions */}
                        <div className="qdg-questions">
                            {section.questions.map((q, qIdx) => (
                                <div key={q.id} className="qdg-question">
                                    <div className="qdg-question__top-row">
                                        <span className="qdg-question__num">Q{qIdx + 1}.</span>

                                        <p className="qdg-question__text">{q.text}</p>

                                        <span className={`qdg-video-badge qdg-video-badge--${q.type}`}>
                                            {TYPE_META[q.type]?.label ?? q.type}
                                        </span>

                                        {/* Question kebab menu — hidden in view-only mode */}
                                        {!isViewOnly && (
                                            <div className="qdg-question__actions">
                                                <div className="qdg-q-menu-wrap">
                                                    <button
                                                        className="qdg-q-action-btn"
                                                        onClick={() => setOpenMenu(openMenu === q.id ? null : q.id)}
                                                        aria-label="More actions"
                                                        disabled={deletingQuestionId === q.id || savingQuestionId === q.id}
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
                                        )}
                                    </div>

                                    {/* ── Type-specific preview ── */}
                                    <QuestionPreview q={q} />
                                </div>
                            ))}
                        </div>

                        {/* Add Question — hidden in view-only mode */}
                        {!isViewOnly && (
                            <button className="qdg-add-question-btn" onClick={() => openAddModal(section.id)} disabled={!!savingQuestionId}>
                                <SpIcon name="sp-Edit-Add_Plus" size={13} />
                                Add Question
                            </button>
                        )}
                    </motion.div>
                ))}

                {/* Add New Section — hidden in view-only mode */}
                {!isViewOnly && (
                    <button className="qdg-add-section-btn" onClick={addSection} disabled={creatingSection}>
                        <SpIcon name="sp-Edit-Add_Plus" size={14} />
                        Add New Section
                    </button>
                )}
            </div>

            {/* ── Bottom action bar ── */}
            <div className="qdg-launch-bar">
                <button className="qdg-btn--outline" onClick={handleDownload} disabled={isDownloading}>
                    {isDownloading ? 'Downloading…' : 'Download Questionnaire'}
                    <SpIcon name="sp-File-File_Download" size={15} />
                </button>
                <button className="qdg-launch-btn" onClick={onConfirm}>
                    Create Population
                    <SpIcon name="sp-Arrow-Arrow_Right_SM" size={16} />
                </button>
            </div>

            {/* ── Modal — never reachable in view-only mode since all triggers are hidden ── */}
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
