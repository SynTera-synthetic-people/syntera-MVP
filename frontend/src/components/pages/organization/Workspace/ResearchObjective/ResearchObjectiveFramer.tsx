import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useCreateResearchObjectiveFromFramer } from "../../../../../hooks/useOmiChat";
import "./ResearchObjectiveFramer.css";

import OmiIdle from "../../../../../assets/Omi Animations/IdleStateMotion_Lite.mp4";
import OmiPencil from "../../../../../assets/Omi Animations/OmiPencil.mp4";
import OmiKeyboard from "../../../../../assets/Omi Animations/OmiKeyboard.mp4";
import OmiSuccess from "../../../../../assets/Omi Animations/Omi Micro-Celebration_Lite.mp4";
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

// "Add Material" — a single optional file upload plus a short instruction
// telling Omi what the file is and what to do with it. uploadStatus tracks
// the local upload lifecycle; the actual backend processing call is wired
// in separately, this just models the UI states (idle -> processing -> done).
type MaterialUploadStatus = "idle" | "processing" | "done";

interface MaterialData {
    instruction: string;
    fileName: string | null;
    fileSizeLabel: string | null;
    uploadStatus: MaterialUploadStatus;
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

// Maps this wizard's tab shape to the backend's /from-framer payload.
// "Other Information" has no dedicated research component on the backend —
// it's passed through as additional_notes and woven into the synthesized
// objective as extra context rather than a tracked component.
function buildFramerPayload(data: ROFramerData) {
    return {
        brand_name: data.context.companyName || undefined,
        industry: data.context.industry || undefined,
        website: data.context.website || undefined,
        competitors: data.context.competitors.map(c => c.name),
        business_context: data.businessTrigger.trigger || undefined,
        information_gap: data.customerUnknown.unknown || undefined,
        decision_problem: data.decisionMoment.decision || undefined,
        target_audience: data.audienceSegments.audience || undefined,
        // The uploaded file itself is handled by a separate upload/processing
        // call (wired in later) — here we only pass along what the user typed
        // about it, so Omi has the instruction even before that pipeline lands.
        material_instruction: data.material.instruction || undefined,
        additional_notes: data.otherInformation.notes || undefined,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab registry — add entries here as each new tab is designed
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

// Derives the union type from whatever is currently in the array
type TabId = typeof TABS[number]["id"];

// Type-safe tab lookup — avoids the "possibly undefined" error that arises
// when TypeScript treats a mutable array index as potentially out-of-bounds
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
        // SVG fallback — used when a video path resolves to an empty string
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
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────

const Tooltip: React.FC<{ text: string }> = ({ text }) => {
    const [visible, setVisible] = useState(false);
    return (
        <span
            className="rofp-tooltip-wrap"
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            <span className="rofp-tooltip-icon" aria-label="More info">?</span>
            {visible && <span className="rofp-tooltip-bubble">{text}</span>}
        </span>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab strip with left/right scroll arrows
// Shows arrows only when the strip actually overflows its container, and
// disables whichever arrow points toward an edge that's already reached.
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

        // Re-check after layout settles (fonts/async content can change widths)
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
        // Only revert to idle if all fields are still empty
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
                                        : "https://" + data.website
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Visit ↗
                            </a>
                        )}
                    </div>
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

                    {/* Pill list — always visible, wraps horizontally as competitors are added */}
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

            {/* CTA */}
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
// Business Trigger — "What sparked this exploration?"
// ─────────────────────────────────────────────────────────────────────────────

interface BusinessTriggerTabProps {
    data: BusinessTriggerData;
    onChange: (d: BusinessTriggerData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const BusinessTriggerTab: React.FC<BusinessTriggerTabProps> = ({
    data,
    onChange,
    onOmiStateChange,
    onContinue,
    onBack,
}) => {
    const canContinue = data.trigger.trim().length > 0;

    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => {
        if (!data.trigger) onOmiStateChange("idle");
    };

    const handleContinueClick = () => {
        if (!canContinue) return;
        onOmiStateChange("navigating");
        setTimeout(onContinue, 400);
    };

    const handleBackClick = () => {
        onOmiStateChange("navigating");
        setTimeout(onBack, 400);
    };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">What sparked this exploration?</h2>
                <p className="rofp-tab-tagline">
                    What business moment, challenge, or opportunity created the need
                    to understand customers better?
                </p>
            </div>

            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-trigger">
                            Business Trigger
                        </label>
                        <Tooltip text="What changed recently that made this urgent? A launch, a competitor move, a number that dipped, or a question leadership needs answered." />
                    </div>
                    <textarea
                        id="rof-trigger"
                        className="rofp-textarea rofp-textarea--lg"
                        placeholder={
                            "We are exploring this because...\n\n" +
                            "Upcoming launch, customer usage & attitude, growth opportunity, " +
                            "competitor move, churn, low adoption, pricing question, new market, " +
                            "product confusion, campaign planning..."
                        }
                        value={data.trigger}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, trigger: e.target.value })}
                        rows={6}
                    />
                </div>
            </div>

            {/* CTA */}
            <div className="rofp-tab-cta">
                <button
                    className="rofp-btn-back"
                    onClick={handleBackClick}
                    type="button"
                >
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>
                    Back
                </button>
                <div className="rofp-tab-cta-right">
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
                            Tell us what sparked this to continue
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Customer Unknown — "What customer truth is missing?"
// ─────────────────────────────────────────────────────────────────────────────

interface CustomerUnknownTabProps {
    data: CustomerUnknownData;
    onChange: (d: CustomerUnknownData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const CustomerUnknownTab: React.FC<CustomerUnknownTabProps> = ({
    data,
    onChange,
    onOmiStateChange,
    onContinue,
    onBack,
}) => {
    const canContinue = data.unknown.trim().length > 0;

    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => {
        if (!data.unknown) onOmiStateChange("idle");
    };

    const handleContinueClick = () => {
        if (!canContinue) return;
        onOmiStateChange("navigating");
        setTimeout(onContinue, 400);
    };

    const handleBackClick = () => {
        onOmiStateChange("navigating");
        setTimeout(onBack, 400);
    };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">What customer truth is missing?</h2>
                <p className="rofp-tab-tagline">
                    What do you not yet understand about customers that is making the
                    next move difficult?
                </p>
            </div>

            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-customer-unknown">
                            Customer Unknown
                        </label>
                        <Tooltip text="What's the one thing about your customer you genuinely don't know? The clearer the gap, the sharper the research." />
                    </div>
                    <textarea
                        id="rof-customer-unknown"
                        className="rofp-textarea rofp-textarea--lg"
                        placeholder={
                            "We don't know the customer's...\n\n" +
                            "Motivation, hesitation, trust gap, price sensitivity, perceived " +
                            "value, switching reason, adoption barrier, emotional tension..."
                        }
                        value={data.unknown}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, unknown: e.target.value })}
                        rows={6}
                    />
                </div>
            </div>

            {/* CTA */}
            <div className="rofp-tab-cta">
                <button
                    className="rofp-btn-back"
                    onClick={handleBackClick}
                    type="button"
                >
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>
                    Back
                </button>
                <div className="rofp-tab-cta-right">
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
                            Tell us the missing customer truth to continue
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Decision Moment — "What decision are we unlocking?"
// ─────────────────────────────────────────────────────────────────────────────

interface DecisionMomentTabProps {
    data: DecisionMomentData;
    onChange: (d: DecisionMomentData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const DecisionMomentTab: React.FC<DecisionMomentTabProps> = ({
    data,
    onChange,
    onOmiStateChange,
    onContinue,
    onBack,
}) => {
    const canContinue = data.decision.trim().length > 0;

    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => {
        if (!data.decision) onOmiStateChange("idle");
    };

    const handleContinueClick = () => {
        if (!canContinue) return;
        onOmiStateChange("navigating");
        setTimeout(onContinue, 400);
    };

    const handleBackClick = () => {
        onOmiStateChange("navigating");
        setTimeout(onBack, 400);
    };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">What decision are we unlocking?</h2>
                <p className="rofp-tab-tagline">
                    What decision will your team make using this customer
                    understanding?
                </p>
            </div>

            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-decision-moment">
                            Decision Moment
                        </label>
                        <Tooltip text="What real call will this research inform? If there's no genuine choice on the table, there's no decision to unlock." />
                    </div>
                    <textarea
                        id="rof-decision-moment"
                        className="rofp-textarea rofp-textarea--lg"
                        placeholder={
                            "These insights will help the team decide...\n\n" +
                            "Pricing, positioning, messaging, product roadmap, feature " +
                            "prioritization, market entry, targeting, onboarding, retention, " +
                            "offer design..."
                        }
                        value={data.decision}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, decision: e.target.value })}
                        rows={6}
                    />
                </div>
            </div>

            {/* CTA */}
            <div className="rofp-tab-cta">
                <button
                    className="rofp-btn-back"
                    onClick={handleBackClick}
                    type="button"
                >
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>
                    Back
                </button>
                <div className="rofp-tab-cta-right">
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
                            Tell us what decision this will unlock to continue
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Audience & Segments — "Who should we understand?"
// ─────────────────────────────────────────────────────────────────────────────

interface AudienceSegmentsTabProps {
    data: AudienceSegmentsData;
    onChange: (d: AudienceSegmentsData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const AudienceSegmentsTab: React.FC<AudienceSegmentsTabProps> = ({
    data,
    onChange,
    onOmiStateChange,
    onContinue,
    onBack,
}) => {
    const canContinue = data.audience.trim().length > 0;

    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => {
        if (!data.audience) onOmiStateChange("idle");
    };

    const handleContinueClick = () => {
        if (!canContinue) return;
        onOmiStateChange("navigating");
        setTimeout(onContinue, 400);
    };

    const handleBackClick = () => {
        onOmiStateChange("navigating");
        setTimeout(onBack, 400);
    };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">Who should we understand?</h2>
                <p className="rofp-tab-tagline">
                    Which customers should this exploration represent?
                </p>
                <p className="rofp-tab-note">
                    Don't worry about perfect targeting yet — we'll get into detailed
                    persona building right after this.
                </p>
            </div>

            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-audience-segments">
                            Audience & Segments
                        </label>
                        <Tooltip text="Who needs to be represented in this exploration? Think in directional groups for now — specific personas come next." />
                    </div>
                    <textarea
                        id="rof-audience-segments"
                        className="rofp-textarea rofp-textarea--lg"
                        placeholder={
                            "We want to understand audience, especially segments...\n\n" +
                            "Current users, prospects, lapsed users, switchers, loyalists, " +
                            "first-time buyers, premium buyers, value seekers, skeptics, " +
                            "heavy users..."
                        }
                        value={data.audience}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, audience: e.target.value })}
                        rows={6}
                    />
                    <p className="rofp-field-static-note">
                        Keep it directional for now. You'll define detailed personas,
                        demographics, and traits in the next step.
                    </p>
                </div>
            </div>

            {/* CTA */}
            <div className="rofp-tab-cta">
                <button
                    className="rofp-btn-back"
                    onClick={handleBackClick}
                    type="button"
                >
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>
                    Back
                </button>
                <div className="rofp-tab-cta-right">
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
                            Tell us who this should represent to continue
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Add Material — "Share your briefs and artifacts"
// Single optional file upload + an instruction telling Omi what it is and
// what to do with it. While the upload is "processing" (backend wiring to
// be added later), Continue is blocked so the user doesn't navigate away
// from an in-flight upload and lose track of it.
// ─────────────────────────────────────────────────────────────────────────────

const MATERIAL_ACCEPTED_EXTENSIONS = [
    ".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg",
];

const MATERIAL_PROCESSING_MESSAGES = [
    "Reading your uploaded context…",
    "Pulling out key themes and claims…",
    "Finding signals Omi should learn…",
    "Almost ready ✨",
];

// Roughly how long each processing message stays on screen before the next
// one rotates in. The actual completion is driven by the real upload/process
// call once wired in — this is just the local placeholder cadence.
const MATERIAL_PROCESSING_INTERVAL_MS = 1600;

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MaterialUploadIcon: React.FC = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
            d="M7 18a4 4 0 0 1-.6-7.96A5 5 0 0 1 16.6 8.06 4.5 4.5 0 0 1 17 17H16"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
            d="M12 21v-7m0 0-2.5 2.5M12 14l2.5 2.5"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        />
    </svg>
);

const MaterialFileIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
            d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
            stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
        />
        <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
);

const MaterialCheckIcon: React.FC = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

interface MaterialTabProps {
    data: MaterialData;
    onChange: (d: MaterialData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const MaterialTab: React.FC<MaterialTabProps> = ({
    data,
    onChange,
    onOmiStateChange,
    onContinue,
    onBack,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [processingMsgIndex, setProcessingMsgIndex] = useState(0);
    const [fileError, setFileError] = useState<string | null>(null);

    const isProcessing = data.uploadStatus === "processing";
    const isDone = data.uploadStatus === "done";
    // Continue is blocked only while an upload is actively processing —
    // the tab itself is optional, so zero files never blocks Continue.
    const canContinue = !isProcessing;

    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => {
        if (!data.instruction && !data.fileName) onOmiStateChange("idle");
    };

    // Cycle the processing message while a file is "processing". This is a
    // local placeholder timer standing in for the real backend progress
    // signal, which will replace this once that pipeline is wired in.
    useEffect(() => {
        if (!isProcessing) {
            setProcessingMsgIndex(0);
            return;
        }
        if (processingMsgIndex >= MATERIAL_PROCESSING_MESSAGES.length - 1) {
            // Hold on the last message until the (future) real completion signal
            // flips uploadStatus to "done" — this timer doesn't do that itself.
            return;
        }
        const t = setTimeout(
            () => setProcessingMsgIndex(i => i + 1),
            MATERIAL_PROCESSING_INTERVAL_MS
        );
        return () => clearTimeout(t);
    }, [isProcessing, processingMsgIndex]);

    const acceptFile = (file: File) => {
        const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
        if (!MATERIAL_ACCEPTED_EXTENSIONS.includes(ext)) {
            setFileError("That file type isn't supported. Please use one of the formats listed below.");
            return;
        }
        setFileError(null);
        onChange({
            ...data,
            fileName: file.name,
            fileSizeLabel: formatFileSize(file.size),
            uploadStatus: "processing",
        });
        onOmiStateChange("typing");
        // NOTE: actual upload + backend processing call is wired in separately.
        // For now this only models the local UI state machine (idle -> processing).
        // The transition from "processing" to "done" will be driven by that
        // call's completion callback once it exists.
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) acceptFile(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        if (isProcessing) return;
        const file = e.dataTransfer.files?.[0];
        if (file) acceptFile(file);
    };

    const handleRemoveFile = () => {
        if (isProcessing) return;
        setFileError(null);
        onChange({
            ...data,
            fileName: null,
            fileSizeLabel: null,
            uploadStatus: "idle",
        });
    };

    const handleContinueClick = () => {
        if (!canContinue) return;
        onOmiStateChange("navigating");
        setTimeout(onContinue, 400);
    };

    const handleBackClick = () => {
        if (isProcessing) return;
        onOmiStateChange("navigating");
        setTimeout(onBack, 400);
    };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">Share your briefs and artifacts</h2>
                <p className="rofp-tab-tagline">
                    Add research briefs, creatives, concepts, reports, or any artifact
                    you want Omi to read, test, or use as context.
                </p>
            </div>

            <div className="rofp-fields">

                {/* Instruction */}
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-material-instruction">
                            What is this, and what should Omi do with it?
                            <span className="rofp-label-optional">Optional</span>
                        </label>
                        <Tooltip text="Tell Omi what kind of artifact this is and what you want tested, decoded, or used as context." />
                    </div>
                    <textarea
                        id="rof-material-instruction"
                        className="rofp-textarea"
                        placeholder={
                            "Tell Omi if this is a creative, research brief, concept note or " +
                            "anything else — and what you want tested, decoded, or used as " +
                            "context...\n\n" +
                            "e.g. This is a campaign creative we want to test for message " +
                            "clarity and purchase intent... or This is a research brief. Use " +
                            "it to understand the category, audience, and key unknowns…"
                        }
                        value={data.instruction}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, instruction: e.target.value })}
                        rows={4}
                    />
                </div>

