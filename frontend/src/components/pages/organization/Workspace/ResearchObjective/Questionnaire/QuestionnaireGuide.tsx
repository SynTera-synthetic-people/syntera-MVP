import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {TbX} from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import QuestionModal, { TYPE_META } from './QuestionModal';
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
import { toApiPayload, makeId, type Section } from './questionCodec';
import './QuestionnaireGuide.css';

// ── Question Types ─────────────────────────────────────────────────────────────

export type { Question };
export type { QuestionType } from './QuestionModal';
export type { Section };

const unwrapMutationData = (response: any) => response?.data ?? response;

/**
 * Turn an axios/API rejection into a sentence worth showing a researcher.
 *
 * The questionnaire endpoints answer an invalid question with
 * `422 {detail: "single_select requires at least one option"}`, which is
 * already user-readable. FastAPI's own schema failures use the list form.
 */
const extractApiError = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
        const messages = detail
            .map((d: any) => (typeof d === 'string' ? d : d?.msg))
            .filter(Boolean);
        if (messages.length) return messages.join('; ');
    }
    const message = err?.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (err instanceof Error && err.message) return err.message;
    return fallback;
};

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
const DatePickerPreview: React.FC<{ label?: string }> = ({ label = 'Calendar' }) => (
    <div className="qdg-preview qdg-preview--datepicker">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className="qdg-datepicker-badge">{label}</span>
    </div>
);

/**
 * Horizontally scrollable viewport with edge affordances.
 *
 * A bare `overflow-x: auto` is invisible on this dark surface until the user
 * happens to drag over it, so the fact that content continues past the right
 * edge goes unnoticed. This wraps the content in a scroller that shows a fade
 * on whichever side still has content off-screen, and exposes a visible
 * scrollbar. Both edges are re-measured on scroll and on resize, so the hints
 * stay honest as columns are added or the card is resized.
 */
const HScrollArea: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ left: false, right: false });

    const syncEdges = useCallback(() => {
        const el = viewportRef.current;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        // 1px slack absorbs sub-pixel layout rounding, which would otherwise
        // leave the fade stuck on at either end of the track.
        setEdges({
            left: el.scrollLeft > 1,
            right: maxScroll - el.scrollLeft > 1,
        });
    }, []);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        syncEdges();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(syncEdges);
        observer.observe(el);
        // The table itself grows when a column is added — the viewport's own
        // box may not change, so observe the content too. React keeps the same
        // node across re-renders, so observing once here is enough; `children`
        // is deliberately not a dep, since a fresh element identity every
        // render would tear the observer down and rebuild it every render.
        if (el.firstElementChild) observer.observe(el.firstElementChild);
        return () => observer.disconnect();
    }, [syncEdges]);

    return (
        <div
            className={[
                'qdg-hscroll',
                edges.left ? 'qdg-hscroll--fade-left' : '',
                edges.right ? 'qdg-hscroll--fade-right' : '',
            ].filter(Boolean).join(' ')}
        >
            <div className="qdg-hscroll__viewport" ref={viewportRef} onScroll={syncEdges}>
                {children}
            </div>
        </div>
    );
};

/** Placeholder content shown while a grid is still being authored. */
const GRID_PLACEHOLDER_COLUMNS = ['Core Attributes', 'Core Attributes'];
const GRID_PLACEHOLDER_ROWS = [
    'Value for money', 'Performance speed', 'Level of security',
    'Level of security', 'Level of security', 'Level of security',
    'Level of security', 'ease of use',
];

/**
 * Grid-style types — renders every column the question defines.
 *
 * Grids routinely carry six to ten entities/scale points, which is far more
 * than the card width fits. Each column holds a readable min-width and the
 * table scrolls horizontally rather than being truncated to the first two.
 */
