import React, { useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";
import { useCreateResearchObjectiveFromFramer } from "../../../../../hooks/useOmiChat";
import "./ResearchObjectiveFramer.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Competitor { name: string; }

interface BrandContext {
  brandName: string; industry: string; website: string; competitors: Competitor[];
}

interface ComponentAnswers {
  f1: string; f2: string; f3: string; f4: string; f5: string;
  f6: string; f7: string; f8: string; f9: string; f10: string;
}

type FieldKey = keyof ComponentAnswers;

interface ROComponent {
  id: number; name: string; tagline: string; field: FieldKey;
  probe: string; tip: string; placeholder: string; exLabel: string; exText: string;
}

interface ResearchObjectiveFramerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
  workspaceId?: string;
  explorationId?: string;
  onSaved?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 12;

// No emoji. Each component is identified by its index alone — the numbering
// is real here (a fixed methodology sequence), so it's allowed to carry
// meaning rather than decorate.
const COMPONENTS: ROComponent[] = [
  {
    id: 1, name: "Business Context", tagline: "What triggered this research?", field: "f1",
    probe: "What's going on in your business right now that made someone say 'we need research'? A launch coming up, a competitor moved, numbers dropping somewhere, or an investor asking for clarity?",
    tip: "Think: what changed recently that made this urgent? A competitor launch, a business target missed, a product dip.",
    placeholder: "Describe the business situation, the trigger event, and why this research is needed now...",
    exLabel: "Reference answer",
    exText: "An established consumer brand with five years of consistent growth has recorded a 12% volume decline over two consecutive quarters. Two new entrants entered the category in the same period offering comparable benefits at a lower price point. Leadership is reviewing the brand's positioning and needs consumer data before finalising the investment plan for the next fiscal year. The research decision must be made within the next 6 weeks."
  },
  {
    id: 2, name: "Decision Problem", tagline: "What exact decision will this inform?", field: "f2",
    probe: "What's the actual call you're trying to make here? Think of it as a fork in the road — what are the two or three real paths in front of you?",
    tip: "A good decision problem has at least two real options. If there's no genuine choice, there's no real decision problem.",
    placeholder: "State the specific decision this research will inform, with the real options on the table...",
    exLabel: "Reference answer",
    exText: "Should the brand reduce its price to defend volume share against new entrants, or maintain the current price point and invest in strengthening perceived quality and brand equity? A secondary fork: if a price adjustment is made, should it apply to the core SKU or be introduced via a new entry-level variant?"
  },
  {
    id: 3, name: "Information Gap", tagline: "What's unknown that blocks the decision?", field: "f3",
    probe: "What's the one thing you genuinely don't know right now that's making this decision hard? If you knew it, would the path forward become obvious?",
    tip: "Start with 'We don't know...' and finish the sentence honestly. The clearer the gap, the sharper the research design.",
    placeholder: "We don't know...",
    exLabel: "Reference answer",
    exText: "We don't know whether the volume decline is driven by price sensitivity among existing buyers, by competitor trial pulling in newer category entrants, or by a genuine erosion in how consumers perceive the brand relative to alternatives."
  },
  {
    id: 4, name: "Primary Hypothesis", tagline: "Main belief to validate", field: "f4",
    probe: "What's your gut telling you? Finish this sentence: 'We believe that...' — even if you're not 100% sure.",
    tip: "One crisp sentence. Research will confirm or challenge it. Both outcomes are equally useful.",
    placeholder: "We believe that...",
    exLabel: "Reference answer",
    exText: "We believe the volume decline is primarily driven by a perception gap, not a price gap. Consumers who have lapsed believe newer entrants offer a comparable product experience at a lower cost, even where the actual quality difference is meaningful."
  },
  {
    id: 5, name: "Secondary Hypotheses", tagline: "Additional factors that may influence outcome", field: "f5",
    probe: "What else could be going on? List the 'could-also-be-true' factors — things that might be influencing the situation even if you're only 30% sure about them.",
    tip: "These become secondary research questions. List them even if uncertain.",
    placeholder: "List 2–4 additional beliefs worth testing alongside the primary hypothesis...",
    exLabel: "Reference answer",
    exText: "1. Distribution gaps in emerging channels (quick commerce, D2C platforms) may be amplifying share loss.\n2. Pack size and unit economics may be misaligned with how the target audience prefers to buy.\n3. The brand's communication has not been refreshed in over two years."
  },
  {
    id: 6, name: "Target Audience", tagline: "Precise definition of who to study", field: "f6",
    probe: "Who exactly needs to be in this study? Age, gender, location, behaviors, income — be specific.",
    tip: "If you can't describe precisely who they are, you can't find them for the study.",
    placeholder: "Define demographics + purchase behaviors + geography of exactly who to study...",
    exLabel: "Reference answer",
    exText: "Primary category buyers aged 28–45, living in Tier 1 and Tier 2 cities, with a household income between ₹10–30L per annum. They purchase in this category at least once a month, make decisions primarily at the point of sale or via quick commerce apps."
  },
  {
    id: 7, name: "Segmentation Logic", tagline: "Subgroups requiring separate analysis", field: "f7",
    probe: "Within your target audience, are there subgroups who might think or behave very differently from each other?",
    tip: "Good segments have sufficiently different behaviors to warrant different strategic responses.",
    placeholder: "Define 2–4 subgroups with distinct behavioral profiles...",
    exLabel: "Reference answer",
    exText: "Segment A: Active loyalists — purchased our brand in the last 3 months with no competitor purchase.\nSegment B: Dual buyers — purchasing both our brand and a competitor brand.\nSegment C: Switchers — shifted primarily to a competitor in the last 3 months.\nSegment D: Competitor-only buyers."
  },
  {
    id: 8, name: "Competitive Frame", tagline: "Market context and relevant competitors", field: "f8",
    probe: "When your customer is deciding what to buy, who are they comparing you against? Both the obvious names and the ones you'd rather not admit.",
    tip: "The customer's mental shortlist is not always your official competitor list.",
    placeholder: "Define the category, price band, and list direct + indirect competitors...",
    exLabel: "Reference answer",
    exText: "Category: [Relevant product category], [price band per unit].\nDirect competitors: The 2–3 brands that consistently appear in the consumer's active consideration set.\nIndirect substitutes: Adjacent products or formats that fulfil a similar need at a different price point."
  },
  {
    id: 9, name: "Behaviors & Attitudes", tagline: "What behaviors, beliefs, and perceptions to investigate", field: "f9",
    probe: "What specific things do you want to understand about how they think, what they do, or how they feel?",
    tip: "Avoid vague terms like 'understand preferences.' Name the specific behavior, decision point, or belief you want to measure.",
    placeholder: "List 3–5 specific behaviors, attitudes, or beliefs this study must investigate...",
    exLabel: "Reference answer",
    exText: "1. What triggers a brand switch within this category?\n2. How do buyers define and assess quality in this category?\n3. What role does pricing and pack size play in the actual purchase decision?\n4. How is the brand perceived relative to key competitors?"
  },
  {
    id: 10, name: "Geography / Markets", tagline: "Specific cities, regions, or countries", field: "f10",
    probe: "Name the exact cities, states, or countries this research should cover. Don't say 'pan-India' or 'nationwide'.",
    tip: "Always go to city or town level. Country-level is never specific enough for consumer research.",
    placeholder: "List specific cities or regions with priority tiers and the rationale behind each...",
    exLabel: "Reference answer",
    exText: "Primary markets (70% of sample): [3–4 specific cities representing highest revenue concentration or highest observed churn].\nSecondary markets (30% of sample): [2–3 cities to validate whether findings hold beyond the core markets]."
  }
];

const EMPTY_ANSWERS: ComponentAnswers = {
  f1: "", f2: "", f3: "", f4: "", f5: "", f6: "", f7: "", f8: "", f9: "", f10: ""
};

// Maps the wizard's f1..f10 shape to the backend's /from-framer payload field names.
function buildFramerPayload(brand: BrandContext, answers: ComponentAnswers) {
  return {
    brand_name: brand.brandName || undefined,
    industry: brand.industry || undefined,
    website: brand.website || undefined,
    competitors: brand.competitors.map(c => c.name),
    business_context: answers.f1 || undefined,
    decision_problem: answers.f2 || undefined,
    information_gap: answers.f3 || undefined,
    primary_hypothesis: answers.f4 || undefined,
    secondary_hypotheses: answers.f5 || undefined,
    target_audience: answers.f6 || undefined,
    segmentation_logic: answers.f7 || undefined,
    competitive_frame: answers.f8 || undefined,
    behaviors_attitudes: answers.f9 || undefined,
    geography: answers.f10 || undefined,
  };
}

function buildRO(brand: BrandContext, answers: ComponentAnswers): string {
  const lines: string[] = [];
  const hasCtx = brand.brandName || brand.website || brand.industry || brand.competitors.length > 0;
  if (hasCtx) {
    lines.push("BRAND CONTEXT");
    lines.push("─".repeat(42));
    if (brand.brandName)          lines.push("Brand: " + brand.brandName);
    if (brand.website)            lines.push("Website: " + brand.website);
    if (brand.industry)           lines.push("Industry: " + brand.industry);
    if (brand.competitors.length) lines.push("Competitors: " + brand.competitors.map(c => c.name).join(", "));
    lines.push("");
  }
  lines.push("RESEARCH OBJECTIVE");
  lines.push("─".repeat(42));
  lines.push("");
  COMPONENTS.forEach(c => {
    const val = answers[c.field]?.trim();
    if (val) {
      lines.push(`${c.id}. ${c.name.toUpperCase()}`);
      lines.push(val);
      lines.push("");
    }
  });
  return lines.join("\n").trim();
}

// ── Example card ──────────────────────────────────────────────────────────────

const ExampleCard: React.FC<{ comp: ROComponent }> = ({ comp }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rof-ex-wrap">
      <button className="rof-ex-toggle" onClick={() => setOpen(o => !o)}>
        <span className={`rof-ex-arr ${open ? "open" : ""}`}>▶</span>
        {open ? "Hide reference answer" : comp.exLabel}
      </button>
      {open && (
        <div className="rof-ex-card">
          <div className="rof-ex-card-label">Example</div>
          <pre className="rof-ex-card-text">{comp.exText}</pre>
        </div>
      )}
    </div>
  );
};

