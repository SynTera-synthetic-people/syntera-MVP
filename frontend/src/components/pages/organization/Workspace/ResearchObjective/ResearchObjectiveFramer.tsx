import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
    useCreateResearchObjectiveFromFramer,
    useSubmitFramerMaterialSection,
} from "../../../../../hooks/useOmiChat";
import "./ResearchObjectiveFramer.css";

import OmiIdle from "../../../../../assets/Omi Animations/IdleStateMotion_Lite.mp4";
import OmiPencil from "../../../../../assets/Omi Animations/OmiPencil.mp4";
import OmiKeyboard from "../../../../../assets/Omi Animations/OmiKeyboard.mp4";
import OmiSuccess from "../../../../../assets/Omi Animations/Omi Micro-Celebration_Lite.mp4";
import SpIcon from "../../../../SPIcon";
type OmiState = "idle" | "typing" | "navigating" | "success";

interface Competitor {
    id: string;
    name: string;
}

interface ContextData {
    companyName: string;
    industry: string;
    website: string;
    competitors: Competitor[];
    extraContext: string;
}

interface BusinessTriggerData {
    trigger: string;
}

interface CustomerUnknownData {
    unknown: string;
}

interface DecisionMomentData {
    decision: string;
}

interface AudienceSegmentsData {
    audience: string;
}

type MaterialUploadStatus = "idle" | "processing" | "done";

interface MaterialSlot {
    fileName: string | null;
    fileSizeLabel: string | null;
    uploadStatus: MaterialUploadStatus;
    // The actual selected File — kept so Submit can send the real bytes.
    // (fileName/fileSizeLabel alone were display-only and discarded the file.)
    file: File | null;
    // Base64 data URL of the file's contents. Unlike `file`, this string
    // DOES survive JSON.stringify/localStorage, so it's what lets the
    // read-only "Artifact" viewer on the Discussion Guide screen actually
    // show an image preview (or offer a download for non-image files)
    // instead of just a filename. Populated for Artifact-section files
    // right before they're marked submitted — see handleSubmitArtifact.
    dataUrl: string | null;
}

// A single URL entry (used within the Artifact section's link list)
interface MaterialLink {
    id: string;
    value: string;
}

// Research Brief section — own instruction, single URL field, single file upload, own submit lifecycle.
interface BriefSectionData {
    instruction: string;
    link: string;
    file: MaterialSlot;
    submitted: boolean;
}

// How Omi should relate multiple artifacts in this section to each other.
// Only meaningful once 2+ artifacts (links/file) are attached — with a
// single artifact there's nothing to compare/group/sequence.
type ArtifactCategory = "compare" | "campaign_set";

// The kind of creative asset this is — separate from ArtifactCategory
// (comparison mode) above. Drives dimension selection in the artifact
// stimulus pipeline (Stage 2) — must match one of the artifact_types keys
// in backend/app/data/artifact_dimensions_library.json. Required whenever
// at least one artifact (file or link) is attached, regardless of count.
type ArtifactContentCategory =
    | "ad_creative"
    | "product_concept"
    | "packaging"
    | "landing_page"
    | "pricing_offer"
    | "claim"
    | "script_storyboard";

// Artifact section — own instruction, up to ARTIFACT_MAX_LINKS URL fields,
// up to ARTIFACT_MAX_FILES file uploads, own submit lifecycle.
interface ArtifactSectionData {
    instruction: string;
    links: MaterialLink[];
    files: MaterialSlot[];
    category: ArtifactCategory | null;
    contentCategory: ArtifactContentCategory | null;
    submitted: boolean;
}

interface MaterialData {
    brief: BriefSectionData;
    artifact: ArtifactSectionData;
}

interface OtherInformationData {
    notes: string;
}

interface ROFramerData {
    context: ContextData;
    businessTrigger: BusinessTriggerData;
    customerUnknown: CustomerUnknownData;
    decisionMoment: DecisionMomentData;
    audienceSegments: AudienceSegmentsData;
    material: MaterialData;
    otherInformation: OtherInformationData;
    // Future tabs extend this interface as they are built
}

interface ResearchObjectiveFramerProps {
    onSubmit?: (data: ROFramerData) => void;
    onBack?: () => void;
}