                {/* Upload zone / file card */}
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label">File</label>
                        <Tooltip text="Upload one file — a brief, creative, report, or any other artifact." />
                    </div>

                    {!data.fileName ? (
                        <div
                            className={[
                                "rofp-upload-zone",
                                isDragOver ? "rofp-upload-zone--dragover" : "",
                            ].filter(Boolean).join(" ")}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => {
                                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                            }}
                        >
                            <span className="rofp-upload-zone-icon">
                                <MaterialUploadIcon />
                            </span>
                            <span className="rofp-upload-zone-title">
                                Drop your files here, or click to upload
                            </span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="rofp-upload-zone-input"
                                accept={MATERIAL_ACCEPTED_EXTENSIONS.join(",")}
                                onChange={handleFileInputChange}
                            />
                        </div>
                    ) : (
                        <div className="rofp-upload-file-card">
                            <span className="rofp-upload-file-icon">
                                <MaterialFileIcon />
                            </span>
                            <div className="rofp-upload-file-info">
                                <div className="rofp-upload-file-name">{data.fileName}</div>
                                {data.fileSizeLabel && (
                                    <div className="rofp-upload-file-meta">{data.fileSizeLabel}</div>
                                )}
                            </div>
                            <button
                                className="rofp-upload-file-remove"
                                onClick={handleRemoveFile}
                                disabled={isProcessing}
                                type="button"
                                aria-label="Remove file"
                            >
                                ×
                            </button>
                        </div>
                    )}