// ── Brand Step ────────────────────────────────────────────────────────────────

const BrandStep: React.FC<{ brand: BrandContext; onChange: (b: BrandContext) => void }> = ({ brand, onChange }) => {
  const [compInput, setCompInput] = useState("");
  const addComp = () => {
    const val = compInput.trim();
    if (val && !brand.competitors.find(c => c.name === val)) {
      onChange({ ...brand, competitors: [...brand.competitors, { name: val }] });
      setCompInput("");
    }
  };
  const removeComp = (i: number) => onChange({ ...brand, competitors: brand.competitors.filter((_, idx) => idx !== i) });
  return (
    <div className="rof-brand-step">
      <div className="rof-step-eyebrow">Setup</div>
      <h2 className="rof-step-title">Set the stage</h2>
      <p className="rof-step-sub">Brand context primes every component with competitive context before you start framing.</p>
      <div className="rof-form-row">
        <div className="rof-form-group">
          <label className="rof-label">Brand / Company</label>
          <input className="rof-input" type="text" placeholder="e.g. Acme Foods" value={brand.brandName} onChange={e => onChange({ ...brand, brandName: e.target.value })} />
        </div>
        <div className="rof-form-group">
          <label className="rof-label">Industry</label>
          <input className="rof-input" type="text" placeholder="e.g. FMCG, EdTech, B2B SaaS" value={brand.industry} onChange={e => onChange({ ...brand, industry: e.target.value })} />
        </div>
      </div>
      <div className="rof-form-group">
        <label className="rof-label">Website <span className="rof-label-note">optional</span></label>
        <div className="rof-website-row">
          <input className="rof-input" type="url" placeholder="https://yourbrand.com" value={brand.website} onChange={e => onChange({ ...brand, website: e.target.value })} />
          {brand.website && (
            <a className="rof-visit-btn" href={brand.website.startsWith("http") ? brand.website : "https://" + brand.website} target="_blank" rel="noopener noreferrer">Visit ↗</a>
          )}
        </div>
      </div>
      <div className="rof-form-group">
        <label className="rof-label">Competitors <span className="rof-label-note">Enter + Add</span></label>
        <div className="rof-comp-row">
          <input className="rof-input" type="text" placeholder="e.g. Brand X, Platform Y..." value={compInput} onChange={e => setCompInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addComp(); }}} />
          <button className="rof-btn-add" onClick={addComp}>Add</button>
        </div>
        <div className="rof-comp-tags">
          {brand.competitors.map((c, i) => (
            <span key={i} className="rof-comp-tag">{c.name}<button className="rof-comp-rm" onClick={() => removeComp(i)}>×</button></span>
          ))}
          {brand.competitors.length === 0 && <p className="rof-comp-hint">Add direct and indirect competitors — referenced in Component 8.</p>}
        </div>
      </div>
    </div>
  );
};

