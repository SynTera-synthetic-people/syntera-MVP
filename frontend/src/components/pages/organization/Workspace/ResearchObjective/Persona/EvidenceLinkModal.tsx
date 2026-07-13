import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SiLinkedin,
  SiQuora,
  SiYoutube,
  SiX,
  SiInstagram,
  SiReddit,
  SiMedium,
  SiTrustpilot,
} from 'react-icons/si';
import {
  MdOutlinePublic,
  MdStarRate,
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdDescription,
} from 'react-icons/md';
import SpIcon from '../../../../../SPIcon';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single document retrieved from the Sourcebank for a KE category. */
export interface KESourceEntry {
  document_id?: string;
  chunk_id?: string;
  title: string;
  source_type: string;
  source_url?: string;
  domain?: string;
  authority_tier?: string;
  authority_label?: string;
  relevance_score?: number;
  usage_context?: string;
}

/**
 * A single scraped web article or HQ research document collected during
 * persona generation (web_evidence_by_platform data).
 */
export interface WebCitationEntry {
  url: string;
  /** Article excerpt / HQ finding snippet shown as a quote preview. */
  quote?: string;
  confidence?: number;
  /** HQ research source title (study_reference). */
  title?: string;
  /** authority_tier from HQ provenance (e.g. "academic", "curated"). */
  authority_tier?: string;
  domain?: string;
}

export interface EvidenceLink {
  name: string;
  url?: string;
  count?: number;
  usage_context?: string;
  relevance?: string;
  /** Present on KE-modal rows: actual source documents under this category. */
  ke_sources?: KESourceEntry[];
  /**
   * Present on Multi-platform modal rows: individual scraped article or
   * HQ research URLs collected during web evidence gathering.
   */
  web_citations?: WebCitationEntry[];
  /** Key discussion themes for this platform (shown as pills). */
  themes?: string[];
  /** "real_citation_backed" | "estimated" — used to badge the row. */
  source_note?: string;
  /** True for the HQ Research Sources group row. */
  is_hq?: boolean;
}

interface EvidenceLinksModalProps {
  links: EvidenceLink[];
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Accepts only http / https URLs so bad strings from GPT never become hrefs. */
const isValidUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

// ── Platform icon / colour resolvers ─────────────────────────────────────────

const getPlatformIcon = (name: string): React.ReactNode => {
  const lower = name.toLowerCase();
  if (lower.includes('linkedin'))  return <SiLinkedin size={16} />;
  if (lower.includes('reddit'))    return <SiReddit size={16} />;
  if (lower.includes('youtube'))   return <SiYoutube size={16} />;
  if (lower.includes('quora'))     return <SiQuora size={16} />;
  if (lower.includes('twitter') || lower.includes('x.com') || lower === 'x')
    return <SiX size={16} />;
  if (lower.includes('instagram')) return <SiInstagram size={16} />;
  if (lower.includes('medium'))    return <SiMedium size={16} />;
  if (lower.includes('trustpilot')) return <SiTrustpilot size={16} />;
  if (lower.includes('review') || lower.includes('yelp') || lower.includes('capterra'))
    return <MdStarRate size={16} />;
  return <MdOutlinePublic size={16} />;
};

const getPlatformAccent = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('linkedin'))  return '#0A66C2';
  if (lower.includes('reddit'))    return '#FF4500';
  if (lower.includes('youtube'))   return '#FF0000';
  if (lower.includes('quora'))     return '#B92B27';
  if (lower.includes('twitter') || lower.includes('x.com') || lower === 'x')
    return '#ffffff';
  if (lower.includes('instagram')) return '#E1306C';
  if (lower.includes('medium'))    return '#02B875';
  if (lower.includes('trustpilot')) return '#00B67A';
  return '#64748b';
};

/** Colour for the KE authority tier badge. */
const getTierColor = (tier: string): string => {
  switch ((tier || '').toLowerCase()) {
    case 'official': return '#37FFCE';
    case 'partner':  return '#4d8ff0';
    case 'curated':  return '#FABC48';
    default:         return '#94a3b8';
  }
};