                    {fileError && (
                        <p className="rofp-cta-hint" style={{ color: "#f87171", marginTop: 8 }}>
                            {fileError}
                        </p>
                    )}

                    {/* Processing bar — mirrors the report-generation Omi loader */}
                    {isProcessing && (
                        <div className="rofp-upload-omi-bar">
                            <div className="rofp-upload-omi-avatar">
                                <video src={OmiKeyboard} autoPlay loop muted playsInline />
                            </div>
                            <div className="rofp-upload-omi-msg-wrap">
                                <span className="rofp-upload-omi-msg">
                                    <span className="rofp-upload-omi-bullet" />
                                    {MATERIAL_PROCESSING_MESSAGES[processingMsgIndex]}
                                </span>
                            </div>
                            <div className="rofp-upload-omi-dots">
                                <span /><span /><span />
                            </div>
                        </div>
                    )}

                    {/* Upload complete */}
                    {isDone && (
                        <div className="rofp-upload-complete">
                            <span className="rofp-upload-complete-icon">
                                <MaterialCheckIcon />
                            </span>
                            <div className="rofp-upload-complete-text">
                                <div className="rofp-upload-complete-title">Upload Complete</div>
                                <div className="rofp-upload-complete-sub">
                                    Context loaded. Nice. Omi can now use these materials to
                                    sharpen your exploration.
                                </div>
                            </div>
                        </div>
                    )}