// ── Component Step ────────────────────────────────────────────────────────────

const ComponentStep: React.FC<{
  comp: ROComponent; value: string; competitors: Competitor[];
  onChange: (v: string) => void; isFilled: boolean;
}> = ({ comp, value, competitors, onChange, isFilled }) => {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  return (
    <div className="rof-comp-step">
      <div className="rof-comp-header">
        <div className="rof-comp-icon">{String(comp.id).padStart(2, "0")}</div>
        <div className="rof-comp-meta">
          <div className="rof-eyebrow">Component {comp.id} of 10</div>
          <h2 className="rof-comp-name">{comp.name}</h2>
          <p className="rof-comp-tagline">{comp.tagline}</p>
        </div>
        {isFilled && <div className="rof-comp-check">✓</div>}
      </div>

      <div className="rof-probe-card">
        <div className="rof-probe-label">Ask yourself</div>
        <p className="rof-probe-q">{comp.probe}</p>
        <p className="rof-probe-tip">{comp.tip}</p>
      </div>

      <ExampleCard comp={comp} />

      <div className="rof-textarea-wrap">
        <textarea
          className="rof-textarea"
          placeholder={comp.placeholder}
          rows={5}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <div className="rof-textarea-footer">
          <span className={`rof-wordcount ${wordCount > 20 ? "rof-wordcount--good" : ""}`}>
            {wordCount} {wordCount === 1 ? "word" : "words"} {wordCount > 20 ? "· sufficient" : "· aim for 30+"}
          </span>
        </div>
      </div>

      {comp.id === 8 && competitors.length > 0 && (
        <div className="rof-comp-ref-hint">
          From intro: <strong>{competitors.map(c => c.name).join(", ")}</strong> — reference or extend above.
        </div>
      )}
    </div>
  );
};