const resolveUrl = (link: EvidenceLink): string | null => {
  if (link.url) return link.url;
  const lower = link.name.toLowerCase();
  const DOMAIN_MAP: Record<string, string> = {
    linkedin:   'https://www.linkedin.com',
    reddit:     'https://www.reddit.com',
    youtube:    'https://www.youtube.com',
    quora:      'https://www.quora.com',
    twitter:    'https://www.twitter.com',
    'x.com':    'https://www.x.com',
    instagram:  'https://www.instagram.com',
    medium:     'https://www.medium.com',
    trustpilot: 'https://www.trustpilot.com',
    yelp:       'https://www.yelp.com',
    capterra:   'https://www.capterra.com',
    producthunt:'https://www.producthunt.com',
  };
  for (const [key, domain] of Object.entries(DOMAIN_MAP)) {
    if (lower.includes(key)) return domain;
  }
  return null;
};

// ── Web platform citation row (with accordion) ────────────────────────────────

interface WebPlatformCitationRowProps {
  link: EvidenceLink;
}

const WebPlatformCitationRow: React.FC<WebPlatformCitationRowProps> = ({ link }) => {
  const [expanded, setExpanded] = useState(false);
  const citations = link.web_citations ?? [];
  const hasExpandable = citations.length > 0;
  const isReal = link.source_note === 'real_citation_backed';
  const icon = getPlatformIcon(link.name);
  const accent = getPlatformAccent(link.name);

  return (
    <div className="elm-web-platform-block">
      {/* ── Platform header row ── */}
      <button
        className={`elm-link-row elm-web-platform-row${expanded ? ' elm-web-platform-row--open' : ''}`}
        onClick={() => hasExpandable && setExpanded(v => !v)}
        style={{ cursor: hasExpandable ? 'pointer' : 'default', width: '100%', textAlign: 'left' }}
        aria-expanded={expanded}
      >
        <div className="elm-link-left">
          <span className="elm-platform-icon" style={{ color: accent }}>
            {icon}
          </span>
          <div className="elm-link-meta">
            <span className="elm-link-name elm-link-name--static">{link.name}</span>
            {link.themes && link.themes.length > 0 && (
              <div className="elm-theme-pills">
                {link.themes.slice(0, 3).map((t, i) => (
                  <span key={i} className="elm-theme-pill">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="elm-link-right">
          {!isReal && (
            <span className="elm-estimated-badge">Estimated</span>
          )}
          {(link.count ?? 0) > 0 && (
            <span className="elm-link-count">
              {link.count!.toLocaleString('en-IN')}
              <span className="elm-link-count-label"> {link.is_hq ? 'studies' : 'posts'}</span>
            </span>
          )}
          {hasExpandable && (
            <span className="elm-expand-btn" aria-hidden>
              {expanded
                ? <MdKeyboardArrowUp size={18} />
                : <MdKeyboardArrowDown size={18} />}
            </span>
          )}
        </div>
      </button>

      {/* ── Accordion: individual citation URLs ── */}
      <AnimatePresence initial={false}>
        {expanded && hasExpandable && (
          <motion.div
            className="elm-sub-sources"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {citations.map((citation, idx) => {
              const displayTitle = citation.title || citation.url;
              const hasUrl = isValidUrl(citation.url);
              const confidencePct = citation.confidence != null
                ? `${Math.round(citation.confidence * 100)}%`
                : null;
              const tierColor = citation.authority_tier
                ? getTierColor(citation.authority_tier)
                : null;

              return (
                <div key={idx} className="elm-web-citation-row">
                  <div className="elm-sub-source-left">
                    <span className="elm-sub-source-dot" />
                    <div className="elm-sub-source-meta">
                      {hasUrl ? (
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="elm-sub-source-title"
                          title={displayTitle}
                        >
                          {displayTitle}
                          <SpIcon name="sp-Arrow-Arrow_Up_Right_MD" size={10} style={{ marginLeft: 3, opacity: 0.5 }} />
                        </a>
                      ) : (
                        <span className="elm-sub-source-title elm-sub-source-title--static">
                          {displayTitle}
                        </span>
                      )}
                      {citation.quote && (
                        <p className="elm-web-citation-quote">&ldquo;{citation.quote}&rdquo;</p>
                      )}
                    </div>
                  </div>
                  <div className="elm-sub-source-right">
                    {/* {tierColor && (
                      <span
                        className="elm-tier-badge"
                        style={{ color: tierColor, borderColor: `${tierColor}33`, background: `${tierColor}0f` }}
                      >
                        {citation.authority_tier}
                      </span>
                    )}
                    {confidencePct && (
                      <span className="elm-sub-relevance">{confidencePct}</span>
                    )} */}
                    {hasUrl && (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="elm-visit-btn"
                        aria-label={`Visit ${displayTitle}`}
                      >
                        <SpIcon name="sp-Arrow-Arrow_Right_MD" size={13} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── KE Category row (with accordion) ─────────────────────────────────────────

interface KECategoryRowProps {
  link: EvidenceLink;
}

const KECategoryRow: React.FC<KECategoryRowProps> = ({ link }) => {
  const [expanded, setExpanded] = useState(false);
  const hasSources = (link.ke_sources?.length ?? 0) > 0;

  return (
    <div className="elm-ke-category-block">
      {/* ── Category header row ── */}
      <button
        className={`elm-link-row elm-ke-category-row${expanded ? ' elm-ke-category-row--open' : ''}`}
        onClick={() => hasSources && setExpanded(v => !v)}
        style={{ cursor: hasSources ? 'pointer' : 'default', width: '100%', textAlign: 'left' }}
        aria-expanded={expanded}
      >
        <div className="elm-link-left">
          <span className="elm-platform-icon" style={{ color: '#4d8ff0' }}>
            <MdDescription size={16} />
          </span>
          <div className="elm-link-meta">
            <span className="elm-link-name elm-link-name--static">{link.name}</span>
            {link.usage_context && (
              <p className="elm-link-context">{link.usage_context}</p>
            )}
          </div>
        </div>

        <div className="elm-link-right">
          {(link.count ?? 0) > 0 && (
            <span className="elm-link-count">
              {link.count!.toLocaleString('en-IN')}
              <span className="elm-link-count-label"> sources</span>
            </span>
          )}
          {hasSources && (
            <span className="elm-expand-btn" aria-hidden>
              {expanded
                ? <MdKeyboardArrowUp size={18} />
                : <MdKeyboardArrowDown size={18} />}
            </span>
          )}
        </div>
      </button>

      {/* ── Accordion: individual source documents ── */}
      <AnimatePresence initial={false}>
        {expanded && hasSources && (
          <motion.div
            className="elm-sub-sources"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {link.ke_sources!.map((src, idx) => {
              const hasUrl = isValidUrl(src.source_url ?? '');
              const tier   = src.authority_label || src.authority_tier || 'Curated';
              const tierColor = getTierColor(src.authority_tier || '');
              const relevancePct = src.relevance_score != null
                ? `${Math.round(src.relevance_score * 100)}%`
                : null;
              // When Sourcebank stores URL as the title field, derive a readable label.
              const isTitleUrl = src.title && isValidUrl(src.title);
              const displayTitle = isTitleUrl
                ? (() => { try { return new URL(src.title!).hostname.replace(/^www\./, ''); } catch { return src.title; } })()
                : (src.title || 'Untitled Source');

              return (
                <div key={src.document_id || src.chunk_id || idx} className="elm-sub-source-row">
                  <div className="elm-sub-source-left">
                    <span className="elm-sub-source-dot" />
                    <div className="elm-sub-source-meta">
                      {hasUrl ? (
                        <a
                          href={src.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="elm-sub-source-title"
                          title={src.title}
                        >
                          {displayTitle}
                          <SpIcon
                            name="sp-Arrow-Arrow_Up_Right_MD"
                            size={10}
                            style={{ marginLeft: 3, opacity: 0.5 }}
                          />
                        </a>
                      ) : (
                        <span className="elm-sub-source-title elm-sub-source-title--static">
                          {displayTitle}
                        </span>
                      )}
                      {src.domain && src.domain !== 'general' && (
                        <span className="elm-sub-source-domain">{src.domain}</span>
                      )}
                    </div>
                  </div>
                  <div className="elm-sub-source-right">
                    {/* <span
                      className="elm-tier-badge"
                      style={{ color: tierColor, borderColor: `${tierColor}33`, background: `${tierColor}0f` }}
                    >
                      {tier}
                    </span>
                    {relevancePct && (
                      <span className="elm-sub-relevance">{relevancePct}</span>
                    )} */}
                    {hasUrl && (
                      <a
                        href={src.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="elm-visit-btn"
                        aria-label={`Visit ${src.title}`}
                      >
                        <SpIcon name="sp-Arrow-Arrow_Right_MD" size={13} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const EvidenceLinksModal: React.FC<EvidenceLinksModalProps> = ({ links, onClose }) => {
  const hasLinks = links.length > 0;
  const isKEModal = links.some(l => l.ke_sources !== undefined);
  const isWebEvidenceModal = links.some(l => l.web_citations !== undefined);

  return (
    <AnimatePresence>
      <motion.div
        className="elm-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="elm-panel"
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="elm-header">
            <div className="elm-header-left">
              <div className="elm-header-icon">
                <MdOutlinePublic size={18} />
              </div>
              <div>
                <h2 className="elm-title">Evidence Sources</h2>
                <p className="elm-subtitle">
                  {isKEModal
                    ? 'Knowledge bank sources used to calibrate this persona'
                    : isWebEvidenceModal
                    ? 'Web articles and research documents consulted during generation'
                    : 'Platforms and communities used to calibrate this persona'}
                </p>
              </div>
            </div>
            <button
              className="elm-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <SpIcon name="sp-Menu-Close_MD" size={18} />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="elm-body">
            {hasLinks ? (
              <div className="elm-links-list">
                {links.map((link, i) => {
                  if (link.ke_sources !== undefined) {
                    return <KECategoryRow key={i} link={link} />;
                  }
                  if (link.web_citations !== undefined) {
                    return <WebPlatformCitationRow key={i} link={link} />;
                  }

                  const url    = resolveUrl(link);
                  const accent = getPlatformAccent(link.name);
                  const icon   = getPlatformIcon(link.name);

                  return (
                    <div key={i} className="elm-link-row">
                      <div className="elm-link-left">
                        <span className="elm-platform-icon" style={{ color: accent }}>
                          {icon}
                        </span>
                        <div className="elm-link-meta">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="elm-link-name"
                            >
                              {link.name}
                              <SpIcon
                                name="sp-Arrow-Arrow_Up_Right_MD"
                                size={11}
                                style={{ marginLeft: 4, opacity: 0.5 }}
                              />
                            </a>
                          ) : (
                            <span className="elm-link-name elm-link-name--static">
                              {link.name}
                            </span>
                          )}
                          {link.usage_context && (
                            <p className="elm-link-context">{link.usage_context}</p>
                          )}
                        </div>
                      </div>

                      <div className="elm-link-right">
                        {link.relevance && (
                          <span className="elm-relevance-badge">{link.relevance}</span>
                        )}
                        {(link.count ?? 0) > 0 && (
                          <span className="elm-link-count">
                            {link.count!.toLocaleString('en-IN')}
                            <span className="elm-link-count-label"> posts</span>
                          </span>
                        )}
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="elm-visit-btn"
                            aria-label={`Visit ${link.name}`}
                          >
                            <SpIcon name="sp-Arrow-Arrow_Right_MD" size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="elm-empty">
                <MdOutlinePublic size={36} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: 12 }} />
                <p>No evidence sources available for this persona.</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>
                  Omi-generated personas include platform data after calibration.
                </p>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="elm-footer">
            <p className="elm-footer-note">
              {isKEModal
                ? 'Click a category to expand its sources. Links open in a new tab.'
                : isWebEvidenceModal
                ? 'Click a platform to expand individual article URLs and quote previews. Links open in a new tab.'
                : 'Links open in a new tab. Source counts reflect conversations and threads analysed during calibration.'}
            </p>
            <button className="elm-close-footer-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EvidenceLinksModal;