const GridPreview: React.FC<{ rows: string[]; columns: string[] }> = ({ rows, columns }) => {
    const filledColumns = columns.filter(Boolean);
    const filledRows = rows.filter(Boolean);
    const displayColumns = filledColumns.length ? filledColumns : GRID_PLACEHOLDER_COLUMNS;
    const displayRows = filledRows.length ? filledRows : GRID_PLACEHOLDER_ROWS;

    return (
        <div className="qdg-preview qdg-preview--grid">
            <HScrollArea>
                <table className="qdg-grid-table">
                    <thead>
                        <tr>
                            {displayColumns.map((col, i) => (
                                // Columns are a fixed width, so long labels
                                // ellipsize — `title` keeps them recoverable.
                                <th key={i} title={col}>{col}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((row, i) => (
                            <tr key={i}>
                                {displayColumns.map((_, j) => (
                                    <td key={j} title={row}>{row}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </HScrollArea>
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
            return <GridPreview rows={q.rows ?? []} columns={q.columns ?? []} />;

        // Side-by-side authors its rows and columns in dedicated fields, not
        // the shared rows/columns pair the other grids use.
        case 'side_by_side_grid':
            return <GridPreview rows={q.sxsAttributes ?? []} columns={q.sxsScalePoints ?? []} />;

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
    const [saveError, setSaveError] = useState<string | null>(null);
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

    /**
     * Ids this session has just created on the server.
     *
     * `persistedSectionIds` is derived from the `initialSections` prop, which
     * only catches up after the parent re-renders. Adding a question to a
     * section created moments earlier would otherwise be judged
     * "not persisted" and skipped. These refs close that window.
     */
    const confirmedSectionIds = useRef<Set<string>>(new Set());
    const confirmedQuestionIds = useRef<Set<string>>(new Set());

    const isPersistedSection = (id: string) =>
        persistedSectionIds.has(id) || confirmedSectionIds.current.has(id);
    const isPersistedQuestion = (id: string) =>
        persistedQuestionIds.has(id) || confirmedQuestionIds.current.has(id);

    /**
     * Always holds the newest section list.
     *
     * Every mutation helper below awaits a network round-trip before writing
     * state, and each mutation invalidates the questionnaire cache — so a
     * refetch can land mid-await. Reading `sections` from the render closure
     * at that point would write a stale snapshot back and silently discard the
     * refetched data (a question added moments earlier would vanish).
     */
    const sectionsRef = useRef<Section[]>(sections);

    useEffect(() => {
        const next = initialSections ?? [];
        sectionsRef.current = next;
        setSections(next);
    }, [initialSections]);

    const updateSections = (updater: (prev: Section[]) => Section[]) => {
        const next = updater(sectionsRef.current);
        sectionsRef.current = next;
        setSections(next);
        onSectionsChange?.(next);
    };

    // ── Section helpers ───────────────────────────────────────────────────────

    const addSection = async () => {
        if (creatingSection) return;
        setCreatingSection(true);
        setSaveError(null);
        try {
            const savedSection = workspaceId && explorationId
                ? unwrapMutationData(await createSectionMutation.mutateAsync({ title: 'New Section' }))
                : null;

            // A section that only exists locally cannot hold questions — the
            // question endpoints are keyed by a server section id. Surface the
            // failure instead of adding a section that silently swallows work.
            if (workspaceId && explorationId && !savedSection?.id) {
                throw new Error('Could not create the section. Please try again.');
            }

            const newSection: Section = {
                id: savedSection?.id || makeId(),
                title: savedSection?.title || 'New Section',
                questions: [],
            };
            if (savedSection?.id) confirmedSectionIds.current.add(savedSection.id);
            updateSections((prev) => [...prev, newSection]);
            cancelRenameRef.current = false;
            setRenamingSection(newSection.id);
            setRenameValue(newSection.title);
        } catch (err) {
            console.error('Failed to create questionnaire section:', err);
            setSaveError(extractApiError(err, 'Could not create the section. Please try again.'));
        } finally {
            setCreatingSection(false);
        }
    };

    const deleteSection = async (sectionId: string) => {
        if (deletingSectionId) return;
        setDeletingSectionId(sectionId);
        setSaveError(null);
        try {
            if (workspaceId && explorationId && isPersistedSection(sectionId)) {
                await deleteSectionMutation.mutateAsync({ sectionId });
            }
            updateSections((prev) => prev.filter((s) => s.id !== sectionId));
        } catch (err) {
            console.error('Failed to delete questionnaire section:', err);
            setSaveError(extractApiError(err, 'Could not delete the section. Please try again.'));
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
            if (workspaceId && explorationId && isPersistedSection(sectionId)) {
                await updateSectionMutation.mutateAsync({ sectionId, title });
            }
            updateSections((prev) => prev.map((s) =>
                s.id === sectionId ? { ...s, title } : s
            ));
            setRenamingSection(null);
        } catch (err) {
            console.error('Failed to rename questionnaire section:', err);
            setSaveError(extractApiError(err, 'Could not rename the section. Please try again.'));
        } finally {
            pendingSectionSaveIds.current.delete(sectionId);
            setSavingSectionId(null);
        }
    };

    // ── Question helpers ──────────────────────────────────────────────────────

    const openAddModal = (sectionId: string) => {
        setSaveError(null);
        setEditTarget({ sectionId, question: null });
        setModalOpen(true);
    };

    const openEditModal = (sectionId: string, question: Question) => {
        setSaveError(null);
        setEditTarget({ sectionId, question });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditTarget(null);
        setSaveError(null);
    };

    const saveQuestion = async (q: Question) => {
        if (!editTarget || pendingQuestionSave.current) return;

        const target = editTarget;
        const existingQuestionId = target.question?.id;
        pendingQuestionSave.current = true;
        setSaveError(null);
        setSavingQuestionId(existingQuestionId || q.id);

        try {
            const payload = toApiPayload(q);

            const isEdit = Boolean(existingQuestionId && isPersistedQuestion(existingQuestionId));
            const canPersist = Boolean(workspaceId && explorationId
                && (isEdit || isPersistedSection(target.sectionId)));

            // Never accept a question we cannot store. The previous behaviour
            // added it to local state anyway, so it looked saved and then
            // disappeared on the next reload.
            if (!canPersist) {
                throw new Error(
                    'This section has not finished saving yet. Please wait a moment and try again.'
                );
            }

            const savedQuestion = isEdit
                ? unwrapMutationData(await updateQuestionMutation.mutateAsync({ questionId: existingQuestionId!, ...payload }))
                : unwrapMutationData(await createQuestionMutation.mutateAsync({ sectionId: target.sectionId, ...payload }));

            // Keep the authored shape and take only identity from the server —
            // the canonical response carries `options[]` but not the modal's
            // type-specific fields, which the preview renders from.
            const nextQuestion: Question = {
                ...q,
                id: savedQuestion?.id || existingQuestionId || q.id,
                text: savedQuestion?.text ?? q.text,
            };
            if (savedQuestion?.id) confirmedQuestionIds.current.add(savedQuestion.id);

            updateSections((prev) => prev.map((s) => {
                if (s.id !== target.sectionId) return s;
                const targetId = existingQuestionId || nextQuestion.id;
                const exists = s.questions.some((eq) => eq.id === targetId);
                return {
                    ...s,
                    questions: exists
                        ? s.questions.map((eq) => (eq.id === targetId ? nextQuestion : eq))
                        : [...s.questions, nextQuestion],
                };
            }));
            closeModal();
        } catch (err) {
            console.error('Failed to save questionnaire question:', err);
            setSaveError(extractApiError(err, 'Could not save this question. Please try again.'));
        } finally {
            pendingQuestionSave.current = false;
            setSavingQuestionId(null);
        }
    };

    const deleteQuestion = async (sectionId: string, questionId: string) => {
        if (deletingQuestionId) return;
        setDeletingQuestionId(questionId);
        setSaveError(null);
        try {
            if (workspaceId && explorationId && isPersistedQuestion(questionId)) {
                await deleteQuestionMutation.mutateAsync({ questionId });
            }
            updateSections((prev) => prev.map((s) =>
                s.id === sectionId
                    ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) }
                    : s
            ));
        } catch (err) {
            console.error('Failed to delete questionnaire question:', err);
            setSaveError(extractApiError(err, 'Could not delete the question. Please try again.'));
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

            {/* ── Save error ── */}
            <AnimatePresence>
                {saveError && (
                    <motion.div
                        className="qdg-save-error"
                        role="alert"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                    >
                        <SpIcon name="sp-Warning-Circle_Warning" size={16} className="qdg-save-error__icon" />
                        <span className="qdg-save-error__text">{saveError}</span>
                        <button
                            className="qdg-save-error__close"
                            onClick={() => setSaveError(null)}
                            aria-label="Dismiss error"
                        >
                            <TbX size={14} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

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
                    Create Sample
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
                        saveError={saveError}
                        isSaving={!!savingQuestionId}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default QuestionnaireGuide;
