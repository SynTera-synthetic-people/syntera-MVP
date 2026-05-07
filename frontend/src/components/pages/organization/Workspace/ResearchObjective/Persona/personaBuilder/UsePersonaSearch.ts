// ══════════════════════════════════════════════════════════════════════════════
// usePersonaSearch — Search hook for Persona Builder
// Searches across: attribute names, option values, category names, tooltips
// No external deps — pure substring + fuzzy matching
// ══════════════════════════════════════════════════════════════════════════════

import { useMemo, useState, useCallback } from 'react';
import {
    optionData,
    contentData,
    attributeTooltips,
    optionTooltips,
} from './data';
import type { MainCategory } from './PersonaBuilderType';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SearchResultType = 'attribute' | 'option' | 'category';

export interface SearchResult {
    type: SearchResultType;
    /** Primary label shown in the result row */
    label: string;
    /** Secondary context shown dimmed beside the label */
    context: string;
    /** The category tab to navigate to */
    category: MainCategory;
    /** The sub-tab (attribute) to activate — undefined for category results */
    subTab?: string;
    /** For option results: the option value to auto-select */
    optionValue?: string;
    /** A score for sorting: lower = better match */
    score: number;
    /** Indices in `label` that matched the query, for highlight rendering */
    matchRanges: [number, number][];
}

// ── Search Index ──────────────────────────────────────────────────────────────

interface IndexEntry {
    type: SearchResultType;
    label: string;
    context: string;
    category: MainCategory;
    subTab?: string;
    optionValue?: string;
    /** Additional text to search against (tooltips, descriptions) */
    searchText: string;
}

const buildIndex = (): IndexEntry[] => {
    const entries: IndexEntry[] = [];

    for (const [categoryName, categoryData] of Object.entries(contentData)) {
        const category = categoryName as MainCategory;

        // ── Category entry ──
        entries.push({
            type: 'category',
            label: categoryName,
            context: categoryData.tooltip,
            category,
            searchText: `${categoryName} ${categoryData.tooltip}`.toLowerCase(),
        });

        // ── Attribute entries ──
        for (const attributeName of categoryData.items) {
            const tooltip = attributeTooltips[attributeName] ?? '';

            entries.push({
                type: 'attribute',
                label: attributeName,
                context: categoryName,
                category,
                subTab: attributeName,
                searchText: `${attributeName} ${tooltip}`.toLowerCase(),
            });

            // ── Option value entries ──
            const options = optionData[attributeName] ?? [];
            const attrOptionTooltips = optionTooltips[attributeName] ?? {};

            for (const option of options) {
                const optTooltip = attrOptionTooltips[option] ?? '';
                entries.push({
                    type: 'option',
                    label: option,
                    context: `${attributeName} · ${categoryName}`,
                    category,
                    subTab: attributeName,
                    optionValue: option,
                    searchText: `${option} ${optTooltip} ${attributeName}`.toLowerCase(),
                });
            }
        }
    }

    return entries;
};

// ── Matching Logic ─────────────────────────────────────────────────────────────

/**
 * Returns [score, matchRanges] for a query against a label string.
 * Score: 0 = exact, 1 = starts with, 2 = word starts with, 3 = substring, 4 = fuzzy
 * Returns null if no match.
 */
const matchLabel = (
    query: string,
    label: string
): { score: number; matchRanges: [number, number][] } | null => {
    const q = query.toLowerCase();
    const l = label.toLowerCase();

    // Exact match
    if (l === q) return { score: 0, matchRanges: [[0, label.length]] };

    // Starts with
    if (l.startsWith(q)) return { score: 1, matchRanges: [[0, q.length]] };

    // Substring
    const idx = l.indexOf(q);
    if (idx !== -1) return { score: 3, matchRanges: [[idx, idx + q.length]] };

    // Word boundary match (any word in the label starts with the query)
    const words = l.split(/[\s(,·\-]+/);
    let wordStart = 0;
    for (const word of words) {
        if (word.startsWith(q)) {
            return { score: 2, matchRanges: [[wordStart, wordStart + q.length]] };
        }
        wordStart += word.length + 1;
    }

    // Fuzzy: all query chars appear in order in the label
    const ranges: [number, number][] = [];
    let qi = 0;
    let li = 0;
    while (qi < q.length && li < l.length) {
        if (q[qi] === l[li]) {
            ranges.push([li, li + 1]);
            qi++;
        }
        li++;
    }
    if (qi === q.length) return { score: 4 + (li - q.length) / 100, matchRanges: ranges };

    return null;
};

/**
 * Also checks searchText (tooltips etc.) for a secondary context match.
 * Returns a score penalty on top of the label score (or a fallback score if
 * the label itself didn't match but the tooltip did).
 */
const matchEntry = (
    query: string,
    entry: IndexEntry
): { score: number; matchRanges: [number, number][] } | null => {
    const labelMatch = matchLabel(query, entry.label);
    if (labelMatch) return labelMatch;

    // Secondary: search in the full searchText blob
    if (entry.searchText.includes(query.toLowerCase())) {
        // Tooltip-only match — lower priority, no highlight ranges
        return { score: 10, matchRanges: [] };
    }

    return null;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

const INDEX = buildIndex();

export const usePersonaSearch = () => {
    const [query, setQuery] = useState('');

    const results = useMemo((): SearchResult[] => {
        const q = query.trim();
        if (q.length < 1) return [];

        const matched: SearchResult[] = [];

        for (const entry of INDEX) {
            const m = matchEntry(q, entry);
            if (!m) continue;

            matched.push({
                type: entry.type,
                label: entry.label,
                context: entry.context,
                category: entry.category,
                score: m.score,
                matchRanges: m.matchRanges,
                ...(entry.subTab !== undefined && { subTab: entry.subTab }),
                ...(entry.optionValue !== undefined && { optionValue: entry.optionValue }),
            });
        }

        // Sort: by type priority first (attribute > option > category),
        // then by match score within each type
        const typePriority: Record<SearchResultType, number> = {
            attribute: 0,
            option: 1,
            category: 2,
        };

        matched.sort((a, b) => {
            const tp = typePriority[a.type] - typePriority[b.type];
            if (tp !== 0) return tp;
            return a.score - b.score;
        });

        // Cap results: 4 attributes, 6 options, 3 categories
        const attributes = matched.filter((r) => r.type === 'attribute').slice(0, 4);
        const options = matched.filter((r) => r.type === 'option').slice(0, 6);
        const categories = matched.filter((r) => r.type === 'category').slice(0, 3);

        // Interleave in display order
        return [...attributes, ...options, ...categories];
    }, [query]);

    const clearQuery = useCallback(() => setQuery(''), []);

    return { query, setQuery, results, clearQuery };
};