function buildFramerPayload(data: ROFramerData) {
    return {
        brand_name: data.context.companyName || undefined,
        industry: data.context.industry || undefined,
        website: data.context.website || undefined,
        competitors: data.context.competitors.map(c => c.name),
        extra_context: data.context.extraContext || undefined,
        business_context: data.businessTrigger.trigger || undefined,
        information_gap: data.customerUnknown.unknown || undefined,
        decision_problem: data.decisionMoment.decision || undefined,
        target_audience: data.audienceSegments.audience || undefined,
        // Materials are NOT sent here — each section (Research Brief/Artifact)
        // is already submitted, extracted, and persisted against exploration_id
        // independently via its own "Submit" button (see MaterialTab). The
        // backend pulls them in itself at /from-framer time, keyed by
        // exploration_id, alongside this payload.
        additional_notes: data.otherInformation.notes || undefined,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local draft persistence — so users can revisit what they typed even though
// nothing is saved server-side until final Submit.
// ─────────────────────────────────────────────────────────────────────────────

const framerDraftKey = (objectiveId?: string) => `ro_framer_draft_${objectiveId ?? "unknown"}`;
const ARTIFACT_COMING_SOON = false;
// ─────────────────────────────────────────────────────────────────────────────
// Local "has this objective's Framer been submitted" flag.
//
// This is intentionally SEPARATE from the draft key above. The draft key is
// written on every keystroke while the user is filling the form out and is
// cleared the moment the final Submit succeeds — so it is NOT a reliable
// signal for "the user finished framing this objective" (in fact it's the
// opposite: it's truthy mid-fill and falsy right after a successful submit).
//
// The "Review your research framing →" entry point on the chat screen should
// only appear once the user has actually pressed Submit on the last step of
// the Framer, so we set this flag only inside the saveFramer onSuccess
// handler in handleContinue below, and never clear it as part of normal
// editing — it represents "has this objective ever had a Framer submission",
// not "is there currently unsaved framer state".
// ─────────────────────────────────────────────────────────────────────────────

const framerSubmittedKey = (objectiveId?: string) => `ro_framer_submitted_${objectiveId ?? "unknown"}`;

const markFramerSubmitted = (objectiveId?: string) => {
    try {
        localStorage.setItem(framerSubmittedKey(objectiveId), "1");
    } catch {
        // storage unavailable/full — non-fatal, just skip persistence
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Local "last submitted Framer data" snapshot.
//
// This is DIFFERENT from both keys above:
//  - the draft key (ro_framer_draft_*) is cleared on successful submit
//  - the submitted flag (ro_framer_submitted_*) is just a boolean
//
// The read-only Preview screen (opened via "Review your research framing →")
// needs the actual field values to display, and it needs them to still be
// there even after the draft has been wiped. So on every successful submit
// we also write a permanent snapshot of exactly what was submitted, and the
// review-only Preview loads FROM THIS SNAPSHOT, never from the draft.
// ─────────────────────────────────────────────────────────────────────────────

const framerSubmittedDataKey = (objectiveId?: string) => `ro_framer_submitted_data_${objectiveId ?? "unknown"}`;

const saveFramerSubmittedData = (objectiveId: string | undefined, data: ROFramerData) => {
    try {
        localStorage.setItem(framerSubmittedDataKey(objectiveId), JSON.stringify(stripFilesForStorage(data)));
    } catch {
        // storage unavailable/full — non-fatal, just skip persistence
    }
};

const loadFramerSubmittedData = (objectiveId?: string): ROFramerData | null => {
    try {
        const saved = localStorage.getItem(framerSubmittedDataKey(objectiveId));
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        if (!parsed || !parsed.context) return null;
        return hydrateFramerData(parsed);
    } catch {
        return null;
    }
};

const makeLinkIdForEmptySection = () => `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const emptySlot = (): MaterialSlot => ({
    fileName: null,
    fileSizeLabel: null,
    uploadStatus: "idle",
    file: null,
    dataUrl: null,
});

const emptyBriefSection = (): BriefSectionData => ({
    instruction: "",
    link: "",
    file: emptySlot(),
    submitted: false,
});

const emptyArtifactSection = (): ArtifactSectionData => ({
    instruction: "",
    links: [{ id: makeLinkIdForEmptySection(), value: "" }],
    files: [],
    category: null,
    contentCategory: null,
    submitted: false,
});

const emptyFramerData = (): ROFramerData => ({
    context: { companyName: "", industry: "", website: "", competitors: [], extraContext: "" },
    businessTrigger: { trigger: "" },
    customerUnknown: { unknown: "" },
    decisionMoment: { decision: "" },
    audienceSegments: { audience: "" },
    material: {
        brief: emptyBriefSection(),
        artifact: emptyArtifactSection(),
    },
    otherInformation: { notes: "" },
});

// File objects can't survive JSON.stringify — strip them before saving so
// localStorage doesn't choke or silently lose data. Display fields
// (fileName/fileSizeLabel) are kept so the review screen still shows what
// was attached, even though the raw file itself won't survive a reload.
// `dataUrl` (see MaterialSlot) is a plain string and IS kept — it's what
// survives storage and lets the Artifact viewer preview/download the file.
const stripFilesForStorage = (data: ROFramerData): ROFramerData => ({
    ...data,
    material: {
        brief: {
            ...data.material.brief,
            file: { ...data.material.brief.file, file: null },
        },
        artifact: {
            ...data.material.artifact,
            files: data.material.artifact.files.map(f => ({ ...f, file: null })),
        },
    },
});

const hydrateFramerData = (parsed: any): ROFramerData => {
    const base = emptyFramerData();
    if (!parsed || typeof parsed !== "object") return base;

    return {
        ...base,
        ...parsed,
        context: { ...base.context, ...parsed.context },
        businessTrigger: { ...base.businessTrigger, ...parsed.businessTrigger },
        customerUnknown: { ...base.customerUnknown, ...parsed.customerUnknown },
        decisionMoment: { ...base.decisionMoment, ...parsed.decisionMoment },
        audienceSegments: { ...base.audienceSegments, ...parsed.audienceSegments },
        otherInformation: { ...base.otherInformation, ...parsed.otherInformation },
        material: {
            brief: {
                ...base.material.brief,
                ...parsed.material?.brief,
                file: { ...base.material.brief.file, ...parsed.material?.brief?.file },
            },
            artifact: {
                ...base.material.artifact,
                ...parsed.material?.artifact,
                links: Array.isArray(parsed.material?.artifact?.links) && parsed.material.artifact.links.length
                    ? parsed.material.artifact.links
                    : base.material.artifact.links,
                files: Array.isArray(parsed.material?.artifact?.files)
                    ? parsed.material.artifact.files
                    : base.material.artifact.files,
            },
        },
    };
};

const loadFramerDraft = (objectiveId?: string): ROFramerData | null => {
    try {
        const saved = localStorage.getItem(framerDraftKey(objectiveId));
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        if (!parsed || !parsed.context) return null;
        return hydrateFramerData(parsed);
    } catch {
        return null;
    }
};

const saveFramerDraft = (objectiveId: string | undefined, data: ROFramerData) => {
    try {
        localStorage.setItem(framerDraftKey(objectiveId), JSON.stringify(stripFilesForStorage(data)));
    } catch {
        // storage unavailable/full — non-fatal, just skip persistence
    }
};

const clearFramerDraft = (objectiveId?: string) => {
    try {
        localStorage.removeItem(framerDraftKey(objectiveId));
    } catch {
        // ignore
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab registry
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
    { id: "context" as const, label: "The Context" },
    { id: "problem" as const, label: "Business Trigger" },
    { id: "hypothesis" as const, label: "Customer Unknown" },
    { id: "decision_moment" as const, label: "Decision Moment" },
    { id: "audience" as const, label: "Audience & Segments" },
    { id: "material" as const, label: "Add Material" },
    { id: "other_info" as const, label: "Other Information" },
    { id: "review" as const, label: "Preview" },
];

type TabId = typeof TABS[number]["id"];

function getTab(index: number): (typeof TABS)[number] | undefined {
    return TABS[index];
}

// ─────────────────────────────────────────────────────────────────────────────
// Omi avatar — plays the correct video per state, falls back to SVG
// ─────────────────────────────────────────────────────────────────────────────

const OmiAvatar: React.FC<{ state: OmiState }> = ({ state }) => {
    const videoSrc: Record<OmiState, string> = {
        idle: OmiIdle,
        typing: OmiPencil,
        navigating: OmiKeyboard,
        success: OmiSuccess,
    };

    const src = videoSrc[state];

    if (!src) {
        const mouthPath =
            state === "success" ? "M22 36 Q30 44 38 36" :
                state === "typing" ? "M24 37 Q30 40 36 37" :
                    "M24 36 Q30 41 36 36";

        return (
            <div
                className={[
                    "rofp-omi-orb",
                    state !== "idle" ? "rofp-omi-orb--active" : "",
                    state === "success" ? "rofp-omi-orb--pulse" : "",
                ].filter(Boolean).join(" ")}
            >
                <svg width="60" height="60" viewBox="0 0 60 60" fill="none" aria-hidden="true">
                    <circle cx="30" cy="30" r="28" fill="url(#omiGrad)" />
                    <circle cx="22" cy="26" r="4" fill="white" opacity="0.9" />
                    <circle cx="38" cy="26" r="4" fill="white" opacity="0.9" />
                    <circle cx="22" cy="27" r="2" fill="#060606" />
                    <circle cx="38" cy="27" r="2" fill="#060606" />
                    <path
                        d={mouthPath}
                        stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9"
                    />
                    {state === "typing" && (
                        <>
                            <line x1="14" y1="16" x2="20" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
                            <line x1="46" y1="16" x2="40" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
                        </>
                    )}
                    <defs>
                        <radialGradient id="omiGrad" cx="40%" cy="35%" r="65%">
                            <stop offset="0%" stopColor="#5B9DF5" />
                            <stop offset="100%" stopColor="#0E63EC" />
                        </radialGradient>
                    </defs>
                </svg>
            </div>
        );
    }

    return (
        <div className="rofp-omi-video-wrap">
            <video
                key={state}
                className="rofp-omi-video"
                src={src}
                autoPlay
                loop={state !== "success"}
                muted
                playsInline
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip — fixed: rendered in a portal-like fixed container to avoid clipping
// ─────────────────────────────────────────────────────────────────────────────

const Tooltip: React.FC<{ text: string }> = ({ text }) => {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const iconRef = useRef<HTMLSpanElement>(null);

    const showTooltip = () => {
        if (iconRef.current) {
            const rect = iconRef.current.getBoundingClientRect();
            setPos({
                top: rect.top - 8,   // 8px gap above the icon
                left: rect.left + rect.width / 2,
            });
        }
        setVisible(true);
    };

    return (
        <span
            className="rofp-tooltip-wrap"
            onMouseEnter={showTooltip}
            onMouseLeave={() => setVisible(false)}
        >
            <span ref={iconRef} className="rofp-tooltip-icon" aria-label="More info">?</span>
            {visible && (
                <span
                    className="rofp-tooltip-bubble rofp-tooltip-bubble--fixed"
                    style={{ top: pos.top, left: pos.left }}
                >
                    {text}
                </span>
            )}
        </span>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab nav scroll arrows
// ─────────────────────────────────────────────────────────────────────────────

interface TabNavArrowsProps {
    scrollRef: React.RefObject<HTMLDivElement | null>;
}

const TAB_NAV_SCROLL_AMOUNT = 180;

const useTabNavScrollState = (scrollRef: React.RefObject<HTMLDivElement | null>) => {
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const recompute = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        setCanScrollLeft(scrollLeft > 2);
        setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
    }, [scrollRef]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        recompute();
        el.addEventListener("scroll", recompute, { passive: true });
        window.addEventListener("resize", recompute);
        const ro = new ResizeObserver(recompute);
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", recompute);
            window.removeEventListener("resize", recompute);
            ro.disconnect();
        };
    }, [recompute, scrollRef]);

    return { canScrollLeft, canScrollRight, recompute };
};

const TabNavArrow: React.FC<{
    direction: "left" | "right";
    disabled: boolean;
    onClick: () => void;
}> = ({ direction, disabled, onClick }) => (
    <button
        type="button"
        className="rofp-tab-nav-arrow"
        onClick={onClick}
        disabled={disabled}
        aria-label={direction === "left" ? "Scroll tabs left" : "Scroll tabs right"}
    >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {direction === "left" ? (
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            )}
        </svg>
    </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 — The Context
// ─────────────────────────────────────────────────────────────────────────────

interface ContextTabProps {
    data: ContextData;
    onChange: (d: ContextData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
}

const ContextTab: React.FC<ContextTabProps> = ({
    data,
    onChange,
    onOmiStateChange,
    onContinue,
}) => {
    const [compInput, setCompInput] = useState("");

    const canContinue =
        data.companyName.trim().length > 0 && data.industry.trim().length > 0;

    const handleFieldFocus = () => onOmiStateChange("typing");

    const handleFieldBlur = () => {
        if (!data.companyName && !data.industry && !data.website) {
            onOmiStateChange("idle");
        }
    };

    const addCompetitor = () => {
        const val = compInput.trim();
        if (!val) return;
        const alreadyExists = data.competitors.some(
            c => c.name.toLowerCase() === val.toLowerCase()
        );
        if (alreadyExists) {
            setCompInput("");
            return;
        }
        onChange({
            ...data,
            competitors: [
                ...data.competitors,
                { id: `comp-${Date.now()}`, name: val },
            ],
        });
        setCompInput("");
    };

    const removeCompetitor = (id: string) =>
        onChange({
            ...data,
            competitors: data.competitors.filter(c => c.id !== id),
        });

    const handleContinueClick = () => {
        if (!canContinue) return;
        onOmiStateChange("navigating");
        setTimeout(onContinue, 400);
    };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">Let's set the stage</h2>
                <p className="rofp-tab-tagline">
                    Tell us who you are, where you play, and who your consumers compare
                    you against. This gives Omi the context needed to frame smarter
                    research questions.
                </p>
            </div>

            <div className="rofp-fields">

                {/* Company Name */}
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-company">
                            Company Name
                        </label>
                        <Tooltip text="Helps Omi anchor the exploration to your world." />
                    </div>
                    <input
                        id="rof-company"
                        className="rofp-input"
                        type="text"
                        placeholder="e.g., Pepsi, Walmart, Visa"
                        value={data.companyName}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, companyName: e.target.value })}
                        autoComplete="off"
                    />
                </div>

                {/* Industry / Category */}
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-industry">
                            Industry / Category
                        </label>
                        <Tooltip text="Gives Omi category context, consumer norms, and competitive expectations." />
                    </div>
                    <input
                        id="rof-industry"
                        className="rofp-input"
                        type="text"
                        placeholder="e.g., FMCG, Fintech, Beauty, Mobility, EdTech"
                        value={data.industry}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, industry: e.target.value })}
                        autoComplete="off"
                    />
                </div>

                {/* Website URL */}
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-website">
                            Website URL
                            <span className="rofp-label-optional">Optional</span>
                        </label>
                        <Tooltip text="Optional, but useful for understanding your proposition, language, and category cues." />
                    </div>
                    <p className="rofp-field-helper">
                        Optional, but useful for understanding your world.
                    </p>
                    <div className="rofp-input-row">
                        <input
                            id="rof-website"
                            className="rofp-input"
                            type="url"
                            placeholder="https://yourbrand.com"
                            value={data.website}
                            onFocus={handleFieldFocus}
                            onBlur={handleFieldBlur}
                            onChange={e => onChange({ ...data, website: e.target.value })}
                            autoComplete="off"
                        />
                        {data.website && (
                            <a
                                className="rofp-visit-btn"
                                href={
                                    data.website.startsWith("http")
                                        ? data.website
                                        : `https://${data.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Visit ↗
                            </a>
                        )}
                    </div>
                </div>
                {/* Extra Context */}
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-extra-context">
                            Extra Context
                            <span className="rofp-label-optional">Optional</span>
                        </label>
                        <Tooltip text="Tell Omi anything useful about your brand, category, products, or market." />
                    </div>
                    <textarea
                        id="rof-extra-context"
                        className="rofp-textarea rofp-textarea--lg"
                        placeholder="Tell Omi what your brand does, which products matter, and what category context should be considered..."
                        value={data.extraContext}
                        maxLength={1000}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, extraContext: e.target.value.slice(0, 1000) })}
                        rows={4}
                    />
                    <p className="rofp-field-charcount">{data.extraContext.length}/1000</p>
                </div>

                {/* Competitors */}
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-competitors">
                            Competitors
                        </label>
                        <Tooltip text="Add direct competitors, substitutes, or brands your consumers may compare you with." />
                    </div>
                    <div className="rofp-input-row">
                        <input
                            id="rof-competitors"
                            className="rofp-input"
                            type="text"
                            placeholder="e.g., Brand X, Platform Y, Company Z"
                            value={compInput}
                            onFocus={handleFieldFocus}
                            onBlur={handleFieldBlur}
                            onChange={e => setCompInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addCompetitor();
                                }
                            }}
                            autoComplete="off"
                        />
                        <button
                            className="rofp-btn-add"
                            onClick={addCompetitor}
                            type="button"
                        >
                            Add
                        </button>
                    </div>

                    <div className="rofp-comp-list-box">
                        {data.competitors.length === 0 ? (
                            <span className="rofp-comp-list-empty">
                                Added competitors will appear here
                            </span>
                        ) : (
                            data.competitors.map(c => (
                                <span key={c.id} className="rofp-comp-pill">
                                    <span className="rofp-comp-pill-name">{c.name}</span>
                                    <button
                                        className="rofp-comp-pill-rm"
                                        onClick={() => removeCompetitor(c.id)}
                                        type="button"
                                        aria-label={`Remove ${c.name}`}
                                    >
                                        ×
                                    </button>
                                </span>
                            ))
                        )}
                    </div>
                </div>

            </div>

            <div className="rofp-tab-cta">
                <button
                    className={[
                        "rofp-btn-continue",
                        !canContinue ? "rofp-btn-continue--disabled" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    disabled={!canContinue}
                    onClick={handleContinueClick}
                    type="button"
                >
                    Continue
                    <span className="rofp-btn-arrow">→</span>
                </button>
                {!canContinue && (
                    <p className="rofp-cta-hint">
                        Fill in Company Name and Industry to continue
                    </p>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Business Trigger
// ─────────────────────────────────────────────────────────────────────────────

interface BusinessTriggerTabProps {
    data: BusinessTriggerData;
    onChange: (d: BusinessTriggerData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const BusinessTriggerTab: React.FC<BusinessTriggerTabProps> = ({
    data, onChange, onOmiStateChange, onContinue, onBack,
}) => {
    const canContinue = data.trigger.trim().length > 0;
    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => { if (!data.trigger) onOmiStateChange("idle"); };
    const handleContinueClick = () => { if (!canContinue) return; onOmiStateChange("navigating"); setTimeout(onContinue, 400); };
    const handleBackClick = () => { onOmiStateChange("navigating"); setTimeout(onBack, 400); };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">What sparked this exploration?</h2>
                <p className="rofp-tab-tagline">What business moment, challenge, or opportunity created the need to understand customers better?</p>
            </div>
            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-trigger">Business Trigger</label>
                        <Tooltip text="What changed recently that made this urgent? A launch, a competitor move, a number that dipped, or a question leadership needs answered." />
                    </div>
                    <textarea id="rof-trigger" className="rofp-textarea rofp-textarea--lg" placeholder={"We are exploring this because...\n\nUpcoming launch, customer usage & attitude, growth opportunity, competitor move, churn, low adoption, pricing question, new market, product confusion, campaign planning..."} value={data.trigger} onFocus={handleFieldFocus} onBlur={handleFieldBlur} onChange={e => onChange({ ...data, trigger: e.target.value })} rows={6} />
                </div>
            </div>
            <div className="rofp-tab-cta">
                <button className="rofp-btn-back" onClick={handleBackClick} type="button"><span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>Back</button>
                <div className="rofp-tab-cta-right">
                    <button className={["rofp-btn-continue", !canContinue ? "rofp-btn-continue--disabled" : ""].filter(Boolean).join(" ")} disabled={!canContinue} onClick={handleContinueClick} type="button">Continue<span className="rofp-btn-arrow">→</span></button>
                    {!canContinue && <p className="rofp-cta-hint">Tell us what sparked this to continue</p>}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Customer Unknown
// ─────────────────────────────────────────────────────────────────────────────

interface CustomerUnknownTabProps {
    data: CustomerUnknownData;
    onChange: (d: CustomerUnknownData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const CustomerUnknownTab: React.FC<CustomerUnknownTabProps> = ({
    data, onChange, onOmiStateChange, onContinue, onBack,
}) => {
    const canContinue = data.unknown.trim().length > 0;
    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => { if (!data.unknown) onOmiStateChange("idle"); };
    const handleContinueClick = () => { if (!canContinue) return; onOmiStateChange("navigating"); setTimeout(onContinue, 400); };
    const handleBackClick = () => { onOmiStateChange("navigating"); setTimeout(onBack, 400); };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">What customer truth is missing?</h2>
                <p className="rofp-tab-tagline">What do you not yet understand about customers that is making the next move difficult?</p>
            </div>
            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-customer-unknown">Customer Unknown</label>
                        <Tooltip text="What's the one thing about your customer you genuinely don't know? The clearer the gap, the sharper the research." />
                    </div>
                    <textarea id="rof-customer-unknown" className="rofp-textarea rofp-textarea--lg" placeholder={"We don't know the customer's...\n\nMotivation, hesitation, trust gap, price sensitivity, perceived value, switching reason, adoption barrier, emotional tension..."} value={data.unknown} onFocus={handleFieldFocus} onBlur={handleFieldBlur} onChange={e => onChange({ ...data, unknown: e.target.value })} rows={6} />
                </div>
            </div>
            <div className="rofp-tab-cta">
                <button className="rofp-btn-back" onClick={handleBackClick} type="button"><span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>Back</button>
                <div className="rofp-tab-cta-right">
                    <button className={["rofp-btn-continue", !canContinue ? "rofp-btn-continue--disabled" : ""].filter(Boolean).join(" ")} disabled={!canContinue} onClick={handleContinueClick} type="button">Continue<span className="rofp-btn-arrow">→</span></button>
                    {!canContinue && <p className="rofp-cta-hint">Tell us the missing customer truth to continue</p>}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Decision Moment
// ─────────────────────────────────────────────────────────────────────────────

interface DecisionMomentTabProps {
    data: DecisionMomentData;
    onChange: (d: DecisionMomentData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const DecisionMomentTab: React.FC<DecisionMomentTabProps> = ({
    data, onChange, onOmiStateChange, onContinue, onBack,
}) => {
    const canContinue = data.decision.trim().length > 0;
    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => { if (!data.decision) onOmiStateChange("idle"); };
    const handleContinueClick = () => { if (!canContinue) return; onOmiStateChange("navigating"); setTimeout(onContinue, 400); };
    const handleBackClick = () => { onOmiStateChange("navigating"); setTimeout(onBack, 400); };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">What decision are we unlocking?</h2>
                <p className="rofp-tab-tagline">What decision will your team make using this customer understanding?</p>
            </div>
            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-decision-moment">Decision Moment</label>
                        <Tooltip text="What real call will this research inform? If there's no genuine choice on the table, there's no decision to unlock." />
                    </div>
                    <textarea id="rof-decision-moment" className="rofp-textarea rofp-textarea--lg" placeholder={"These insights will help the team decide...\n\nPricing, positioning, messaging, product roadmap, feature prioritization, market entry, targeting, onboarding, retention, offer design..."} value={data.decision} onFocus={handleFieldFocus} onBlur={handleFieldBlur} onChange={e => onChange({ ...data, decision: e.target.value })} rows={6} />
                </div>
            </div>
            <div className="rofp-tab-cta">
                <button className="rofp-btn-back" onClick={handleBackClick} type="button"><span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>Back</button>
                <div className="rofp-tab-cta-right">
                    <button className={["rofp-btn-continue", !canContinue ? "rofp-btn-continue--disabled" : ""].filter(Boolean).join(" ")} disabled={!canContinue} onClick={handleContinueClick} type="button">Continue<span className="rofp-btn-arrow">→</span></button>
                    {!canContinue && <p className="rofp-cta-hint">Tell us what decision this will unlock to continue</p>}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Audience & Segments
// ─────────────────────────────────────────────────────────────────────────────

interface AudienceSegmentsTabProps {
    data: AudienceSegmentsData;
    onChange: (d: AudienceSegmentsData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const AudienceSegmentsTab: React.FC<AudienceSegmentsTabProps> = ({
    data, onChange, onOmiStateChange, onContinue, onBack,
}) => {
    const canContinue = data.audience.trim().length > 0;
    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => { if (!data.audience) onOmiStateChange("idle"); };
    const handleContinueClick = () => { if (!canContinue) return; onOmiStateChange("navigating"); setTimeout(onContinue, 400); };
    const handleBackClick = () => { onOmiStateChange("navigating"); setTimeout(onBack, 400); };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">Who should we understand?</h2>
                <p className="rofp-tab-tagline">Which customers should this exploration represent?</p>
                <p className="rofp-tab-note">Don't worry about perfect targeting yet — we'll get into detailed persona building right after this.</p>
            </div>
            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-audience-segments">Audience & Segments</label>
                        <Tooltip text="Who needs to be represented in this exploration? Think in directional groups for now — specific personas come next." />
                    </div>
                    <textarea id="rof-audience-segments" className="rofp-textarea rofp-textarea--lg" placeholder={"We want to understand audience, especially segments...\n\nCurrent users, prospects, lapsed users, switchers, loyalists, first-time buyers, premium buyers, value seekers, skeptics, heavy users..."} value={data.audience} onFocus={handleFieldFocus} onBlur={handleFieldBlur} onChange={e => onChange({ ...data, audience: e.target.value })} rows={6} />
                    <p className="rofp-field-static-note">Keep it directional for now. You'll define detailed personas, demographics, and traits in the next step.</p>
                </div>
            </div>
            <div className="rofp-tab-cta">
                <button className="rofp-btn-back" onClick={handleBackClick} type="button"><span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>Back</button>
                <div className="rofp-tab-cta-right">
                    <button className={["rofp-btn-continue", !canContinue ? "rofp-btn-continue--disabled" : ""].filter(Boolean).join(" ")} disabled={!canContinue} onClick={handleContinueClick} type="button">Continue<span className="rofp-btn-arrow">→</span></button>
                    {!canContinue && <p className="rofp-cta-hint">Tell us who this should represent to continue</p>}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Add Material — two independent sections: Research Brief & Artifacts
// ─────────────────────────────────────────────────────────────────────────────

const BRIEF_EXTENSIONS = [".pdf", ".pptx", ".ppt", ".docx", ".doc", ".xlsx", ".xls"];
const BRIEF_MAX_BYTES = 5 * 1024 * 1024;

const ARTIFACT_EXTENSIONS = [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
];
const ARTIFACT_MAX_BYTES = 10 * 1024 * 1024;

const ARTIFACT_MAX_LINKS = 3;
const ARTIFACT_MAX_FILES = 4;

// ─────────────────────────────────────────────────────────────────────────────
// DISABLED — artifact categorization (Compare / Campaign Set / Sequence)
//
// No immediate client requirement for this yet. Everything below (the
// category config, the label helper, and the chip-selector component) is
// left in place but unused so the feature can be turned back on later by:
//   1. Uncommenting ARTIFACT_CATEGORIES / artifactCategoryLabel / countArtifactItems
//      / ArtifactCategoryChipsProps / ArtifactCategoryChips below.
//   2. Restoring `artifactItemCount` / `artifactNeedsCategory` in MaterialTab
//      and adding `&& !artifactNeedsCategory` back into canSubmitArtifact.
//   3. Uncommenting the <ArtifactCategoryChips /> render block and the
//      "Pick how these relate to continue" hint in MaterialTab's JSX.
//   4. Uncommenting the "Artifact grouping" line in buildPreviewSections.
// The `category` field itself is left active on ArtifactSectionData/emptyArtifactSection
// so stored/submitted data keeps a stable shape either way — it will just
// always be `null` while this feature is off.
// ─────────────────────────────────────────────────────────────────────────────

// const ARTIFACT_CATEGORIES: { id: ArtifactCategory; label: string; description: string }[] = [
//     {
//         id: "compare",
//         label: "Compare",
//         description: "Different concepts competing for the same spot. Omi shows personas the options together and finds out which one resonates more, and why.",
//     },
//     {
//         id: "campaign_set",
//         label: "Campaign Set",
//         description: "Assets from one campaign, meant to work together. Omi checks whether they feel consistent and tell one story, rather than picking a favorite.",
//     },
//     // {
//     //     id: "sequence",
//     //     label: "Sequence",
//     //     description: "Assets meant to be seen in order — a funnel, a teaser-to-reveal, or a multi-step flow. Omi tests whether each step earns the next.",
//     // },
// ];

// Comparison-mode label lookup — unused while ArtifactCategoryChips is
// disabled (see the DISABLED block near ARTIFACT_MAX_FILES for how to
// re-enable both together).
// const artifactCategoryLabel = (id: ArtifactCategory | null): string | null =>
//     id ? ARTIFACT_CATEGORIES.find(c => c.id === id)?.label ?? null : null;

// What kind of creative asset this is — feeds the artifact pipeline's
// Stage 2 dimension selection. Values must match
// backend/app/data/artifact_dimensions_library.json's artifact_types keys.
const ARTIFACT_CONTENT_CATEGORIES: { id: ArtifactContentCategory; label: string }[] = [
    { id: "ad_creative", label: "Ad Creative" },
    { id: "landing_page", label: "Landing Page" },
    { id: "packaging", label: "Packaging" },
    { id: "product_concept", label: "Product Concept" },
    { id: "pricing_offer", label: "Pricing Offer" },
    { id: "claim", label: "Claim" },
    { id: "script_storyboard", label: "Script / Storyboard" },
];

// Counts distinct artifacts attached so far (filled links + files) — still
// active (unlike the comparison-mode chips above): the content-category
// selector below needs it even while comparison mode is disabled.
const countArtifactItems = (artifact: ArtifactSectionData): number =>
    artifact.links.filter(l => l.value.trim()).length + artifact.files.length;

const MATERIAL_INSTRUCTION_MAX_LENGTH = 500;

const isLikelyValidUrl = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    try {
        const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
        return Boolean(url.hostname && url.hostname.includes("."));
    } catch {
        return false;
    }
};

const makeLinkId = () => `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const emptyLink = (): MaterialLink => ({ id: makeLinkId(), value: "" });

const LinkIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-1.93 1.93a5 5 0 0 0 7.07 7.07L13.5 18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const PlusIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const EditIcon: React.FC = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const MATERIAL_PROCESSING_MESSAGES = [
    "Reading your uploaded context…",
    "Pulling out key themes and claims…",
    "Finding signals Omi should learn…",
    "Almost ready ✨",
    "Upload Complete",
];
const MATERIAL_PROCESSING_INTERVAL_MS = 1600;

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Reads a File's bytes into a base64 data URL — the only File "shape" that
// survives JSON.stringify, so it's what gets persisted to localStorage
// (see handleSubmitArtifact) for later preview/download in the read-only
// Artifact viewer on the Discussion Guide screen.
const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });

const MaterialCheckIcon: React.FC = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

interface UploadSlotProps {
    label: string;
    acceptExtensions: string[];
    maxBytes: number;
    formatsLabel: string;
    slot: MaterialSlot;
    onSlotChange: (s: MaterialSlot) => void;
    disabled?: boolean;
    compact?: boolean;
}

const UploadSlot: React.FC<UploadSlotProps> = ({
    label, acceptExtensions, maxBytes, formatsLabel,
    slot, onSlotChange, disabled, compact,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

    const acceptFile = (file: File) => {
        const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
        if (!acceptExtensions.includes(ext)) {
            setFileError(`Unsupported file type. Allowed: ${formatsLabel}`);
            return;
        }
        if (file.size > maxBytes) {
            setFileError(`File too large. Maximum size is ${formatFileSize(maxBytes)}.`);
            return;
        }
        setFileError(null);
        onSlotChange({ fileName: file.name, fileSizeLabel: formatFileSize(file.size), uploadStatus: "idle", file, dataUrl: null });
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) acceptFile(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        if (disabled) return;
        const file = e.dataTransfer.files?.[0];
        if (file) acceptFile(file);
    };

    const handleRemove = () => {
        if (disabled) return;
        setFileError(null);
        onSlotChange({ fileName: null, fileSizeLabel: null, uploadStatus: "idle", file: null, dataUrl: null });
    };

    return (
        <div className={["rofp-upload-slot", compact ? "rofp-upload-slot--compact" : ""].filter(Boolean).join(" ")}>
            {!slot.fileName ? (
                <div
                    className={[
                        "rofp-upload-zone",
                        compact ? "rofp-upload-zone--compact" : "",
                        isDragOver ? "rofp-upload-zone--dragover" : "",
                        disabled ? "rofp-upload-zone--disabled" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => { if (!disabled) fileInputRef.current?.click(); }}
                    onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled}
                    onKeyDown={e => { if (!disabled && (e.key === "Enter" || e.key === " ")) fileInputRef.current?.click(); }}
                >
                    <span className="rofp-upload-zone-icon"><SpIcon name="sp-File-Cloud_Upload" /></span>
                    <span className="rofp-upload-zone-title">
                        {compact ? <>Click to upload {label.toLowerCase()}</> : <>Drop your files here,<br />or click to upload</>}
                    </span>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="rofp-upload-zone-input"
                        accept={acceptExtensions.join(",")}
                        onChange={handleFileInputChange}
                        disabled={disabled}
                    />
                </div>
            ) : (
                <div className="rofp-upload-file-card">
                    <span className="rofp-upload-file-icon"><SpIcon name="sp-File-File_Blank" /></span>
                    <div className="rofp-upload-file-info">
                        <div className="rofp-upload-file-name">{slot.fileName}</div>
                        {slot.fileSizeLabel && <div className="rofp-upload-file-meta">{slot.fileSizeLabel}</div>}
                    </div>
                    <button className="rofp-upload-file-remove" onClick={handleRemove} disabled={disabled} type="button" aria-label="Remove file">×</button>
                </div>
            )}

            {fileError && <p className="rofp-upload-slot-error">{fileError}</p>}

            <p className="rofp-upload-formats">
                <strong>Max {formatFileSize(maxBytes)}</strong> · {formatsLabel}
            </p>
        </div>
    );
};

// ─── Multi-file upload slot — used by the Artifact section to accept up to
// ARTIFACT_MAX_FILES files (e.g. multiple creative variants to compare, or
// multiple assets from one campaign set). Each accepted file gets its own
// removable card; the dropzone stays visible (with a running count) until
// the max is reached.
interface MultiUploadSlotProps {
    label: string;
    acceptExtensions: string[];
    maxBytes: number;
    maxFiles: number;
    formatsLabel: string;
    files: MaterialSlot[];
    onFilesChange: (files: MaterialSlot[]) => void;
    disabled?: boolean;
    compact?: boolean;
}

const MultiUploadSlot: React.FC<MultiUploadSlotProps> = ({
    label, acceptExtensions, maxBytes, maxFiles, formatsLabel,
    files, onFilesChange, disabled, compact,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

    const remainingSlots = Math.max(0, maxFiles - files.length);
    const canAddMore = remainingSlots > 0 && !disabled;

    const acceptFiles = (incoming: FileList | File[]) => {
        const incomingArr = Array.from(incoming);
        const toProcess = incomingArr.slice(0, remainingSlots);
        const overflow = incomingArr.length > toProcess.length;

        const accepted: MaterialSlot[] = [];
        let error: string | null = overflow
            ? `You can attach up to ${maxFiles} files — extra files were skipped.`
            : null;

        for (const file of toProcess) {
            const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
            if (!acceptExtensions.includes(ext)) {
                error = `Unsupported file type. Allowed: ${formatsLabel}`;
                continue;
            }
            if (file.size > maxBytes) {
                error = `File too large. Maximum size is ${formatFileSize(maxBytes)}.`;
                continue;
            }
            accepted.push({ fileName: file.name, fileSizeLabel: formatFileSize(file.size), uploadStatus: "idle", file, dataUrl: null });
        }

        setFileError(error);
        if (accepted.length) onFilesChange([...files, ...accepted]);
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // e.target.files is a LIVE FileList tied to the input, not a snapshot —
        // resetting e.target.value below also empties this same FileList out
        // from under us, so we must copy it into a plain array first.
        const selected = e.target.files ? Array.from(e.target.files) : [];
        e.target.value = "";
        if (selected.length) acceptFiles(selected);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!canAddMore) return;
        if (e.dataTransfer.files?.length) acceptFiles(e.dataTransfer.files);
    };

    const removeFileAt = (idx: number) => {
        if (disabled) return;
        setFileError(null);
        onFilesChange(files.filter((_, i) => i !== idx));
    };

    return (
        <div className={["rofp-upload-slot", compact ? "rofp-upload-slot--compact" : ""].filter(Boolean).join(" ")}>
            {files.length > 0 && (
                <div className="rofp-artifact-file-list">
                    {files.map((slot, idx) => (
                        <div className="rofp-upload-file-card" key={`${slot.fileName}-${idx}`}>
                            <span className="rofp-upload-file-icon"><SpIcon name="sp-File-File_Blank" /></span>
                            <div className="rofp-upload-file-info">
                                <div className="rofp-upload-file-name">{slot.fileName}</div>
                                {slot.fileSizeLabel && <div className="rofp-upload-file-meta">{slot.fileSizeLabel}</div>}
                            </div>
                            <button
                                className="rofp-upload-file-remove"
                                onClick={() => removeFileAt(idx)}
                                disabled={disabled}
                                type="button"
                                aria-label={`Remove ${slot.fileName}`}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {canAddMore && (
                <div
                    className={[
                        "rofp-upload-zone",
                        compact ? "rofp-upload-zone--compact" : "",
                        isDragOver ? "rofp-upload-zone--dragover" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                >
                    <span className="rofp-upload-zone-icon"><SpIcon name="sp-File-Cloud_Upload" /></span>
                    <span className="rofp-upload-zone-title">
                        {compact ? <>Click to upload {label.toLowerCase()}</> : <>Drop your files here,<br />or click to upload</>}
                        {files.length > 0 && <> ({files.length}/{maxFiles})</>}
                    </span>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="rofp-upload-zone-input"
                        accept={acceptExtensions.join(",")}
                        multiple
                        onChange={handleFileInputChange}
                        disabled={disabled}
                    />
                </div>
            )}

            {fileError && <p className="rofp-upload-slot-error">{fileError}</p>}

            <p className="rofp-upload-formats">
                <strong>Max {formatFileSize(maxBytes)} each</strong> · {formatsLabel} · up to {maxFiles} files
            </p>
        </div>
    );
};

const OmiProcessingBar: React.FC<{ messageIndex: number }> = ({ messageIndex }) => (
    <div className="rofp-upload-omi-bar">
        <div className="rofp-upload-omi-avatar">
            <video src={OmiKeyboard} autoPlay loop muted playsInline />
        </div>
        <div className="rofp-upload-omi-msg-wrap">
            <span className="rofp-upload-omi-msg">
                <span className="rofp-upload-omi-bullet" />
                {MATERIAL_PROCESSING_MESSAGES[messageIndex]}
            </span>
        </div>
        <div className="rofp-upload-omi-dots">
            <span /><span /><span />
        </div>
    </div>
);

interface LinkRowProps {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    onFocus: () => void;
    onBlur: () => void;
    disabled?: boolean;
    removable?: boolean;
    onRemove?: () => void;
}

const LinkRow: React.FC<LinkRowProps> = ({ value, placeholder, onChange, onFocus, onBlur, disabled, removable, onRemove }) => {
    const [touched, setTouched] = useState(false);
    const valid = isLikelyValidUrl(value);
    const showClearOrRemove = Boolean(value) || Boolean(removable);

    return (
        <div>
            <div className={["rofp-video-link-row", touched && !valid ? "rofp-video-link-row--error" : ""].filter(Boolean).join(" ")}>
                <span className="rofp-video-link-icon"><LinkIcon /></span>
                <input
                    type="url"
                    inputMode="url"
                    className="rofp-video-link-input"
                    placeholder={placeholder}
                    value={value}
                    onFocus={onFocus}
                    onChange={e => onChange(e.target.value)}
                    onBlur={() => { setTouched(true); onBlur(); }}
                    autoComplete="off"
                    disabled={disabled}
                />
                {showClearOrRemove && (
                    <button
                        type="button"
                        className="rofp-video-link-clear"
                        onClick={() => {
                            if (value) { onChange(""); setTouched(false); }
                            else if (onRemove) { onRemove(); }
                        }}
                        aria-label={value ? "Clear link" : "Remove link field"}
                        disabled={disabled}
                    >
                        ×
                    </button>
                )}
            </div>
            {touched && !valid && (
                <p className="rofp-upload-slot-error">That doesn't look like a valid link. Double-check and try again.</p>
            )}
        </div>
    );
};

// DISABLED alongside ARTIFACT_CATEGORIES above — see the block comment near
// ARTIFACT_MAX_FILES for how to re-enable.
// interface ArtifactCategoryChipsProps {
//     value: ArtifactCategory | null;
//     onChange: (category: ArtifactCategory) => void;
//     disabled?: boolean;
// }
//
// const ArtifactCategoryChips: React.FC<ArtifactCategoryChipsProps> = ({ value, onChange, disabled }) => (
//     <div className="rofp-field-group">
//         <div className="rofp-field-label-row">
//             <label className="rofp-label">How should Omi treat these together?</label>
//         </div>
//         <div className="rofp-artifact-cat-row">
//             {ARTIFACT_CATEGORIES.map(cat => (
//                 <button
//                     key={cat.id}
//                     type="button"
//                     className={[
//                         "rofp-artifact-cat-chip",
//                         value === cat.id ? "rofp-artifact-cat-chip--active" : "",
//                     ].filter(Boolean).join(" ")}
//                     onClick={() => !disabled && onChange(cat.id)}
//                     disabled={disabled}
//                     aria-pressed={value === cat.id}
//                 >
//                     {cat.label}
//                 </button>
//             ))}
//         </div>
//         {value && <p className="rofp-artifact-cat-desc">{ARTIFACT_CATEGORIES.find(c => c.id === value)?.description}</p>}
//     </div>
// );
interface CustomSelectOption<T extends string> {
    id: T;
    label: string;
}

interface CustomSelectProps<T extends string> {
    id?: string | undefined;
    value: T | null;
    placeholder: string;
    options: CustomSelectOption<T>[];
    onChange: (value: T) => void;
    disabled?: boolean | undefined;
}

function CustomSelect<T extends string>({
    id, value, placeholder, options, onChange, disabled,
}: CustomSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    const selectedLabel = options.find(o => o.id === value)?.label ?? null;

    return (
        <div className="rofp-custom-select" ref={wrapRef}>
            <button
                type="button"
                id={id}
                className={[
                    "rofp-custom-select-trigger",
                    !selectedLabel ? "rofp-custom-select-trigger--placeholder" : "",
                    open ? "rofp-custom-select-trigger--open" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => !disabled && setOpen(o => !o)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span>{selectedLabel ?? placeholder}</span>
                <svg className="rofp-custom-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {open && (
                <ul className="rofp-custom-select-menu" role="listbox">
                    {options.map(opt => (
                        <li
                            key={opt.id}
                            role="option"
                            aria-selected={opt.id === value}
                            className={[
                                "rofp-custom-select-option",
                                opt.id === value ? "rofp-custom-select-option--active" : "",
                            ].filter(Boolean).join(" ")}
                            onClick={() => { onChange(opt.id); setOpen(false); }}
                        >
                            {opt.id === value && (
                                <span className="rofp-custom-select-option-check"><MaterialCheckIcon /></span>
                            )}
                            {opt.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
interface ArtifactContentCategorySelectProps {
    value: ArtifactContentCategory | null;
    onChange: (category: ArtifactContentCategory) => void;
    disabled?: boolean;
}

// Required whenever at least one artifact (file or link) is attached —
// unlike ArtifactCategoryChips (comparison mode) above, which only applies
// once there are 2+. A single artifact still needs a content category for
// Stage 2 dimension selection to make sense.
const ArtifactContentCategorySelect: React.FC<ArtifactContentCategorySelectProps> = ({ value, onChange, disabled }) => (
    <div className="rofp-field-group">
        <div className="rofp-field-label-row">
            <label className="rofp-label" htmlFor="rof-artifact-content-category">
                Artifact Content Category
            </label>
            <Tooltip text="What kind of creative asset is this? Drives which questions Omi asks personas about it." />
        </div>
        <CustomSelect
            id="rof-artifact-content-category"
            value={value}
            placeholder="Select a category…"
            options={ARTIFACT_CONTENT_CATEGORIES}
            onChange={onChange}
            disabled={disabled}
        />
    </div>
);

interface MaterialTabProps {
    data: MaterialData;
    onChange: (d: MaterialData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const MaterialTab: React.FC<MaterialTabProps> = ({
    data, onChange, onOmiStateChange, onContinue, onBack,
}) => {
    const { workspaceId, objectiveId } = useParams<{
        workspaceId: string;
        objectiveId: string;
    }>();
    const { mutateAsync: submitBriefSection } = useSubmitFramerMaterialSection(workspaceId, objectiveId) as any;
    const { mutateAsync: submitArtifactSection } = useSubmitFramerMaterialSection(workspaceId, objectiveId) as any;

    const [briefProcessing, setBriefProcessing] = useState(false);
    const [artifactProcessing, setArtifactProcessing] = useState(false);
    const [briefMsgIndex, setBriefMsgIndex] = useState(0);
    const [artifactMsgIndex, setArtifactMsgIndex] = useState(0);
    const [briefError, setBriefError] = useState<string | null>(null);
    const [artifactError, setArtifactError] = useState<string | null>(null);

    const anyFieldFilled =
        !!data.brief.instruction || !!data.artifact.instruction ||
        !!data.brief.link || !!data.brief.file.fileName ||
        data.artifact.links.some(l => l.value) || data.artifact.files.length > 0;

    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => { if (!anyFieldFilled) onOmiStateChange("idle"); };

    useEffect(() => {
        if (!briefProcessing) { setBriefMsgIndex(0); return; }
        if (briefMsgIndex >= MATERIAL_PROCESSING_MESSAGES.length - 1) return;
        const t = setTimeout(() => setBriefMsgIndex(i => i + 1), MATERIAL_PROCESSING_INTERVAL_MS);
        return () => clearTimeout(t);
    }, [briefProcessing, briefMsgIndex]);

    useEffect(() => {
        if (!artifactProcessing) { setArtifactMsgIndex(0); return; }
        if (artifactMsgIndex >= MATERIAL_PROCESSING_MESSAGES.length - 1) return;
        const t = setTimeout(() => setArtifactMsgIndex(i => i + 1), MATERIAL_PROCESSING_INTERVAL_MS);
        return () => clearTimeout(t);
    }, [artifactProcessing, artifactMsgIndex]);

    const briefHasContent = data.brief.link.trim().length > 0 || !!data.brief.file.fileName;
    const briefLinkValid = isLikelyValidUrl(data.brief.link);
    // Deliberately NOT gated on briefHasContent: a previously-submitted section
    // with everything since removed must still be submittable, so that submit
    // (with an empty file+link) reaches the backend and actually clears it —
    // otherwise there'd be no way to undo a saved Research Brief/Artifact.
    const canSubmitBrief = briefLinkValid && !briefProcessing && !data.brief.submitted;

    const updateBrief = (patch: Partial<BriefSectionData>) =>
        onChange({ ...data, brief: { ...data.brief, ...patch } });

    const handleSubmitBrief = async () => {
        if (!canSubmitBrief) return;
        setBriefError(null);
        setBriefProcessing(true);
        try {
            await submitBriefSection({
                kind: "brief",
                instruction: data.brief.instruction,
                file: data.brief.file.file,
                links: data.brief.link.trim() ? [data.brief.link.trim()] : [],
            });
            updateBrief({ submitted: true, file: { ...data.brief.file, uploadStatus: "done" } });
        } catch (error: any) {
            setBriefError(
                error?.response?.data?.detail ?? "Couldn't save this section. Please try again."
            );
        } finally {
            setBriefProcessing(false);
        }
    };

    const handleEditBrief = () => updateBrief({ submitted: false, file: { ...data.brief.file, uploadStatus: "idle" } });

    const artifactHasContent = data.artifact.links.some(l => l.value.trim()) || data.artifact.files.length > 0;
    const artifactLinksValid = data.artifact.links.every(l => isLikelyValidUrl(l.value));
    const artifactItemCount = countArtifactItems(data.artifact);
    // DISABLED alongside the comparison-mode chips below — see the block
    // comment near ARTIFACT_MAX_FILES for how to re-enable:
    // const artifactNeedsCategory = artifactItemCount >= 2 && !data.artifact.category;
    // Content category (separate from comparison mode) is required as soon as
    // there's anything to categorize at all — Stage 2 dimension selection
    // needs it even for a single artifact, independent of comparison mode.
    const artifactNeedsContentCategory = artifactItemCount >= 1 && !data.artifact.contentCategory;
    // Same reasoning as canSubmitBrief — not gated on artifactHasContent.
    const canSubmitArtifact = artifactLinksValid && !artifactProcessing && !data.artifact.submitted
        && !artifactNeedsContentCategory;
    const canAddArtifactLink = data.artifact.links.length < ARTIFACT_MAX_LINKS;

    const updateArtifact = (patch: Partial<ArtifactSectionData>) =>
        onChange({ ...data, artifact: { ...data.artifact, ...patch } });

    const handleSubmitArtifact = async () => {
        if (!canSubmitArtifact) return;
        setArtifactError(null);
        setArtifactProcessing(true);
        try {
            await submitArtifactSection({
                kind: "artifact",
                instruction: data.artifact.instruction,
                files: data.artifact.files.map(f => f.file).filter((f): f is File => f !== null),
                links: data.artifact.links.map(l => l.value).filter(Boolean),
                comparison_mode: data.artifact.category,
                artifact_category: data.artifact.contentCategory,
            });
            // Capture each file's bytes as a base64 data URL before we lose
            // the raw File reference — this is what survives into the
            // localStorage snapshot (stripFilesForStorage nulls out `file`
            // but keeps `dataUrl`) and lets the Discussion Guide's Artifact
            // viewer actually preview images / offer downloads later.
            const filesWithDataUrls = await Promise.all(
                data.artifact.files.map(async (f) => ({
                    ...f,
                    uploadStatus: "done" as MaterialUploadStatus,
                    dataUrl: f.file ? await fileToDataUrl(f.file).catch(() => f.dataUrl ?? null) : f.dataUrl,
                }))
            );
            updateArtifact({
                submitted: true,
                files: filesWithDataUrls,
            });
        } catch (error: any) {
            setArtifactError(
                error?.response?.data?.detail ?? "Couldn't save this section. Please try again."
            );
        } finally {
            setArtifactProcessing(false);
        }
    };

    const handleEditArtifact = () => updateArtifact({
        submitted: false,
        files: data.artifact.files.map(f => ({ ...f, uploadStatus: "idle" as MaterialUploadStatus })),
    });

    const handleContinueClick = () => { onOmiStateChange("navigating"); setTimeout(onContinue, 400); };
    const handleBackClick = () => { if (briefProcessing || artifactProcessing) return; onOmiStateChange("navigating"); setTimeout(onBack, 400); };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">Share your briefs and artifacts</h2>
                <p className="rofp-tab-tagline">
                    Add research briefs, creatives, concepts, reports, links, or any
                    material you want Omi to read, test, or use as context.
                </p>
            </div>

            <div className="rofp-fields">

                {/* ── TWO SECTIONS SIDE BY SIDE ─────────────────────────── */}
                <div className="rofp-material-sections-row">

                    {/* ── Section 1: Research Brief ───────────────────────── */}
                    <div className="rofp-material-section">
                        <div className="rofp-material-section-head">
                            <h3 className="rofp-material-section-title">Research Brief</h3>
                            <p className="rofp-material-section-sub">
                                Share documents that help Omi understand the business problem,
                                category, audience, key unknowns, or research scope.
                            </p>
                        </div>

                        <div className="rofp-material-section-body">
                            <div className="rofp-field-group">
                                <div className="rofp-field-label-row">
                                    <label className="rofp-label" htmlFor="rof-brief-instruction">
                                        What should Omi understand about this document?
                                        <span className="rofp-label-optional">Optional</span>
                                    </label>
                                    <Tooltip text="Tell Omi what to take from this document and how to use it." />
                                </div>
                                <textarea
                                    id="rof-brief-instruction"
                                    className="rofp-textarea rofp-textarea--lg"
                                    placeholder="This is a research brief. Use it to understand the category, audience, key unknowns, hypotheses, and decisions this exploration should support…"
                                    value={data.brief.instruction}
                                    maxLength={MATERIAL_INSTRUCTION_MAX_LENGTH}
                                    onFocus={handleFieldFocus}
                                    onBlur={handleFieldBlur}
                                    onChange={e => updateBrief({ instruction: e.target.value.slice(0, MATERIAL_INSTRUCTION_MAX_LENGTH) })}
                                    rows={3}
                                    disabled={data.brief.submitted}
                                />
                                <p className="rofp-field-charcount">{data.brief.instruction.length}/{MATERIAL_INSTRUCTION_MAX_LENGTH}</p>
                            </div>

                            <LinkRow
                                value={data.brief.link}
                                placeholder="Paste a document, drive, report, or reference link"
                                onChange={value => updateBrief({ link: value })}
                                onFocus={handleFieldFocus}
                                onBlur={handleFieldBlur}
                                disabled={data.brief.submitted}
                            />

                            <UploadSlot
                                label="Research Brief"
                                acceptExtensions={BRIEF_EXTENSIONS}
                                maxBytes={BRIEF_MAX_BYTES}
                                formatsLabel="PDF, PPTX, DOCX, XLSX"
                                slot={data.brief.file}
                                onSlotChange={file => updateBrief({ file })}
                                disabled={data.brief.submitted}
                            />
                        </div>

                        {briefProcessing && <OmiProcessingBar messageIndex={briefMsgIndex} />}

                        {briefError && !briefProcessing && (
                            <p className="rofp-upload-slot-error">{briefError}</p>
                        )}

                        {data.brief.submitted && !briefProcessing && (
                            <div className="rofp-upload-complete">
                                <span className="rofp-upload-complete-icon"><MaterialCheckIcon /></span>
                                <div className="rofp-upload-complete-text">
                                    <div className="rofp-upload-complete-title">Research Brief saved</div>
                                    <div className="rofp-upload-complete-sub">Omi has this context for the exploration.</div>
                                </div>
                                <button className="rofp-material-edit-btn" onClick={handleEditBrief} type="button">
                                    <EditIcon /> Edit
                                </button>
                            </div>
                        )}

                        <div className="rofp-material-section-cta">
                            <button
                                className={["rofp-btn-section-submit", !canSubmitBrief ? "rofp-btn-section-submit--disabled" : ""].filter(Boolean).join(" ")}
                                disabled={!canSubmitBrief}
                                onClick={handleSubmitBrief}
                                type="button"
                            >
                                {briefProcessing ? "Saving…" : data.brief.submitted ? "Saved" : "Submit"}
                            </button>
                        </div>
                    </div>

                    {/* ── Section 2: Artifact ─────────────────────────────── */}
                    <div
                        className={[
                            "rofp-material-section",
                            ARTIFACT_COMING_SOON ? "rofp-material-section--coming-soon" : "",
                        ].filter(Boolean).join(" ")}
                    >
                        {ARTIFACT_COMING_SOON && (
                            <div className="rofp-coming-soon-overlay">
                                <span className="rofp-coming-soon-badge">Coming Soon</span>
                            </div>
                        )}
                        <div className="rofp-material-section-head">
                            <h3 className="rofp-material-section-title">Artifact</h3>
                            <p className="rofp-material-section-sub">
                                Share creatives, videos, images, landing pages, claims,
                                storyboards, prototypes, product flows, or anything you want
                                Omi to test with personas.
                            </p>
                        </div>

                        <div className="rofp-material-section-body">
                            <div className="rofp-field-group">
                                <div className="rofp-field-label-row">
                                    <label className="rofp-label" htmlFor="rof-artifact-instruction">
                                        What should Omi do with this artifact?
                                        <span className="rofp-label-optional">Optional</span>
                                    </label>
                                    <Tooltip text="Tell Omi what to test, decode, or react to in this artifact." />
                                </div>
                                <textarea
                                    id="rof-artifact-instruction"
                                    className="rofp-textarea rofp-textarea--lg"
                                    placeholder="This is a campaign creative. Test whether the message is clear, believable, distinctive, and likely to drive interest or purchase intent…."
                                    value={data.artifact.instruction}
                                    maxLength={MATERIAL_INSTRUCTION_MAX_LENGTH}
                                    onFocus={handleFieldFocus}
                                    onBlur={handleFieldBlur}
                                    onChange={e => updateArtifact({ instruction: e.target.value.slice(0, MATERIAL_INSTRUCTION_MAX_LENGTH) })}
                                    rows={3}
                                    disabled={data.artifact.submitted}
                                />
                                <p className="rofp-field-charcount">{data.artifact.instruction.length}/{MATERIAL_INSTRUCTION_MAX_LENGTH}</p>
                            </div>

                            {data.artifact.links.map((link, idx) => (
                                <LinkRow
                                    key={link.id}
                                    value={link.value}
                                    placeholder="Paste a YouTube, video, image, landing page, product page, or creative URL"
                                    onChange={value => updateArtifact({
                                        links: data.artifact.links.map(l => l.id === link.id ? { ...l, value } : l),
                                    })}
                                    removable={data.artifact.links.length > 1 || idx > 0}
                                    onRemove={() => updateArtifact({ links: data.artifact.links.filter(l => l.id !== link.id) })}
                                    onFocus={handleFieldFocus}
                                    onBlur={handleFieldBlur}
                                    disabled={data.artifact.submitted}
                                />
                            ))}

                            <p className="rofp-field-static-note rofp-field-static-note--italic">
                                Links are recommended for videos, social creatives, landing pages, hosted images, and product pages.
                            </p>

                            {canAddArtifactLink && !data.artifact.submitted && (
                                <button
                                    type="button"
                                    className="rofp-material-add-link-btn"
                                    onClick={() => updateArtifact({ links: [...data.artifact.links, emptyLink()] })}
                                >
                                    <PlusIcon /> Add another link
                                </button>
                            )}

                            <MultiUploadSlot
                                label="Image"
                                acceptExtensions={ARTIFACT_EXTENSIONS}
                                maxBytes={ARTIFACT_MAX_BYTES}
                                maxFiles={ARTIFACT_MAX_FILES}
                                formatsLabel="PNG, JPG, GIF, WEBP"
                                files={data.artifact.files}
                                onFilesChange={files => updateArtifact({ files })}
                                disabled={data.artifact.submitted}
                                compact
                            />

                            {artifactItemCount >= 1 && (
                                <ArtifactContentCategorySelect
                                    value={data.artifact.contentCategory}
                                    onChange={contentCategory => updateArtifact({ contentCategory })}
                                    disabled={data.artifact.submitted}
                                />
                            )}

                            {/* DISABLED — comparison-mode categorization UI. See the
                                    block comment near ARTIFACT_MAX_FILES for how to re-enable.
                                {artifactItemCount >= 2 && (
                                    <ArtifactCategoryChips
                                        value={data.artifact.category}
                                        onChange={category => updateArtifact({ category })}
                                        disabled={data.artifact.submitted}
                                    />
                                )}
                                */}
                        </div>

                        {artifactProcessing && <OmiProcessingBar messageIndex={artifactMsgIndex} />}

                        {artifactError && !artifactProcessing && (
                            <p className="rofp-upload-slot-error">{artifactError}</p>
                        )}

                        {data.artifact.submitted && !artifactProcessing && (
                            <div className="rofp-upload-complete">
                                <span className="rofp-upload-complete-icon"><MaterialCheckIcon /></span>
                                <div className="rofp-upload-complete-text">
                                    <div className="rofp-upload-complete-title">Artifact saved</div>
                                    <div className="rofp-upload-complete-sub">Omi can now test this against your personas.</div>
                                </div>
                                <button className="rofp-material-edit-btn" onClick={handleEditArtifact} type="button">
                                    <EditIcon /> Edit
                                </button>
                            </div>
                        )}

                        <div className="rofp-material-section-cta">
                            <button
                                className={["rofp-btn-section-submit", !canSubmitArtifact ? "rofp-btn-section-submit--disabled" : ""].filter(Boolean).join(" ")}
                                disabled={!canSubmitArtifact}
                                onClick={handleSubmitArtifact}
                                type="button"
                            >
                                {artifactProcessing ? "Saving…" : data.artifact.submitted ? "Saved" : "Submit"}
                            </button>
                        </div>
                        {artifactNeedsContentCategory && !artifactProcessing && (
                            <p className="rofp-cta-hint" style={{ textAlign: "right" }}>Pick an artifact content category to continue</p>
                        )}
                        {/* DISABLED alongside the comparison-mode chips above.
                            {artifactNeedsCategory && !artifactProcessing && (
                                <p className="rofp-cta-hint" style={{ textAlign: "right" }}>Pick how these relate to continue</p>
                            )}
                            */}
                    </div>

                </div>{/* END .rofp-material-sections-row */}

                <p className="rofp-upload-footnote">
                    Your materials are used only to support and sharpen this exploration.
                </p>

            </div>

            <div className="rofp-tab-cta">
                <button className="rofp-btn-back" onClick={handleBackClick} type="button" disabled={briefProcessing || artifactProcessing}>
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>Back
                </button>
                <div className="rofp-tab-cta-right">
                    <button
                        className="rofp-btn-continue"
                        onClick={handleContinueClick}
                        type="button"
                    >
                        Continue<span className="rofp-btn-arrow">→</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Other Information
// ─────────────────────────────────────────────────────────────────────────────

interface OtherInformationTabProps {
    data: OtherInformationData;
    onChange: (d: OtherInformationData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const OtherInformationTab: React.FC<OtherInformationTabProps> = ({
    data, onChange, onOmiStateChange, onContinue, onBack,
}) => {
    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => { if (!data.notes) onOmiStateChange("idle"); };
    const handlePreviewClick = () => { onOmiStateChange("navigating"); setTimeout(onContinue, 400); };
    const handleBackClick = () => { onOmiStateChange("navigating"); setTimeout(onBack, 400); };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">Something we missed? Add it here.</h2>
                <p className="rofp-tab-tagline">Anything Omi should know before building the final brief — a nuance, concern, constraint, hunch, or must-answer question?</p>
            </div>
            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-other-info">Other Information<span className="rofp-label-optional">Optional</span></label>
                        <Tooltip text="This is your free space for anything the structured steps missed." />
                    </div>
                    <textarea id="rof-other-info" className="rofp-textarea rofp-textarea--lg" placeholder="Add any extra context, constraints, watch-outs, internal hypotheses, must-include questions, or specific outputs you want from this exploration..." value={data.notes} onFocus={handleFieldFocus} onBlur={handleFieldBlur} onChange={e => onChange({ ...data, notes: e.target.value })} rows={6} />
                </div>
            </div>
            <div className="rofp-tab-cta">
                <button className="rofp-btn-back" onClick={handleBackClick} type="button"><span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>Back</button>
                <div className="rofp-tab-cta-right">
                    <button className="rofp-btn-continue" onClick={handlePreviewClick} type="button">Preview<span className="rofp-btn-arrow">→</span></button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Preview
// ─────────────────────────────────────────────────────────────────────────────

interface PreviewTabProps {
    data: ROFramerData;
    onSubmit: () => void;
    onBack: () => void;
    isSubmitting?: boolean;
    readOnly?: boolean;
}

interface PreviewSection {
    heading: string;
    body: string;
}

const buildPreviewSections = (data: ROFramerData): PreviewSection[] => {
    const sections: PreviewSection[] = [];

    const { context } = data;
    const hasContext = context.companyName || context.industry || context.website || context.competitors.length > 0;
    if (hasContext) {
        const lines: string[] = [];
        if (context.companyName) lines.push(`Brand: ${context.companyName}`);
        if (context.industry) lines.push(`Industry: ${context.industry}`);
        if (context.website) lines.push(`Website: ${context.website}`);
        if (context.competitors.length) lines.push(`Competitors: ${context.competitors.map(c => c.name).join(", ")}`);
        sections.push({ heading: "The Context", body: lines.join("\n") });
    }

    if (data.businessTrigger.trigger.trim()) sections.push({ heading: "Business Trigger", body: data.businessTrigger.trigger.trim() });
    if (data.customerUnknown.unknown.trim()) sections.push({ heading: "Customer Unknown", body: data.customerUnknown.unknown.trim() });
    if (data.decisionMoment.decision.trim()) sections.push({ heading: "Decision Moment", body: data.decisionMoment.decision.trim() });
    if (data.audienceSegments.audience.trim()) sections.push({ heading: "Audience & Segments", body: data.audienceSegments.audience.trim() });

    const briefLink = data.material.brief.link.trim();
    const artifactLinks = data.material.artifact.links.map(l => l.value.trim()).filter(Boolean);
    const artifactFileNames = data.material.artifact.files.map(f => f.fileName).filter((n): n is string => Boolean(n));
    const hasMaterial =
        data.material.brief.instruction.trim() || data.material.artifact.instruction.trim() ||
        briefLink || data.material.brief.file.fileName ||
        artifactLinks.length || artifactFileNames.length;

    if (hasMaterial) {
        const lines: string[] = [];
        if (data.material.brief.instruction.trim()) lines.push(`Research Brief instruction: ${data.material.brief.instruction.trim()}`);
        if (data.material.brief.file.fileName) lines.push(`Research Brief file: ${data.material.brief.file.fileName}`);
        if (briefLink) lines.push(`Research Brief link: ${briefLink}`);
        if (data.material.artifact.instruction.trim()) lines.push(`Artifact instruction: ${data.material.artifact.instruction.trim()}`);
        artifactFileNames.forEach(name => lines.push(`Artifact file: ${name}`));
        artifactLinks.forEach(link => lines.push(`Artifact link: ${link}`));
        // DISABLED alongside the categorization feature above.
        // const categoryLabel = artifactCategoryLabel(data.material.artifact.category);
        // if (categoryLabel) lines.push(`Artifact grouping: ${categoryLabel}`);
        sections.push({ heading: "Add Material", body: lines.join("\n") });
    }

    if (data.otherInformation.notes.trim()) sections.push({ heading: "Other Information", body: data.otherInformation.notes.trim() });

    return sections;
};

const PreviewTab: React.FC<PreviewTabProps> = ({ data, onSubmit, onBack, isSubmitting, readOnly }) => {
    const sections = buildPreviewSections(data);
    const isEmpty = sections.length === 0;

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">
                    {readOnly ? "Your research framing so far" : "Your research objective, compiled"}
                </h2>
                <p className="rofp-tab-tagline">
                    {readOnly
                        ? "Here's everything you've entered in the research framer. This is read-only — close this to continue your chat with Omi."
                        : "A quick look at everything Omi will use to build your brief. Go back to adjust anything before you submit."}
                </p>
            </div>

            {isEmpty ? (
                <div className="rofp-preview-empty">
                    <p className="rofp-preview-empty-text">
                        {readOnly
                            ? "No saved framing yet — nothing's been filled in."
                            : "Nothing's been filled in yet — go back and answer a few prompts to see your compiled objective here."}
                    </p>
                </div>
            ) : (
                <div className="rofp-preview-box">
                    {sections.map((section, i) => (
                        <div className="rofp-preview-section" key={section.heading}>
                            <div className="rofp-preview-section-heading">{section.heading}</div>
                            <p className="rofp-preview-section-body">{section.body}</p>
                            {i < sections.length - 1 && <div className="rofp-preview-divider" />}
                        </div>
                    ))}
                </div>
            )}

            <div className="rofp-tab-cta">
                <button className="rofp-btn-back" onClick={onBack} type="button" disabled={isSubmitting}>
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>
                    {readOnly ? "Close" : "Back"}
                </button>
                {!readOnly && (
                    <div className="rofp-tab-cta-right">
                        <button
                            className={["rofp-btn-continue", isEmpty || isSubmitting ? "rofp-btn-continue--disabled" : ""].filter(Boolean).join(" ")}
                            disabled={isEmpty || isSubmitting}
                            onClick={() => { if (!isSubmitting) onSubmit(); }}
                            type="button"
                        >
                            {isSubmitting ? "Saving…" : "Submit"}
                        </button>
                        {isEmpty && !isSubmitting && <p className="rofp-cta-hint">Fill in at least one section to submit</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Coming-soon placeholder
// ─────────────────────────────────────────────────────────────────────────────

const ComingSoonTab: React.FC<{ label: string }> = ({ label }) => (
    <div className="rofp-tab-content rofp-tab-coming-soon">
        <div className="rofp-coming-inner">
            <div className="rofp-coming-icon">◈</div>
            <h2 className="rofp-coming-title">{label}</h2>
            <p className="rofp-coming-sub">This section is being designed. Check back soon.</p>
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────────

const ResearchObjectiveFramer: React.FC<ResearchObjectiveFramerProps> = ({
    onSubmit, onBack,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { workspaceId, objectiveId } = useParams<{ workspaceId: string; objectiveId: string }>();

    const { mutate: saveFramer, isPending: isSaving } =
        useCreateResearchObjectiveFromFramer(workspaceId, objectiveId) as any;

    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

    const handleBackToObjective = useCallback(() => {
        if (onBack) { onBack(); }
        else if (returnTo) { navigate(returnTo); }
        else { navigate(-1); }
    }, [onBack, returnTo, navigate]);

    const initialTabFromState = (location.state as { initialTab?: TabId } | null)?.initialTab;
    // If opened specifically to review a saved draft, treat Preview as
    // read-only (no Submit button) so users can't accidentally re-trigger
    // a save just by looking at what they typed. In this mode every other
    // tab is locked — the user can only be on "review" — so nothing can
    // be edited after submission and silently drift out of sync with
    // what's already been persisted on the backend.
    const isReviewOnlyOpen = initialTabFromState === "review";

    const [activeTab, setActiveTab] = useState<TabId>(initialTabFromState ?? "context");
    const [omiState, setOmiState] = useState<OmiState>("idle");

    const tabScrollRef = useRef<HTMLDivElement>(null);
    const { canScrollLeft, canScrollRight, recompute: recomputeTabScroll } = useTabNavScrollState(tabScrollRef);
    const scrollTabsBy = (amount: number) => { tabScrollRef.current?.scrollBy({ left: amount, behavior: "smooth" }); };

    // In review-only mode, hydrate from the permanent "last submitted"
    // snapshot — NOT the draft, which is cleared as soon as a submit
    // succeeds and would otherwise leave this screen empty.
    const [data, setData] = useState<ROFramerData>(() => {
        if (isReviewOnlyOpen) {
            return loadFramerSubmittedData(objectiveId) ?? emptyFramerData();
        }
        return loadFramerDraft(objectiveId) ?? emptyFramerData();
    });

    // Persist the draft locally on every change, so users can come back and
    // review (or continue) without losing what they've typed. Nothing here
    // touches the backend — this is purely a local "don't lose my inputs" cache.
    // Skipped entirely in review-only mode: that screen is read-only and must
    // never overwrite the draft (or anything else) with its snapshot data.
    useEffect(() => {
        if (isReviewOnlyOpen) return;
        saveFramerDraft(objectiveId, data);
    }, [data, objectiveId, isReviewOnlyOpen]);

    const activeTabIndex = TABS.findIndex(t => t.id === activeTab);

    const goToTab = useCallback((id: TabId) => {
        setOmiState("navigating");
        setTimeout(() => { setActiveTab(id); setOmiState("idle"); }, 350);
    }, []);

    useEffect(() => {
        const container = tabScrollRef.current;
        if (!container) return;
        const activeBtn = container.querySelector<HTMLButtonElement>(`[data-tab-id="${activeTab}"]`);
        activeBtn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        const t = setTimeout(recomputeTabScroll, 360);
        return () => clearTimeout(t);
    }, [activeTab, recomputeTabScroll]);

    const handleContinue = useCallback(() => {
        const nextIndex = activeTabIndex + 1;
        const nextTab = getTab(nextIndex);
        if (nextTab) { goToTab(nextTab.id); return; }

        if (isSaving) return;
        setOmiState("success");

        saveFramer(buildFramerPayload(data), {
            onSuccess: (response: any) => {
                clearFramerDraft(objectiveId);
                // Snapshot exactly what was submitted so the read-only
                // Preview (opened later via "Review your research framing →")
                // has something to render — the draft above is gone by now.
                saveFramerSubmittedData(objectiveId, data);
                // Mark this objective as having a submitted Framer — this is
                // what drives the "Review your research framing →" entry
                // point on the chat screen. Only set this once the save
                // actually succeeds, never on intermediate tab changes.
                markFramerSubmitted(objectiveId);
                const needsFollowup = response?.data?.needs_followup === true;
                toast.success(
                    needsFollowup
                        ? "Got it — Omi has a quick follow-up for you before this is ready."
                        : "Research objective saved. Ready to build personas."
                );
                onSubmit?.(data);
                if (returnTo) { navigate(returnTo); }
                else if (workspaceId && objectiveId) {
                    navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/research-mode`);
                } else { handleBackToObjective(); }
            },
            onError: (error: any) => {
                setOmiState("idle");
                toast.error(error?.response?.data?.detail ?? "Couldn't save the research objective. Please try again.");
            },
        });
    }, [activeTabIndex, data, goToTab, handleBackToObjective, isSaving, navigate, objectiveId, onSubmit, returnTo, saveFramer, workspaceId]);

    const handleBack = useCallback(() => {
        const prevTab = getTab(activeTabIndex - 1);
        if (prevTab) goToTab(prevTab.id);
    }, [activeTabIndex, goToTab]);

    return (
        <div className="rofp-page">
            <button className="rofp-back-btn" onClick={handleBackToObjective} type="button">← Back</button>

            <div className="rofp-hero">
                <div className="rofp-omi-wrap"><OmiAvatar state={omiState} /></div>
                <h1 className="rofp-master-title">Frame your research objective</h1>
                <p className="rofp-master-tagline">Answer a few guided prompts and Omi will turn your business question into a sharper exploration brief.</p>
                <p className="rofp-master-support"><em>No pressure to be perfect. Start with what you know — Omi will help shape the thinking as you go.</em></p>
            </div>

            <div className="rofp-tab-nav-outer">
                <TabNavArrow direction="left" disabled={!canScrollLeft} onClick={() => scrollTabsBy(-TAB_NAV_SCROLL_AMOUNT)} />
                <div ref={tabScrollRef} className="rofp-tab-nav-wrap">
                    <div className="rofp-tab-nav" role="tablist">
                        {TABS.map((tab, i) => {
                            const isActive = tab.id === activeTab;
                            // In review-only mode, ONLY the Preview tab is
                            // accessible — every other tab is locked so a
                            // user who already submitted can't sneak back
                            // in and edit fields that the backend has
                            // already consumed/keyed off exploration_id.
                            const isAccessible = isReviewOnlyOpen ? tab.id === "review" : true;
                            const isDone = i < activeTabIndex;
                            return (
                                <button
                                    key={tab.id}
                                    data-tab-id={tab.id}
                                    role="tab"
                                    aria-selected={isActive}
                                    className={["rofp-tab-btn", isActive ? "rofp-tab-btn--active" : "", isDone ? "rofp-tab-btn--done" : "", !isAccessible && !isActive ? "rofp-tab-btn--locked" : ""].filter(Boolean).join(" ")}
                                    onClick={() => { if (isAccessible) goToTab(tab.id); }}
                                    disabled={!isAccessible && !isActive}
                                    type="button"
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <TabNavArrow direction="right" disabled={!canScrollRight} onClick={() => scrollTabsBy(TAB_NAV_SCROLL_AMOUNT)} />
            </div>

            <div className="rofp-panel" role="tabpanel">
                {activeTab === "context" && (
                    <ContextTab data={data.context} onChange={ctx => setData(d => ({ ...d, context: ctx }))} onOmiStateChange={setOmiState} onContinue={handleContinue} />
                )}
                {activeTab === "problem" && (
                    <BusinessTriggerTab data={data.businessTrigger} onChange={bt => setData(d => ({ ...d, businessTrigger: bt }))} onOmiStateChange={setOmiState} onContinue={handleContinue} onBack={handleBack} />
                )}
                {activeTab === "hypothesis" && (
                    <CustomerUnknownTab data={data.customerUnknown} onChange={cu => setData(d => ({ ...d, customerUnknown: cu }))} onOmiStateChange={setOmiState} onContinue={handleContinue} onBack={handleBack} />
                )}
                {activeTab === "decision_moment" && (
                    <DecisionMomentTab data={data.decisionMoment} onChange={dm => setData(d => ({ ...d, decisionMoment: dm }))} onOmiStateChange={setOmiState} onContinue={handleContinue} onBack={handleBack} />
                )}
                {activeTab === "audience" && (
                    <AudienceSegmentsTab data={data.audienceSegments} onChange={as => setData(d => ({ ...d, audienceSegments: as }))} onOmiStateChange={setOmiState} onContinue={handleContinue} onBack={handleBack} />
                )}
                {activeTab === "material" && (
                    <MaterialTab data={data.material} onChange={material => setData(d => ({ ...d, material }))} onOmiStateChange={setOmiState} onContinue={handleContinue} onBack={handleBack} />
                )}
                {activeTab === "other_info" && (
                    <OtherInformationTab data={data.otherInformation} onChange={oi => setData(d => ({ ...d, otherInformation: oi }))} onOmiStateChange={setOmiState} onContinue={handleContinue} onBack={handleBack} />
                )}
                {activeTab === "review" && (
                    <PreviewTab
                        data={data}
                        onSubmit={handleContinue}
                        // Read-only mode must never route "back" into an
                        // editable tab (that's exactly the hole we're
                        // closing) — it exits the framer entirely instead.
                        onBack={isReviewOnlyOpen ? handleBackToObjective : handleBack}
                        isSubmitting={isSaving}
                        readOnly={isReviewOnlyOpen}
                    />
                )}
            </div>
        </div>
    );
};

export default ResearchObjectiveFramer;