// ── Coverage matrix (review step header) ─────────────────────────────────────

const ComponentHeatmap: React.FC<{ answers: ComponentAnswers; onJump: (step: number) => void }> = ({ answers, onJump }) => (
  <div className="rof-heatmap">
    {COMPONENTS.map(c => {
      const filled = !!answers[c.field]?.trim();
      const words = answers[c.field]?.trim().split(/\s+/).length ?? 0;
      const strength = filled ? (words > 50 ? "strong" : words > 20 ? "medium" : "light") : "empty";
      return (
        <button
          key={c.id}
          className={`rof-heatmap-cell rof-heatmap-cell--${strength}`}
          onClick={() => onJump(c.id)}
          title={`${c.id}. ${c.name} — ${filled ? words + " words" : "empty"}`}
        >
          <span className="rof-heatmap-icon">{String(c.id).padStart(2, "0")}</span>
          <span className="rof-heatmap-label">{c.name.split(" ")[0]}</span>
          {filled && <span className="rof-heatmap-dot" />}
        </button>
      );
    })}
  </div>
);

// ── Brief strength meter ──────────────────────────────────────────────────────

const StrengthMeter: React.FC<{ answers: ComponentAnswers; filledCount: number }> = ({ answers, filledCount }) => {
  const totalWords = COMPONENTS.reduce((acc, c) => {
    const w = answers[c.field]?.trim().split(/\s+/).length ?? 0;
    return acc + (answers[c.field]?.trim() ? w : 0);
  }, 0);
  const pct = Math.min(100, Math.round((filledCount / 10) * 100));
  const label = filledCount === 0 ? "Not started" : filledCount < 4 ? "Early draft" : filledCount < 7 ? "Taking shape" : filledCount < 10 ? "Near complete" : "Brief complete";
  const tier = filledCount === 0 ? "zero" : filledCount < 4 ? "low" : filledCount < 7 ? "mid" : filledCount < 10 ? "high" : "full";

  return (
    <div className={`rof-strength rof-strength--${tier}`}>
      <div className="rof-strength-top">
        <div className="rof-strength-label-wrap">
          <span className="rof-strength-label">{label}</span>
          <span className="rof-strength-words">{totalWords > 0 ? `${totalWords} words across ${filledCount} component${filledCount !== 1 ? "s" : ""}` : "Fill components below to build your brief"}</span>
        </div>
        <span className="rof-strength-pct">{pct}%</span>
      </div>
      <div className="rof-strength-track">
        <div className="rof-strength-fill" style={{ width: `${pct}%` }} />
        {[25, 50, 75].map(m => (
          <div key={m} className="rof-strength-marker" style={{ left: `${m}%` }} />
        ))}
      </div>
    </div>
  );
};

