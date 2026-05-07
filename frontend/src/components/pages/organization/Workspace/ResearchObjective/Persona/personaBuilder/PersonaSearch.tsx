import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useId,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TbSearch, TbX, TbLayoutGrid, TbTag, TbList } from 'react-icons/tb';
import { usePersonaSearch, type SearchResult, type SearchResultType } from './UsePersonaSearch';
import type { MainCategory } from './PersonaBuilderType';
import './PersonaSearch.css';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PersonaSearchProps {
    onNavigate: (category: MainCategory, subTab?: string, optionValue?: string) => void;
    disabled?: boolean;
}

// ── Highlight helper ──────────────────────────────────────────────────────────

const HighlightedLabel: React.FC<{
    label: string;
    matchRanges: [number, number][];
}> = ({ label, matchRanges }) => {
    if (matchRanges.length === 0) return <span>{label}</span>;

    // Merge overlapping ranges
    const merged: [number, number][] = [];
    for (const [s, e] of [...matchRanges].sort((a, b) => a[0] - b[0])) {
        const last = merged[merged.length - 1];
        if (last && s <= last[1]) {
            last[1] = Math.max(last[1], e);
        } else {
            merged.push([s, e]);
        }
    }

    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const [start, end] of merged) {
        if (start > cursor) parts.push(<span key={cursor}>{label.slice(cursor, start)}</span>);
        parts.push(
            <mark key={start} className="psearch-highlight">
                {label.slice(start, end)}
            </mark>
        );
        cursor = end;
    }
    if (cursor < label.length) parts.push(<span key={cursor}>{label.slice(cursor)}</span>);

    return <>{parts}</>;
};

// ── Result type icon + label ──────────────────────────────────────────────────

const TYPE_META: Record<SearchResultType, { icon: React.ReactNode; groupLabel: string }> = {
    attribute: { icon: <TbTag size={13} />, groupLabel: 'Attributes' },
    option: { icon: <TbList size={13} />, groupLabel: 'Options' },
    category: { icon: <TbLayoutGrid size={13} />, groupLabel: 'Categories' },
};

// ── Main Component ────────────────────────────────────────────────────────────

