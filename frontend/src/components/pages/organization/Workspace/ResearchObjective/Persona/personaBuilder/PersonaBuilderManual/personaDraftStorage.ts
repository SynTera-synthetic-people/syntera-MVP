// ══════════════════════════════════════════════════════════════════════════════
// Local draft persistence for the manual persona builder
// ══════════════════════════════════════════════════════════════════════════════
//
// Nothing on this screen touches the backend until "Calibrate Persona" is
// pressed — that's the first call (POST /personas/manual) that creates a row.
// Until then the persona name, every selected attribute and the formative
// experience live only in React state, so a refresh (or an accidental
// back/forward) silently threw all of it away and the screen came back as
// "Persona 1" with nothing selected.
//
// Same approach as the Research Objective Framer's `ro_framer_draft_*` keys:
// a per-exploration localStorage snapshot, hydrated on mount and cleared once
// the persona has actually been created server-side.

import type { PersonaFormData, MainCategory } from '../PersonaBuilderType';
import { mainCategories } from '../data';

export const DEFAULT_PERSONA_NAME = 'Persona 1';

export interface PersonaBuilderDraft {
    personaName: string;
    /** True once the user has actually renamed the persona, so we can tell a
     *  deliberate name from the untouched "Persona 1" placeholder. */
    isNameCustom: boolean;
    formData: PersonaFormData;
    formativeExperience: string;
    completedSubTabs: string[];
    activeCategory: MainCategory;
    activeSubTab: string;
}

// Bump when the draft shape changes incompatibly — mismatched snapshots are
// dropped rather than half-restored.
const DRAFT_VERSION = 1;

const draftKey = (objectiveId?: string) => `pbm_persona_draft_${objectiveId ?? 'unknown'}`;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** localStorage holds user-editable text: never trust the parsed shape. Values
 *  that don't match PersonaFormData (string | string[]) are dropped rather than
 *  fed into the form, where they'd break `.trim()`/`.map()` call sites. */
const sanitizeFormData = (value: unknown): PersonaFormData => {
    if (!isPlainObject(value)) return {};
    const clean: Record<string, string | string[]> = {};
    Object.entries(value).forEach(([key, entry]) => {
        if (typeof entry === 'string') {
            clean[key] = entry;
        } else if (Array.isArray(entry)) {
            const strings = entry.filter((item): item is string => typeof item === 'string');
            if (strings.length) clean[key] = strings;
        }
    });
    return clean as PersonaFormData;
};

export const savePersonaDraft = (objectiveId: string | undefined, draft: PersonaBuilderDraft): void => {
    try {
        localStorage.setItem(draftKey(objectiveId), JSON.stringify({ version: DRAFT_VERSION, ...draft }));
    } catch {
        // Storage full or blocked (private mode) — the builder still works,
        // it just won't survive a refresh.
    }
};

export const loadPersonaDraft = (objectiveId?: string): PersonaBuilderDraft | null => {
    try {
        const saved = localStorage.getItem(draftKey(objectiveId));
        if (!saved) return null;

        const parsed: unknown = JSON.parse(saved);
        if (!isPlainObject(parsed) || parsed.version !== DRAFT_VERSION) return null;

        const personaName =
            typeof parsed.personaName === 'string' && parsed.personaName.trim()
                ? parsed.personaName
                : DEFAULT_PERSONA_NAME;

        const activeCategory = mainCategories.includes(parsed.activeCategory as MainCategory)
            ? (parsed.activeCategory as MainCategory)
            : 'Demographics';

        return {
            personaName,
            isNameCustom: parsed.isNameCustom === true,
            formData: sanitizeFormData(parsed.formData),
            formativeExperience:
                typeof parsed.formativeExperience === 'string' ? parsed.formativeExperience : '',
            completedSubTabs: Array.isArray(parsed.completedSubTabs)
                ? parsed.completedSubTabs.filter((tab): tab is string => typeof tab === 'string')
                : [],
            activeCategory,
            activeSubTab: typeof parsed.activeSubTab === 'string' ? parsed.activeSubTab : 'Age',
        };
    } catch {
        return null;
    }
};

export const clearPersonaDraft = (objectiveId?: string): void => {
    try {
        localStorage.removeItem(draftKey(objectiveId));
    } catch {
        // ignore
    }
};

/** Has the user actually entered anything worth keeping? Used to avoid
 *  littering storage with empty snapshots for every exploration visited. */
export const draftHasContent = (draft: PersonaBuilderDraft): boolean =>
    draft.isNameCustom ||
    draft.personaName !== DEFAULT_PERSONA_NAME ||
    draft.formativeExperience.trim() !== '' ||
    draft.completedSubTabs.length > 0 ||
    Object.values(draft.formData).some((value) =>
        Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '',
    );