// ── Live brief preview ────────────────────────────────────────────────────────
// Renders immediately — no typewriter animation. This is a document, not a
// performance: the analyst wants to read it, not watch it being typed.

const LivePreview: React.FC<{ brand: BrandContext; answers: ComponentAnswers; filledCount: number }> = ({ brand, answers, filledCount }) => {
  const roText = buildRO(brand, answers);
  const preRef = useRef<HTMLPreElement>(null);

  if (filledCount === 0) {
    return (
      <div className="rof-preview-empty">
        <p className="rof-preview-empty-text">Your brief assembles here as you fill in components.</p>
        <p className="rof-preview-empty-sub">research_objective.txt</p>
      </div>
    );
  }

  return (
    <div className="rof-preview-box">
      <div className="rof-preview-toolbar">
        <span className="rof-preview-filename">research_objective.txt</span>
        <span className="rof-preview-done">{filledCount === 10 ? "complete" : "draft"}</span>
      </div>
      <pre className="rof-preview-pre" ref={preRef}>{roText}</pre>
    </div>
  );
};

// ── Review Step ───────────────────────────────────────────────────────────────

const ReviewStep: React.FC<{
  brand: BrandContext; answers: ComponentAnswers;
  onInsert: (t: string) => void; onRestart: () => void; onJump: (s: number) => void;
  workspaceId?: string; explorationId?: string; onSaved?: () => void;
}> = ({ brand, answers, onInsert, onRestart, onJump, workspaceId, explorationId, onSaved }) => {
  const [copied, setCopied] = useState(false);
  const filledCount = COMPONENTS.filter(c => answers[c.field]?.trim()).length;
  const roText = buildRO(brand, answers);
  const canSave = !!(workspaceId && explorationId);

  const { mutate: saveFramer, isPending: isSaving } = useCreateResearchObjectiveFromFramer(
    workspaceId as string,
    explorationId as string
  ) as any;

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(roText); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
  };

  const handleSave = () => {
    if (!canSave) return;
    saveFramer(buildFramerPayload(brand, answers), {
      onSuccess: () => {
        toast.success("Research objective saved. Ready to build personas.");
        onSaved?.();
      },
      onError: (error: any) => {
        toast.error(
          error?.response?.data?.detail ?? "Couldn't save the research objective. Please try again."
        );
      },
    });
  };

  return (
    <div className="rof-review-step">
      <div className="rof-review-head">
        <div>
          <div className="rof-step-eyebrow">Final step</div>
          <h2 className="rof-step-title">Your brief is{filledCount === 10 ? " complete" : " taking shape"}</h2>
          <p className="rof-step-sub">
            {filledCount === 0 ? "Go back and fill in components to build your research objective." : filledCount < 10 ? `${10 - filledCount} component${10 - filledCount > 1 ? "s" : ""} still empty — click any cell below to jump back and complete.` : "All 10 components filled. This is a strong research brief — ready to send to Omi."}
          </p>
        </div>
        {filledCount === 10 && (
          <div className="rof-review-badge">
            <span className="rof-review-badge-icon">10/10</span>
            <span>Brief<br />complete</span>
          </div>
        )}
      </div>

      <StrengthMeter answers={answers} filledCount={filledCount} />
      <ComponentHeatmap answers={answers} onJump={onJump} />
      <LivePreview brand={brand} answers={answers} filledCount={filledCount} />

      <div className="rof-review-actions">
        {canSave ? (
          <button
            className={`rof-btn-insert ${filledCount === 0 || isSaving ? "rof-btn-insert--disabled" : ""}`}
            disabled={filledCount === 0 || isSaving}
            onClick={handleSave}
          >
            <span className="rof-btn-insert-icon">→</span>
            {isSaving ? "Saving…" : "Save Research Objective"}
          </button>
        ) : (
          <button
            className={`rof-btn-insert ${filledCount === 0 ? "rof-btn-insert--disabled" : ""}`}
            disabled={filledCount === 0}
            onClick={() => onInsert(roText)}
          >
            <span className="rof-btn-insert-icon">→</span>
            Use this objective
          </button>
        )}
        <button
          className={`rof-btn-copy ${copied ? "rof-btn-copy--copied" : ""} ${filledCount === 0 ? "rof-btn-copy--disabled" : ""}`}
          disabled={filledCount === 0}
          onClick={handleCopy}
        >{copied ? "Copied" : "Copy"}</button>
        <button className="rof-btn-restart" onClick={onRestart}>Start over</button>
      </div>
    </div>
  );
};