                    <p className="rofp-upload-formats">
                        <strong>Supported formats</strong> · PDF, DOCX, PPTX, XLSX, CSV, PNG, JPG
                    </p>
                    <p className="rofp-upload-footnote">
                        Your files are used only to support this exploration.
                    </p>
                </div>

            </div>

            {/* CTA */}
            <div className="rofp-tab-cta">
                <button
                    className="rofp-btn-back"
                    onClick={handleBackClick}
                    type="button"
                    disabled={isProcessing}
                >
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>
                    Back
                </button>
                <div className="rofp-tab-cta-right">
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
                    {isProcessing && (
                        <p className="rofp-cta-hint">
                            Hang tight while Omi reads through your upload
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Other Information — "Something we missed? Add it here."
// ─────────────────────────────────────────────────────────────────────────────

interface OtherInformationTabProps {
    data: OtherInformationData;
    onChange: (d: OtherInformationData) => void;
    onOmiStateChange: (s: OmiState) => void;
    onContinue: () => void;
    onBack: () => void;
}

const OtherInformationTab: React.FC<OtherInformationTabProps> = ({
    data,
    onChange,
    onOmiStateChange,
    onContinue,
    onBack,
}) => {
    // This field is optional — there is nothing to "miss" here, so the
    // Preview button stays enabled regardless of whether anything was typed.
    const handleFieldFocus = () => onOmiStateChange("typing");
    const handleFieldBlur = () => {
        if (!data.notes) onOmiStateChange("idle");
    };

    const handlePreviewClick = () => {
        onOmiStateChange("navigating");
        setTimeout(onContinue, 400);
    };

    const handleBackClick = () => {
        onOmiStateChange("navigating");
        setTimeout(onBack, 400);
    };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">Something we missed? Add it here.</h2>
                <p className="rofp-tab-tagline">
                    Anything Omi should know before building the final brief — a
                    nuance, concern, constraint, hunch, or must-answer question?
                </p>
            </div>

            <div className="rofp-fields">
                <div className="rofp-field-group">
                    <div className="rofp-field-label-row">
                        <label className="rofp-label" htmlFor="rof-other-info">
                            Other Information
                            <span className="rofp-label-optional">Optional</span>
                        </label>
                        <Tooltip text="This is your free space for anything the structured steps missed." />
                    </div>
                    <textarea
                        id="rof-other-info"
                        className="rofp-textarea rofp-textarea--lg"
                        placeholder="Add any extra context, constraints, watch-outs, internal hypotheses, must-include questions, or specific outputs you want from this exploration..."
                        value={data.notes}
                        onFocus={handleFieldFocus}
                        onBlur={handleFieldBlur}
                        onChange={e => onChange({ ...data, notes: e.target.value })}
                        rows={6}
                    />
                </div>
            </div>

            {/* CTA — Back | Preview (no validation gate, field is optional) */}
            <div className="rofp-tab-cta">
                <button
                    className="rofp-btn-back"
                    onClick={handleBackClick}
                    type="button"
                >
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>
                    Back
                </button>
                <div className="rofp-tab-cta-right">
                    <button
                        className="rofp-btn-continue"
                        onClick={handlePreviewClick}
                        type="button"
                    >
                        Preview
                        <span className="rofp-btn-arrow">→</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Preview — compiled read-only summary of the full brief, with Submit
// ─────────────────────────────────────────────────────────────────────────────

interface PreviewTabProps {
    data: ROFramerData;
    onSubmit: () => void;
    onBack: () => void;
    isSubmitting?: boolean;
}

interface PreviewSection {
    heading: string;
    body: string;
}

const buildPreviewSections = (data: ROFramerData): PreviewSection[] => {
    const sections: PreviewSection[] = [];

    const { context } = data;
    const hasContext =
        context.companyName || context.industry || context.website ||
        context.competitors.length > 0;
    if (hasContext) {
        const lines: string[] = [];
        if (context.companyName) lines.push(`Brand: ${context.companyName}`);
        if (context.industry) lines.push(`Industry: ${context.industry}`);
        if (context.website) lines.push(`Website: ${context.website}`);
        if (context.competitors.length) {
            lines.push(`Competitors: ${context.competitors.map(c => c.name).join(", ")}`);
        }
        sections.push({ heading: "The Context", body: lines.join("\n") });
    }

    if (data.businessTrigger.trigger.trim()) {
        sections.push({ heading: "Business Trigger", body: data.businessTrigger.trigger.trim() });
    }
    if (data.customerUnknown.unknown.trim()) {
        sections.push({ heading: "Customer Unknown", body: data.customerUnknown.unknown.trim() });
    }
    if (data.decisionMoment.decision.trim()) {
        sections.push({ heading: "Decision Moment", body: data.decisionMoment.decision.trim() });
    }
    if (data.audienceSegments.audience.trim()) {
        sections.push({ heading: "Audience & Segments", body: data.audienceSegments.audience.trim() });
    }
    if (data.otherInformation.notes.trim()) {
        sections.push({ heading: "Other Information", body: data.otherInformation.notes.trim() });
    }

    return sections;
};

const PreviewTab: React.FC<PreviewTabProps> = ({ data, onSubmit, onBack, isSubmitting }) => {
    const sections = buildPreviewSections(data);
    const isEmpty = sections.length === 0;

    const handleBackClick = () => onBack();
    const handleSubmitClick = () => {
        if (isSubmitting) return;
        onSubmit();
    };

    return (
        <div className="rofp-tab-content">
            <div className="rofp-tab-head">
                <h2 className="rofp-tab-title">Your research objective, compiled</h2>
                <p className="rofp-tab-tagline">
                    A quick look at everything Omi will use to build your brief.
                    Go back to adjust anything before you submit.
                </p>
            </div>

            {isEmpty ? (
                <div className="rofp-preview-empty">
                    <p className="rofp-preview-empty-text">
                        Nothing's been filled in yet — go back and answer a few
                        prompts to see your compiled objective here.
                    </p>
                </div>
            ) : (
                <div className="rofp-preview-box">
                    {sections.map((section, i) => (
                        <div className="rofp-preview-section" key={section.heading}>
                            <div className="rofp-preview-section-heading">
                                {section.heading}
                            </div>
                            <p className="rofp-preview-section-body">{section.body}</p>
                            {i < sections.length - 1 && (
                                <div className="rofp-preview-divider" />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* CTA — Back | Submit */}
            <div className="rofp-tab-cta">
                <button
                    className="rofp-btn-back"
                    onClick={handleBackClick}
                    type="button"
                    disabled={isSubmitting}
                >
                    <span className="rofp-btn-arrow rofp-btn-arrow--back">←</span>
                    Back
                </button>
                <div className="rofp-tab-cta-right">
                    <button
                        className={[
                            "rofp-btn-continue",
                            isEmpty || isSubmitting ? "rofp-btn-continue--disabled" : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        disabled={isEmpty || isSubmitting}
                        onClick={handleSubmitClick}
                        type="button"
                    >
                        {isSubmitting ? "Saving…" : "Submit"}
                    </button>
                    {isEmpty && !isSubmitting && (
                        <p className="rofp-cta-hint">
                            Fill in at least one section to submit
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Coming-soon placeholder for tabs not yet designed
// ─────────────────────────────────────────────────────────────────────────────

const ComingSoonTab: React.FC<{ label: string }> = ({ label }) => (
    <div className="rofp-tab-content rofp-tab-coming-soon">
        <div className="rofp-coming-inner">
            <div className="rofp-coming-icon">◈</div>
            <h2 className="rofp-coming-title">{label}</h2>
            <p className="rofp-coming-sub">
                This section is being designed. Check back soon.
            </p>
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────────

const ResearchObjectiveFramer: React.FC<ResearchObjectiveFramerProps> = ({
    onSubmit,
    onBack,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { workspaceId, objectiveId } = useParams<{
        workspaceId: string;
        objectiveId: string;
    }>();

    const { mutate: saveFramer, isPending: isSaving } =
        useCreateResearchObjectiveFromFramer(workspaceId, objectiveId) as any;

    // This page is reached via AddResearchObjective -> handleOpenROFramer,
    // which passes { returnTo: <AddResearchObjective path> } in router state.
    // Prefer an explicitly-passed onBack prop (if a parent ever renders this
    // component inline rather than via the router); otherwise fall back to
    // navigating to that returnTo path, or simple browser back as a last resort.
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

    const handleBackToObjective = useCallback(() => {
        if (onBack) {
            onBack();
        } else if (returnTo) {
            navigate(returnTo);
        } else {
            navigate(-1);
        }
    }, [onBack, returnTo, navigate]);

    const [activeTab, setActiveTab] = useState<TabId>("context");
    const [omiState, setOmiState] = useState<OmiState>("idle");

    const tabScrollRef = useRef<HTMLDivElement>(null);
    const { canScrollLeft, canScrollRight, recompute: recomputeTabScroll } =
        useTabNavScrollState(tabScrollRef);

    const scrollTabsBy = (amount: number) => {
        tabScrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
    };

    const [data, setData] = useState<ROFramerData>({
        context: {
            companyName: "",
            industry: "",
            website: "",
            competitors: [],
        },
        businessTrigger: {
            trigger: "",
        },
        customerUnknown: {
            unknown: "",
        },
        decisionMoment: {
            decision: "",
        },
        audienceSegments: {
            audience: "",
        },
        material: {
            instruction: "",
            fileName: null,
            fileSizeLabel: null,
            uploadStatus: "idle",
        },
        otherInformation: {
            notes: "",
        },
    });

    const activeTabIndex = TABS.findIndex(t => t.id === activeTab);

    const goToTab = useCallback((id: TabId) => {
        setOmiState("navigating");
        setTimeout(() => {
            setActiveTab(id);
            setOmiState("idle");
        }, 350);
    }, []);

    // Keep the active tab scrolled into view whenever it changes (covers both
    // arrow-button navigation and clicking a tab pill directly).
    useEffect(() => {
        const container = tabScrollRef.current;
        if (!container) return;
        const activeBtn = container.querySelector<HTMLButtonElement>(
            `[data-tab-id="${activeTab}"]`
        );
        activeBtn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        // Recompute arrow visibility shortly after the scroll settles
        const t = setTimeout(recomputeTabScroll, 360);
        return () => clearTimeout(t);
    }, [activeTab, recomputeTabScroll]);

    const handleContinue = useCallback(() => {
        const nextIndex = activeTabIndex + 1;
        // Use the safe accessor so TypeScript knows we've handled the undefined case
        const nextTab = getTab(nextIndex);
        if (nextTab) {
            goToTab(nextTab.id);
            return;
        }

        // No more tabs (Preview's Submit was clicked) — save the brief via the
        // existing RO pipeline. This synthesizes these fields into
        // ResearchObjectives.description, same as the chat-driven flow, so
        // persona/questionnaire/interview/report all pick it up unchanged.
        if (isSaving) return;
        setOmiState("success");

        saveFramer(buildFramerPayload(data), {
            onSuccess: (response: any) => {
                // Low-confidence submissions don't finalize — the backend hands off
                // to Omi's normal follow-up-question flow instead (same as chat).
                // Either way, the right place to land is the chat page: it'll show
                // either Omi's question or the confirmed summary + persona CTAs.
                const needsFollowup = response?.data?.needs_followup === true;
                toast.success(
                    needsFollowup
                        ? "Got it — Omi has a quick follow-up for you before this is ready."
                        : "Research objective saved. Ready to build personas."
                );
                onSubmit?.(data);
                if (returnTo) {
                    navigate(returnTo);
                } else if (workspaceId && objectiveId) {
                    navigate(
                        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/research-mode`
                    );
                } else {
                    handleBackToObjective();
                }
            },
            onError: (error: any) => {
                setOmiState("idle");
                toast.error(
                    error?.response?.data?.detail ??
                    "Couldn't save the research objective. Please try again."
                );
            },
        });
    }, [
        activeTabIndex,
        data,
        goToTab,
        handleBackToObjective,
        isSaving,
        navigate,
        objectiveId,
        onSubmit,
        returnTo,
        saveFramer,
        workspaceId,
    ]);

    const handleBack = useCallback(() => {
        const prevIndex = activeTabIndex - 1;
        const prevTab = getTab(prevIndex);
        if (prevTab) {
            goToTab(prevTab.id);
        }
    }, [activeTabIndex, goToTab]);

    // A tab is accessible if it has been reached during this session
    const accessibleUpTo = TABS.length - 1;

    return (
        <div className="rofp-page">

            <button className="rofp-back-btn" onClick={handleBackToObjective} type="button">
                ← Back
            </button>

            {/* Hero */}
            <div className="rofp-hero">
                <div className="rofp-omi-wrap">
                    <OmiAvatar state={omiState} />
                </div>
                <h1 className="rofp-master-title">Frame your research objective</h1>
                <p className="rofp-master-tagline">
                    Answer a few guided prompts and Omi will turn your business question
                    into a sharper exploration brief.
                </p>
                <p className="rofp-master-support">
                    <em>
                        No pressure to be perfect. Start with what you know — Omi will help
                        shape the thinking as you go.
                    </em>
                </p>
            </div>

            {/* Tab nav */}
            <div className="rofp-tab-nav-outer">
                <TabNavArrow
                    direction="left"
                    disabled={!canScrollLeft}
                    onClick={() => scrollTabsBy(-TAB_NAV_SCROLL_AMOUNT)}
                />
                <div ref={tabScrollRef} className="rofp-tab-nav-wrap">
                    <div className="rofp-tab-nav" role="tablist">
                        {TABS.map((tab, i) => {
                            const isActive = tab.id === activeTab;
                            const isAccessible = i <= accessibleUpTo;
                            const isDone = i < activeTabIndex;

                            return (
                                <button
                                    key={tab.id}
                                    data-tab-id={tab.id}
                                    role="tab"
                                    aria-selected={isActive}
                                    className={[
                                        "rofp-tab-btn",
                                        isActive ? "rofp-tab-btn--active" : "",
                                        isDone ? "rofp-tab-btn--done" : "",
                                        !isAccessible && !isActive ? "rofp-tab-btn--locked" : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    onClick={() => {
                                        if (isAccessible) goToTab(tab.id);
                                    }}
                                    disabled={!isAccessible && !isActive}
                                    type="button"
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <TabNavArrow
                    direction="right"
                    disabled={!canScrollRight}
                    onClick={() => scrollTabsBy(TAB_NAV_SCROLL_AMOUNT)}
                />
            </div>

            {/* Panel */}
            <div className="rofp-panel" role="tabpanel">
                {activeTab === "context" && (
                    <ContextTab
                        data={data.context}
                        onChange={ctx => setData(d => ({ ...d, context: ctx }))}
                        onOmiStateChange={setOmiState}
                        onContinue={handleContinue}
                    />
                )}
                {activeTab === "problem" && (
                    <BusinessTriggerTab
                        data={data.businessTrigger}
                        onChange={bt => setData(d => ({ ...d, businessTrigger: bt }))}
                        onOmiStateChange={setOmiState}
                        onContinue={handleContinue}
                        onBack={handleBack}
                    />
                )}
                {activeTab === "hypothesis" && (
                    <CustomerUnknownTab
                        data={data.customerUnknown}
                        onChange={cu => setData(d => ({ ...d, customerUnknown: cu }))}
                        onOmiStateChange={setOmiState}
                        onContinue={handleContinue}
                        onBack={handleBack}
                    />
                )}
                {activeTab === "decision_moment" && (
                    <DecisionMomentTab
                        data={data.decisionMoment}
                        onChange={dm => setData(d => ({ ...d, decisionMoment: dm }))}
                        onOmiStateChange={setOmiState}
                        onContinue={handleContinue}
                        onBack={handleBack}
                    />
                )}
                {activeTab === "audience" && (
                    <AudienceSegmentsTab
                        data={data.audienceSegments}
                        onChange={as => setData(d => ({ ...d, audienceSegments: as }))}
                        onOmiStateChange={setOmiState}
                        onContinue={handleContinue}
                        onBack={handleBack}
                    />
                )}
                {activeTab === "material" && (
                    <MaterialTab
                        data={data.material}
                        onChange={material =>
                            setData(d => ({
                                ...d,
                                material,
                            }))
                        }
                        onOmiStateChange={setOmiState}
                        onContinue={handleContinue}
                        onBack={handleBack}
                    />
                )}
                {activeTab === "other_info" && (
                    <OtherInformationTab
                        data={data.otherInformation}
                        onChange={oi => setData(d => ({ ...d, otherInformation: oi }))}
                        onOmiStateChange={setOmiState}
                        onContinue={handleContinue}
                        onBack={handleBack}
                    />
                )}
                {activeTab === "review" && (
                    <PreviewTab
                        data={data}
                        onSubmit={handleContinue}
                        onBack={handleBack}
                        isSubmitting={isSaving}
                    />
                )}
            </div>
        </div>
    );
};

export default ResearchObjectiveFramer;