const PersonaSearch: React.FC<PersonaSearchProps> = ({ onNavigate, disabled = false }) => {
    const id = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const { query, setQuery, results, clearQuery } = usePersonaSearch();
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const hasResults = results.length > 0;
    const showDropdown = isOpen && query.trim().length > 0;

    // ── Keyboard shortcut ⌘K / Ctrl+K ──────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
                setIsOpen(true);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // ── Reset active index when results change ──────────────────────────────
    useEffect(() => {
        setActiveIndex(-1);
    }, [results]);

    // ── Scroll active item into view ────────────────────────────────────────
    useEffect(() => {
        if (activeIndex < 0 || !listRef.current) return;
        const item = listRef.current.querySelectorAll('[role="option"]')[activeIndex] as HTMLElement;
        item?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleSelect = useCallback(
        (result: SearchResult) => {
            onNavigate(result.category, result.subTab, result.optionValue);
            clearQuery();
            setIsOpen(false);
            setActiveIndex(-1);
            inputRef.current?.blur();
        },
        [onNavigate, clearQuery]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showDropdown) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && results[activeIndex]) {
                    handleSelect(results[activeIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                clearQuery();
                setIsOpen(false);
                setActiveIndex(-1);
                inputRef.current?.blur();
                break;
        }
    };

    const handleBlur = () => {
        // Delay so click on result fires first
        setTimeout(() => setIsOpen(false), 150);
    };

    // ── Group results by type for section headers ──────────────────────────
    const grouped: { type: SearchResultType; results: (SearchResult & { index: number })[] }[] = [];
    let flatIndex = 0;
    for (const type of ['attribute', 'option', 'category'] as SearchResultType[]) {
        const group = results
            .map((r, i) => ({ ...r, index: i }))
            .filter((r) => r.type === type);
        if (group.length > 0) grouped.push({ type, results: group });
        flatIndex += group.length;
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="psearch" role="search">
            {/* ── Input row ── */}
            <div
                className={`psearch__input-row ${isOpen && query ? 'psearch__input-row--open' : ''}`}
            >
                <TbSearch
                    className="psearch__icon-search"
                    size={15}
                    aria-hidden="true"
                />
                <input
                    ref={inputRef}
                    id={`${id}-input`}
                    type="text"
                    className="psearch__input"
                    placeholder="Search attributes, options, categories…"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    autoComplete="off"
                    spellCheck={false}
                    aria-autocomplete="list"
                    aria-controls={showDropdown ? `${id}-listbox` : undefined}
                    aria-activedescendant={
                        activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
                    }
                    aria-expanded={showDropdown}
                    role="combobox"
                />
                <div className="psearch__right">
                    {query ? (
                        <button
                            className="psearch__clear"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                clearQuery();
                                setIsOpen(false);
                                inputRef.current?.focus();
                            }}
                            aria-label="Clear search"
                            tabIndex={-1}
                        >
                            <TbX size={14} />
                        </button>
                    ) : (
                        <kbd className="psearch__kbd"></kbd>
                    )}
                </div>
            </div>

            {/* ── Dropdown ── */}
            <AnimatePresence>
                {showDropdown && (
                    <motion.div
                        className="psearch__dropdown"
                        initial={{ opacity: 0, y: -6, scaleY: 0.96 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -4, scaleY: 0.97 }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}
                        style={{ transformOrigin: 'top' }}
                    >
                        {hasResults ? (
                            <ul
                                ref={listRef}
                                id={`${id}-listbox`}
                                role="listbox"
                                className="psearch__list"
                                aria-label="Search results"
                            >
                                {grouped.map(({ type, results: groupResults }) => {
                                    const meta = TYPE_META[type];
                                    return (
                                        <React.Fragment key={type}>
                                            {/* Section header */}
                                            <li
                                                className="psearch__group-header"
                                                role="presentation"
                                            >
                                                <span className="psearch__group-icon">
                                                    {meta.icon}
                                                </span>
                                                {meta.groupLabel}
                                            </li>

                                            {/* Results in this group */}
                                            {groupResults.map((result) => {
                                                const isActive = result.index === activeIndex;
                                                return (
                                                    <li
                                                        key={`${result.type}-${result.label}-${result.context}`}
                                                        id={`${id}-option-${result.index}`}
                                                        role="option"
                                                        aria-selected={isActive}
                                                        className={`psearch__result ${isActive ? 'psearch__result--active' : ''}`}
                                                        onMouseEnter={() =>
                                                            setActiveIndex(result.index)
                                                        }
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            handleSelect(result);
                                                        }}
                                                    >
                                                        <span className="psearch__result-label">
                                                            <HighlightedLabel
                                                                label={result.label}
                                                                matchRanges={result.matchRanges}
                                                            />
                                                        </span>
                                                        <span className="psearch__result-context">
                                                            {result.context}
                                                        </span>

                                                        {/* Teal arrow on hover/active */}
                                                        <span
                                                            className="psearch__result-arrow"
                                                            aria-hidden="true"
                                                        >
                                                            ↵
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </ul>
                        ) : (
                            /* No results */
                            <div className="psearch__empty">
                                <span className="psearch__empty-icon">
                                    <TbSearch size={16} />
                                </span>
                                <p className="psearch__empty-text">
                                    No results for{' '}
                                    <strong>"{query}"</strong>
                                </p>
                                <p className="psearch__empty-hint">
                                    Try a different term, or use{' '}
                                    <span className="psearch__empty-hint-cta">+ Add Custom</span>{' '}
                                    in any attribute panel.
                                </p>
                            </div>
                        )}

                        {/* Footer hint */}
                        {hasResults && (
                            <div className="psearch__footer">
                                <span><kbd>↑↓</kbd> navigate</span>
                                <span><kbd>↵</kbd> select</span>
                                <span><kbd>Esc</kbd> close</span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PersonaSearch;