// ── Main Modal ────────────────────────────────────────────────────────────────

const ResearchObjectiveFramer: React.FC<ResearchObjectiveFramerProps> = ({ isOpen, onClose, onInsert, workspaceId, explorationId, onSaved }) => {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState<BrandContext>({ brandName: "", industry: "", website: "", competitors: [] });
  const [answers, setAnswers] = useState<ComponentAnswers>({ ...EMPTY_ANSWERS });
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Scroll body to top on step change
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const goNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS - 1));
  const goBack = () => setStep(s => Math.max(s - 1, 0));
  const goTo   = (idx: number) => setStep(idx);

  const handleRestart = () => {
    setBrand({ brandName: "", industry: "", website: "", competitors: [] });
    setAnswers({ ...EMPTY_ANSWERS });
    setStep(0);
  };

  const filledCount = COMPONENTS.filter(c => answers[c.field]?.trim()).length;
  const progress = Math.round((step / (TOTAL_STEPS - 1)) * 100);

  const currentComp = step >= 1 && step <= 10 ? COMPONENTS[step - 1] : null;

  if (!isOpen) return null;

  return (
    <div className="rof-overlay" ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }} role="dialog" aria-modal="true">
      <div className="rof-modal">

        {/* ── Header ── */}
        <div className="rof-header">
          <div className="rof-header-top">
            <div className="rof-header-left">
              <div className="rof-wordmark">
                <span className="rof-wordmark-text">Objective Framer</span>
              </div>
              {brand.brandName && <span className="rof-brand-pill">{brand.brandName}</span>}
            </div>
            <div className="rof-header-right">
              <span className={`rof-fill-badge ${filledCount === 10 ? "rof-fill-badge--complete" : filledCount > 0 ? "rof-fill-badge--partial" : ""}`}>
                {filledCount} / 10
              </span>
              <button className="rof-close-btn" onClick={onClose} aria-label="Close">×</button>
            </div>
          </div>

          {/* Progress track */}
          <div className="rof-progress-track">
            <div className="rof-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          {/* Pills */}
          <div className="rof-pills">
            <button className={`rof-pill rof-pill--dot ${step === 0 ? "rof-pill--active" : ""}`} onClick={() => goTo(0)} title="Brand Context">·</button>
            {COMPONENTS.map(c => {
              const filled = !!answers[c.field]?.trim();
              return (
                <button
                  key={c.id}
                  className={`rof-pill ${step === c.id ? "rof-pill--active" : filled ? "rof-pill--filled" : ""}`}
                  onClick={() => goTo(c.id)}
                  title={c.name}
                >
                  {filled && step !== c.id ? <span className="rof-pill-check">✓</span> : String(c.id).padStart(2, "0")}
                </button>
              );
            })}
            <button className={`rof-pill rof-pill--review ${step === 11 ? "rof-pill--active" : ""}`} onClick={() => goTo(11)} title="Review">Review</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="rof-body" ref={bodyRef}>

          {step === 0 && <BrandStep brand={brand} onChange={setBrand} />}

          {currentComp && (
            <ComponentStep
              key={currentComp.id}
              comp={currentComp}
              value={answers[currentComp.field]}
              competitors={brand.competitors}
              isFilled={!!answers[currentComp.field]?.trim()}
              onChange={val => setAnswers(prev => ({ ...prev, [currentComp.field]: val }))}
            />
          )}

          {step === 11 && (
            <ReviewStep
              brand={brand}
              answers={answers}
              onInsert={(text) => { onInsert(text); onClose(); }}
              onRestart={handleRestart}
              onJump={goTo}
              workspaceId={workspaceId}
              explorationId={explorationId}
              onSaved={() => { onSaved?.(); onClose(); }}
            />
          )}
        </div>

        {/* ── Footer ── */}
        {step !== 11 && (
          <div className="rof-footer">
            <button className="rof-btn-back" onClick={goBack} disabled={step === 0}>← Back</button>
            <div className="rof-footer-center">
              {step >= 1 && step <= 10 && (
                <div className="rof-footer-comp-progress">
                  {COMPONENTS.map(c => (
                    <div
                      key={c.id}
                      className={`rof-footer-seg ${c.id === step ? "rof-footer-seg--active" : answers[c.field]?.trim() ? "rof-footer-seg--done" : ""}`}
                    />
                  ))}
                </div>
              )}
              <span className="rof-footer-count">
                {step === 0 ? "Brand context" : step <= 10 ? `${step} of 10 components` : "Review"}
              </span>
            </div>
            <button className="rof-btn-next" onClick={goNext}>
              {step === 0 ? "Start framing →" : step === 10 ? "Review brief →" : "Next →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResearchObjectiveFramer;

// ── Trigger button ────────────────────────────────────────────────────────────

interface ROFramerTriggerProps {
  onInsert: (text: string) => void;
  workspaceId?: string;
  explorationId?: string;
  onSaved?: () => void;
}

export const ROFramerTrigger: React.FC<ROFramerTriggerProps> = ({ onInsert, workspaceId, explorationId, onSaved }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="rof-trigger-btn" onClick={() => setOpen(true)} title="Frame your Research Objective step by step">
        <span className="rof-trigger-icon">RO</span>
        Frame Objective
      </button>
      <ResearchObjectiveFramer
        isOpen={open}
        onClose={() => setOpen(false)}
        onInsert={(text) => { onInsert(text); setOpen(false); }}
        workspaceId={workspaceId}
        explorationId={explorationId}
        onSaved={onSaved}
      />
    </>
  );
};