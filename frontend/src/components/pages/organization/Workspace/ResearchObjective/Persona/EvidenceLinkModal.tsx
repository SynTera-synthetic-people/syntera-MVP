import React from 'react';
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
import { MdOutlinePublic, MdStarRate } from 'react-icons/md';
import SpIcon from '../../../../../SPIcon';
// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvidenceLink {
  name: string;
  url?: string;
  count?: number;
  usage_context?: string;
  relevance?: string;
}

interface EvidenceLinksModalProps {
  links: EvidenceLink[];
  onClose: () => void;
}

// ── Platform icon resolver ────────────────────────────────────────────────────

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

// ── Build a best-effort URL from a name / partial url ────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

const EvidenceLinksModal: React.FC<EvidenceLinksModalProps> = ({ links, onClose }) => {
  const hasLinks = links.length > 0;

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
                  Platforms and communities used to calibrate this persona
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
                  const url = resolveUrl(link);
                  const accent = getPlatformAccent(link.name);
                  const icon = getPlatformIcon(link.name);

                  return (
                    <div key={i} className="elm-link-row">
                      {/* Left: icon + name */}
                      <div className="elm-link-left">
                        <span
                          className="elm-platform-icon"
                          style={{ color: accent }}
                        >
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

                      {/* Right: count + relevance + external arrow */}
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
              Links open in a new tab. Source counts reflect conversations and threads analysed during calibration.
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