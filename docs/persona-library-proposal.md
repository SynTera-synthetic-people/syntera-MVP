# Persona Library Proposal

**Status:** ✅ Implemented (2026-08-26). This document is kept as the design record.
**Date:** proposed 2026-08-25 · shipped 2026-08-26
**Prototype:** removed — superseded by the production implementation (see §11).

> **How to read this document.** Every claim is tagged:
> **[EXISTS]** — verified in the current codebase, file/line cited.
> **[PROPOSED]** — my recommendation, not yet built.
> **[CONFIRM]** — needs a team decision before implementation.

---

## 1. Problem

An enterprise customer (e.g. Mercedes) has ~4 recurring persona archetypes — "Silver Spender",
"Premium Buyer", "Family Buyer", "Young Professional" — that represent a large share of their
customers. Today those personas are recreated from scratch in every exploration.

**Why that is expensive right now, specifically:**

- **[EXISTS]** `Persona.exploration_id` is a **non-nullable FK** to `explorations.id`
  ([backend/app/models/persona.py:12](../backend/app/models/persona.py#L12)). A persona
  cannot exist outside exactly one exploration.
- **[EXISTS]** The only copy mechanism, `replicate_persona`, **hard-rejects any source persona
  from a different exploration**:
  `if not source or str(source["exploration_id"]) != str(exploration_id): raise 404`
  ([backend/app/routers/personas.py:1391](../backend/app/routers/personas.py#L1391)).
  Replication is designed for *country localisation within one exploration*, not reuse across
  explorations.
- **[EXISTS]** Deleting an exploration **hard-deletes its personas**:
  `delete(Persona).where(Persona.exploration_id == eid)`
  ([backend/app/services/exploration.py:589](../backend/app/services/exploration.py#L589)).
  So even the historical record disappears.
- **[EXISTS]** Regenerating is not cheap. Each persona runs the 5-stage Digital Brain Pipeline
  plus background Knowledge-Enrichment web search — measured at **~180s per calibration run**,
  with a single evidence-collection LLM call taking 100s+
  ([frontend/.../PersonaGenerationLoader.tsx:38-45](../frontend/src/components/pages/organization/Workspace/ResearchObjective/PersonaGenerationLoader.tsx#L38-L45)).

So reuse today means paying full generation cost for a persona the customer has already
validated, and getting a *different* persona each time — which destroys longitudinal
comparability across studies. That second point is the real business problem: Mercedes cannot
say "the same Silver Spender responded differently to the EQS than to the GLC" unless the
persona is genuinely the same.

---

## 2. Proposed User Flow

**[EXISTS]** Today, after the Research Objective is confirmed, `AddResearchObjective.tsx`
renders exactly two CTAs in `.aro-cta-buttons`
([line 1146-1176](../frontend/src/components/pages/organization/Workspace/ResearchObjective/AddResearchObjective.tsx#L1146-L1176)):

| Button | Handler | Destination |
|---|---|---|
| Create with Omi | `handleCreateWithOmi` (line 555) | `/persona-generating` → `/persona-builder` |
| Build Manually | `handleBuildManually` (line 595) | `/persona-builder/manual` |

**[PROPOSED]** Add a third CTA to that same block. Nothing else on the screen changes.

```
Research Objective (confirmed)
            ↓
     Persona Source
   ┌────────┬────────────┬──────────────────┐
   │        │            │                  │
Create   Build       Choose From        (new)
with Omi Manually    Library
   │        │            │
   │        │            ↓
   │        │      Persona Library
   │        │      · multi-select
   │        │      · shows origin exploration
   │        │            ↓
   │        │      Import as snapshots
   │        │            │
   └────────┴────────────┘
            ↓
   PersonaBuilder  ← EXISTING screen, unchanged
   (library personas already populated)
            ↓
   Need more personas?
      ├── Yes → fill each open slot EITHER way:
      │           ├── Generate with Omi  → existing /auto-generate
      │           └── Build Manually     → existing /persona-builder/manual
      └── No  → continue
            ↓
   Exploration Method → Research Exploration
```

**[EXISTS]** Both fill options already live on the review screen today — `PersonaBuilder` has its
own `handleBuildManually` (gated on `isEnterpriseUser`) that navigates to
`/persona-builder/manual`, and the `PersonaGridCard isCreateNew` "Create New Persona" card calls
it ([PersonaBuilder.tsx:1685-1693](../frontend/src/components/pages/organization/Workspace/ResearchObjective/Persona/personaBuilder/PersonaBuilder.tsx#L1685-L1693)).
**The library must not narrow this to Omi-only** — a user who takes 2 from the library must keep
the same freedom to hand-build the other 2 that they have today.

The key UX property: **the library is an on-ramp, not a parallel flow.** It drops the user into
the existing `PersonaBuilder` review grid with slots pre-filled. Everything downstream is
untouched.

---

## 3. Existing Code Reuse

This feature needs **far less new code than it first appears**, because three of the four hard
parts already exist.

### 3.1 The "generate only the remaining N" engine already exists — **[EXISTS]**

This is the single most important finding. `auto_generate_personas`
([backend/app/routers/personas.py:340-370](../backend/app/routers/personas.py#L340-L370))
already computes the shortfall server-side:

```python
persona_limit = _persona_limit_for(current_user, exp)          # 4 for enterprise
total_count, omi_count = await _count_primary_personas(...)
remaining_slots     = max(persona_limit - total_count, 0)
remaining_omi_slots = max(persona_limit - omi_count, 0)
personas_to_generate = min(remaining_slots, remaining_omi_slots)

if personas_to_generate <= 0:
    return SuccessResponse(message="Persona limit already reached", ...)

personas = await auto_generated_persona.ai_generate_persona(
    exploration_id, workspace_id, current_user_id,
    target_count=personas_to_generate,        # ← generates ONLY the gap
    total_persona_goal=persona_limit,
    starting_persona_number=total_count + 1,  # ← numbering continues correctly
)
```

**Case 2 (all 4 from library) is already handled too** — `personas_to_generate <= 0` returns
early without calling the LLM at all, and `ai_generate_persona` itself short-circuits on
`target_count <= 0` ([auto_generated_persona.py:980-983](../backend/app/services/auto_generated_persona.py#L980-L983)).

**So the required-minus-selected arithmetic does not need to be built. It needs one bug fixed —
see §6.**

### 3.2 The snapshot/copy primitive already exists — **[EXISTS]**

`persona_service.replicate_persona`
([backend/app/services/persona.py:1193-1360](../backend/app/services/persona.py#L1193-L1360))
already does exactly "materialise a new `Persona` row into a target `exploration_id` /
`workspace_id`, carrying every trait forward and setting `parent_persona_id` for lineage."
The library import is a **cheaper variant of this function with the LLM adaptation step
removed** — a straight field copy.

### 3.3 Provenance display already exists — **[EXISTS]**

- `Persona.parent_persona_id` — lineage column ([persona.py:97](../backend/app/models/persona.py#L97))
- `_persona_source(p)` → `"replicated" | "omi" | "manual"` ([persona.py:115-121](../backend/app/services/persona.py#L115-L121)),
  already surfaced to the frontend as `persona_source` in `persona_to_dict`
- `PersonaGridCard` already branches on `persona.parent_persona_id` to change the "Created By"
  display ([PersonaBuilder.tsx:996](../frontend/src/components/pages/organization/Workspace/ResearchObjective/Persona/personaBuilder/PersonaBuilder.tsx#L996))

Adding a `"library"` value to that enum gives us the "Library Persona" / "Omi Generated" /
"Built Manually" badges with no new plumbing — `_persona_source()` already returns
`manual` for hand-built personas.

### 3.4 Reuse map

| Need | Existing asset | Change |
|---|---|---|
| Source-choice UI | `.aro-cta-buttons` block, `AddResearchObjective.tsx:1146` | Add 3rd button |
| Card-grid selection UI | `ApproachSelectionPage.tsx` (card-select page pattern) | New screen, same pattern |
| Persona card visual | `PersonaGridCard` + `.pb-card` CSS | Reuse geometry, add checkbox |
| Persona detail view | `PersonaPreview.tsx` (existing route) | Reuse as-is |
| Review grid | `PersonasReadyGrid` / `PersonaBuilder.tsx:1176` | Add source badge |
| Snapshot copy | `replicate_persona` | Fork a no-LLM variant |
| Gap generation | `auto_generate_personas` | Fix counting (§6) |
| Org-scoped auth | `require_enterprise_admin_or_sp` ([core/permissions.py:36](../backend/app/core/permissions.py#L36)) | Reuse |
| Org-scoped queries | `enterprise_service` already queries `Persona.exploration_id.in_(exp_ids)` across an org ([enterprise_service.py:516](../backend/app/services/enterprise_service.py#L516)) | Reuse the pattern |
| Frontend data layer | `personaService.js` + `usePersonaBuilder.js` (react-query) | Add methods/hooks |

---

## 4. Proposed Architecture

### 4.1 Scope: enterprise (organization) level — **[PROPOSED]**

**Recommendation: scope the library to `organization_id`, with `origin_workspace_id` retained
as display metadata and an optional filter.**

Reasoning from the existing schema:

- **[EXISTS]** `Workspace.organization_id` FK → `organization.id`; `Organization.account_tier`
  is `"standard" | "enterprise"`; `User.organization_id` links enterprise users to their org
  (memory + [models/organization.py](../backend/app/models/organization.py)).
- The business requirement is explicitly *"4 personas representing a large portion of their
  customers"* reused *"across many different research explorations"* — the Mercedes tree in the
  brief puts the library as a **sibling of the workspaces**, not inside one.
- **[EXISTS]** Enterprise cross-workspace views already exist and are already permissioned:
  `GET /enterprise/organizations/{org_id}/explorations`
  ([routers/enterprise.py:287](../backend/app/routers/enterprise.py#L287)).

Workspace-only scoping would defeat the purpose — Workspace B could not reuse a persona built
in Workspace A. **[CONFIRM]** Whether workspace-level *visibility restriction* is needed on top
(i.e. an opt-in "share to org" flag per persona) is Open Question 1.

### 4.2 Snapshot, not reference — **[PROPOSED]**

**Recommendation: selecting a library persona creates a new `Persona` row (a snapshot) in the
target exploration. It must NOT reference the original row.**

This is not a preference — the current schema makes referencing unsafe:

1. **[EXISTS]** Six tables hold an FK or id-list pointing at `persona.id`:
   `InterviewSession.persona_id`, `RebuttalSession.persona_id`,
   `ArtifactPersona.persona_id`, `Questionnaire.persona_ids`,
   `PopulationSimulation.persona_ids`, `SurveySimulation.persona_id`, plus
   `NeuroState.persona_id` / `LLMUsage.persona_id`.
   A shared persona row would collect interview transcripts, survey answers and neuro state
   from **every exploration that referenced it** — with no exploration discriminator on most of
   those joins. Results from the EQS study would contaminate the GLC study.
2. **[EXISTS]** `delete(Persona).where(Persona.exploration_id == eid)` on exploration delete
   ([exploration.py:589](../backend/app/services/exploration.py#L589)) would destroy a shared
   row for every other exploration using it.
3. **[EXISTS]** `Persona.exploration_id` is non-nullable, so a "library-only" persona row
   cannot even be represented today without a schema change.
4. Research integrity: a persona used in a September study must stay frozen as it was in
   September. Editing the library entry must not retroactively change a completed study.

**Snapshot semantics:** copy → new `persona.id`, new `exploration_id`, new `workspace_id`,
provenance recorded, original untouched. This is exactly what `replicate_persona` already does.

### 4.3 A separate library table — **[PROPOSED]**

Because exploration deletion hard-deletes personas (§1), the library entry **cannot** just be a
pointer to the original `Persona` row — it would dangle the moment someone deletes the EV
Research exploration.

**Recommendation: one new table, `persona_library_item`, holding a frozen copy of the persona
payload.** It is self-sufficient: if the origin exploration is deleted, the library entry
survives and still works.

### 4.4 Change summary

| Layer | Change | Risk |
|---|---|---|
| DB | 1 new table `persona_library_item`; 2 nullable columns on `persona` | Low — additive only |
| Backend | 1 new router (`persona_library.py`), 1 new service; **one fix** to `_count_primary_personas` | Low, except the fix (§6) |
| Frontend | 1 new CTA, 1 new route/screen, badge on existing cards | Low |
| Pipeline | **None** — personas arrive as normal rows in the exploration | None |

---

## 5. Persona Lifecycle

```
   ┌─────────────────────────────────────────────────────────────┐
   │  Exploration A (EV Research)                                │
   │                                                             │
   │   Create Persona ──► Calibrate ──► Persona row (per_9f2a)   │
   │                                          │                  │
   └──────────────────────────────────────────┼──────────────────┘
                                              │
                            "Save to Library" │  (explicit user action)
                                              ▼
                        ┌──────────────────────────────────────┐
                        │  persona_library_item (lib_01)       │
                        │  org: Mercedes                       │
                        │  name: "Silver Spender"              │
                        │  frozen payload + provenance         │
                        │  status: active                      │
                        │                                      │
                        │  survives deletion of Exploration A  │
                        └──────────────────────────────────────┘
                                              │
                     "Choose From Library"    │  (in a later exploration)
                                              ▼
   ┌──────────────────────────────────────────┼──────────────────┐
   │  Exploration B (EQS Facelift)            │                  │
   │                                          ▼                  │
   │   NEW Persona row (per_x12) ── library_item_id → lib_01     │
   │        exploration_id = B                                   │
   │        persona_source = "library"                           │
   │                          │                                  │
   │                          ▼                                  │
   │   Interviews · Questionnaire · Survey · Report              │
   │   (all exploration-specific, attached to per_x12 only)      │
   └─────────────────────────────────────────────────────────────┘
```

**[CONFIRM]** Is "Save to Library" an explicit action, or is every calibrated persona
automatically a library candidate? See Open Question 2. My recommendation is **explicit** —
an auto-populated library fills with throwaway personas and becomes unusable. The prototype
shows the explicit model.

---

## 6. Existing + New Persona Logic

### The arithmetic

```
   Required Personas  −  Library Personas Selected  =  Slots Left To Fill
```

**Note the wording:** the remainder is *slots to fill*, not *personas to generate*. Each open slot
can be filled by Omi generation **or** by the manual builder — both already exist on the review
screen, and the library must preserve that choice (§2).

**[EXISTS]** `Required` is already defined: `_persona_limit_for(user, exp)` =
`_base_persona_limit_for(user)` + `exp.additional_persona_limit`, where the base is
`ENTERPRISE_PERSONA_LIMIT = 4` for enterprise and `NON_ENTERPRISE_OMI_PERSONA_LIMIT = 2`
otherwise ([personas.py:182-198](../backend/app/routers/personas.py#L182-L198)).

**[EXISTS]** The subtraction and the generation call already work (§3.1). Once library personas
exist as rows in the exploration, `total_count` rises and `personas_to_generate` falls
automatically. **No new orchestration is required.**

### ⚠️ The one real bug to fix — **[EXISTS], must change**

`_count_primary_personas` excludes any persona with lineage:

```python
base_filters = (
    _Persona.workspace_id == workspace_id,
    _Persona.exploration_id == exploration_id,
    _Persona.parent_persona_id.is_(None),   # ← excludes replicated personas
)
```
([personas.py:214-218](../backend/app/routers/personas.py#L214-L218))

That filter is correct for *country replication* (a localised copy is a variant, not a new
persona against quota). But if library imports set `parent_persona_id`, they would be invisible
to the counter — so selecting 4 from the library would still generate 4 more, producing 8
personas. **Case 2 would silently break.**

**[PROPOSED] Fix:** distinguish the two lineage kinds. Introduce `Persona.library_item_id` for
library imports and leave `parent_persona_id` to mean country-replication only. Then:

```python
base_filters = (
    _Persona.workspace_id == workspace_id,
    _Persona.exploration_id == exploration_id,
    _Persona.parent_persona_id.is_(None),   # still excludes replicated variants
)                                            # library imports now counted, since
                                             # they set library_item_id, not parent_persona_id
```

With that separation the existing filter needs **no change at all** — library personas count
naturally because `parent_persona_id` stays NULL on them.

### ⚠️ A second, pre-existing inconsistency worth flagging — **[EXISTS]**

The two creation paths count personas differently:

| Path | Counter | Counts replicated? |
|---|---|---|
| Omi (`/auto-generate`) | `_count_primary_personas` ([personas.py:207](../backend/app/routers/personas.py#L207)) | **No** |
| Manual (`/manual`) | `count_personas_in_exploration` ([manual_digital_brain_persona.py:81](../backend/app/services/manual_digital_brain_persona.py#L81)) | **Yes** |

This already means an exploration with replicated personas enforces a different effective limit
depending on which button the user presses. It is **not caused by this feature**, but the
library will make it more visible. **[CONFIRM]** Should we unify these while we're here?

### Walkthroughs

| Case | Required | Library | Server computes | How the gap gets filled |
|---|---|---|---|---|
| 1 | 4 | 2 | `4 − 2 = 2` | 2 slots — Omi, manual, or a mix of both |
| 2 | 4 | 4 | `4 − 4 = 0` → early return | nothing to fill; **no LLM call** |
| 3 | 4 | 3 | `4 − 3 = 1` | 1 slot — Omi or manual |
| — | 4 | 0 | `4 − 0 = 4` | 4 slots (today's behaviour, unchanged) |

A slot filled manually raises `total_count` exactly as a generated one does — the manual path
already writes an ordinary `Persona` row — so mixing the two needs no extra bookkeeping.

---

## 7. Data Model Recommendation

> **Superseded by §11.** The shipped design has **no `persona_library_item` table** — the
> library is a live query over the organisation's personas, and only two nullable columns
> were added to `persona`. This section is kept as the record of what was considered.


### Current state — **[EXISTS]**

```
Organization (id, account_tier, exploration_limit, exploration_count)
     │ 1─N
Workspace (id, organization_id)
     │ 1─N
Exploration (id, workspace_id, additional_persona_limit, is_deleted)
     │ 1─N
Persona (id, exploration_id NOT NULL, workspace_id, ...traits...,
         persona_details JSONB, parent_persona_id, calibration_status,
         master_calibration_confidence)
```

There is **no join table** between Exploration and Persona — the relationship is a direct FK on
`Persona`. That is why a snapshot (a new row) is the natural fit and an `exploration_persona`
join table is *not* needed.

### Proposed additions — **[PROPOSED]**

```
Organization
     │ 1─N
PersonaLibraryItem                        ← NEW TABLE
     ├─ id                    str PK
     ├─ organization_id       str FK → organization.id   (INDEXED — isolation boundary)
     ├─ name                  str
     ├─ description           str?        (curator's note: "affluent 55+ German buyer")
     │
     ├─ source_persona_id     str?        nullable, NO FK — origin row may be deleted
     ├─ origin_exploration_id str?        nullable, display only
     ├─ origin_workspace_id   str?        nullable, display only
     ├─ origin_exploration_title str?     denormalised — survives exploration deletion
     │
     ├─ payload               JSONB       frozen full persona snapshot
     ├─ payload_version       int         schema version of the frozen payload
     │
     ├─ status                str         "active" | "archived"
     ├─ times_reused          int         default 0
     ├─ created_by            str FK → user.id
     ├─ created_at            datetime
     ├─ updated_at            datetime?
     └─ archived_at           datetime?

Persona                                   ← 2 NEW NULLABLE COLUMNS
     ├─ library_item_id       str?        FK → persona_library_item.id, ON DELETE SET NULL
     └─ library_imported_at   datetime?
```

**Why `origin_exploration_title` is denormalised:** the library card must show *"Used in: EV
Research"* even after that exploration is deleted. Without denormalisation the card goes blank —
and **[EXISTS]** exploration deletion is a real hard delete of related rows
([exploration.py](../backend/app/services/exploration.py#L565-L615)).

**Why `source_persona_id` has no FK constraint:** the origin `Persona` row is hard-deleted with
its exploration. A real FK would either block the deletion or null the provenance. Store the id
as a soft pointer and treat "not found" as expected.

**Why `payload` is JSONB, not columns:** `persona_details` is already JSONB, and memory records
**647 distinct top-level keys with only 33 stable** across the estate. Mirroring the flat
columns would guarantee drift; freezing the whole `persona_to_dict()` output keeps the snapshot
faithful. `payload_version` lets us migrate the reader later.

### Reusable vs exploration-specific fields

| Reusable (goes in `payload`) — **[PROPOSED]** | Exploration-specific (never copied) — **[EXISTS]** |
|---|---|
| `name`, `age_range`, `gender` | `id`, `exploration_id`, `workspace_id` |
| All demographics (`location_*`, `education_level`, `occupation`, `income_range`, `family_size`, `geography`) | `created_at`, `created_by` |
| Psychographics (`lifestyle`, `values`, `personality`, `interests`, `motivations`) | Interview sessions / transcripts |
| Behavioural (`brand_sensitivity`, `price_sensitivity`) | Questionnaire + survey responses |
| Lifestyle (`mobility`, `accommodation`, `marital_status`, `daily_rhythm`, `hobbies`) | `NeuroState` / affect carry-over rows |
| `professional_traits`, `digital_activity`, `preferences`, `backstory` | `LLMUsage` rows |
| `ocean_profile`, `persona_details` | Report / traceability artifacts |
| `calibration_confidence`, `master_calibration_confidence` | `additional_persona_limit` |

**[CONFIRM]** Two fields sit on the boundary and need a decision (Open Question 3):
- **`persona_details.predominant_patterns`** — scored *against the origin research objective*.
  Carrying it into a different RO may be misleading.
- **`persona_details.ke_evidence_coverage`** — Knowledge-Enrichment sources gathered for the
  origin RO's search queries, and time-sensitive.

My recommendation: **copy both, but flag them as origin-derived** and offer an optional
"re-calibrate against this objective" action. Discarding them would drop the confidence score to
blank, which reads as a regression to the user.

---

## 8. API Proposal — **[PROPOSED]**

All routes follow the existing `SuccessResponse` / `ErrorResponse` envelope
([app/schemas/response.py](../backend/app/schemas/response.py)) and the existing
`get_current_active_user` dependency. **None of these are implemented — the prototype uses mock data.**

> **Shipped variant:** routes are scoped under `/workspaces/{workspace_id}/persona-library`
> instead of `/organizations/{org_id}/...`. The organisation is resolved *from the workspace*,
> which is the authoritative link — that way an ordinary member of an enterprise org reaches
> the right library even if their JWT predates the `organization_id` claim, and authorisation
> reuses the same workspace-membership check every other persona route already applies.

New router: `backend/app/routers/persona_library.py`.

### `GET /organizations/{org_id}/persona-library`

List library items. Auth: member of `org_id` (reuse `require_enterprise_admin_or_sp` pattern,
widened to ordinary org members — see Open Question 5).

```
Query: ?status=active&workspace_id=<ws>&q=<search>&limit=50&offset=0

200 → { status, message, data: {
  items: [{
    id, name, description,
    origin_exploration_id, origin_exploration_title,
    origin_workspace_id, origin_workspace_name,
    age_range, gender, location_state, geography, occupation, income_range,
    master_calibration_confidence, persona_source,
    status, times_reused, created_by_name, created_at
  }],
  total: 12
}}
```

### `POST /organizations/{org_id}/persona-library`  *(shipped as workspace-scoped — see §11)*

Publish an existing persona into the library.

```
Body: { persona_id: str, name?: str, description?: str }
201 → { data: { id, name, ... } }
409 → a library item already exists for this source_persona_id
```

### `GET /organizations/{org_id}/persona-library/{item_id}`
Full frozen payload, for the detail view.

### `PATCH /organizations/{org_id}/persona-library/{item_id}`
`{ name?, description?, status? }` — rename / archive / unarchive.

### `DELETE /organizations/{org_id}/persona-library/{item_id}`
**Soft delete** (`status="archived"`), matching the existing soft-delete convention on `User`
and `Exploration`. Personas already imported are unaffected.

### ⭐ `POST /workspaces/{ws}/explorations/{exp}/personas/import-from-library`

The core endpoint. Sits on the **existing personas router**
([routers/personas.py](../backend/app/routers/personas.py)) so it inherits its auth and
workspace-membership checks.

```
Body: { library_item_ids: [str, ...] }

200 → { status, message, data: {
  imported:  [ <full persona_to_dict objects> ],
  skipped:   [{ library_item_id, reason: "already_imported"|"archived"|"not_in_org" }],
  quota: {                       # same shape as GET /personas/quota
    limit: 4, used: 2, remaining: 2
  },
  personas_still_to_generate: 2  # convenience mirror of quota.remaining
}}

403 → not a workspace member / item belongs to another organization
400 → import would exceed the exploration's persona limit
```

Semantics: for each id, materialise a new `Persona` row from the frozen payload with
`exploration_id`/`workspace_id` set to the target, `library_item_id` set, `parent_persona_id`
left **NULL** (so it counts toward quota — §6), `calibration_status` carried forward. Increment
`times_reused`. All in one transaction — partial imports must not happen.

### Unchanged endpoints

`GET /personas/auto-generate` — **[EXISTS]**, needs **no signature change**. After import it
naturally computes the smaller `personas_to_generate`. This is the crux of the low-risk claim.

### Frontend additions

`personaService.js` — `getPersonaLibrary`, `publishToLibrary`, `importFromLibrary`.
`usePersonaBuilder.js` — `usePersonaLibrary`, `useImportFromLibrary`, plus a
`personaKeys.library(orgId)` query key. On import success, invalidate
`personaKeys.list(...)` and `personaKeys.quota(...)` — both already exist.

---

## 9. Edge Cases

| # | Case | Proposed behaviour | Basis |
|---|---|---|---|
| 1 | **Duplicate selection** (same item twice in one request) | De-duplicate `library_item_ids` server-side before processing. Idempotent. | **[PROPOSED]** |
| 2 | **Already imported** into this exploration | Skip with `reason: "already_imported"`; UI shows the card as "Already in this exploration", disabled. | **[PROPOSED]** |
| 3 | **Deleted library item** | Soft delete only (`status="archived"`). Import returns `skipped`, never 500. | **[PROPOSED]** |
| 4 | **Archived item** | Hidden from the picker by default; "Show archived" toggle reveals them read-only; import rejected with a clear reason. Shown in the prototype. | **[PROPOSED]** |
| 5 | **Origin exploration deleted** | Library item survives — payload is frozen and `origin_exploration_title` is denormalised. Card shows the title with a "(deleted)" suffix. | Mitigates **[EXISTS]** hard delete at [exploration.py:589](../backend/app/services/exploration.py#L589) |
| 6 | **Persona from another organization** | Query is always filtered by `organization_id`; a mismatched id returns **404, not 403** (do not confirm existence across tenants). | **[PROPOSED]** |
| 7 | **Persona from another workspace, same org** | **Allowed** — that is the point of org-level scoping. Origin workspace is displayed for context. | **[PROPOSED]**, pending OQ 1 |
| 8 | **Selecting more than required** | Client caps selection at `limit`; server re-validates and returns 400. Prototype disables unselected cards at the cap. | **[EXISTS]** limit logic |
| 9 | **Selecting zero** | "Use Selected Personas" stays disabled; user can go back and generate all N. | **[PROPOSED]** |
| 10 | **Partial selection (1-3)** | Existing `/auto-generate` fills the gap. Already works. | **[EXISTS]** §3.1 |
| 11 | **Full selection (4)** | `personas_to_generate <= 0` → early return, no LLM cost. Already works. | **[EXISTS]** [personas.py:346](../backend/app/routers/personas.py#L346) |
| 12 | **Generation of remaining fails** | Imported personas are **already committed** — they survive. User retries generation only. Failure is isolated to the gap. | **[PROPOSED]** — a genuine robustness win over today |
| 13 | **Stale persona data** | Surface `created_at` and a "needs re-calibration" hint past a threshold; offer optional re-calibration. Never block. Shown in the prototype. | **[CONFIRM]** threshold |
| 14 | **Payload schema drift** | `payload_version` on every item; reader tolerates older versions. Given 647 observed `persona_details` keys, assume drift. | **[PROPOSED]** |
| 15 | **Concurrent import** (two users, same exploration) | Wrap in one transaction and re-check the limit inside it, matching the existing atomic `UPDATE ... SET count = count + 1` pattern used for exploration counters. | **[PROPOSED]** |
| 16 | **Non-enterprise user** | Library is enterprise-only. Free/Tier-1 have a 2-persona cap and no org. Hide the CTA — mirrors the existing `manualAllowed` gate on "Build Manually". | **[EXISTS]** gating pattern |
| 18 | **Mixing fill methods in one exploration** | Fully supported: 2 library + 1 Omi + 1 manual is valid. Each writes an ordinary `Persona` row, so the counter handles it with no extra logic. The review screen labels all three sources. | **[PROPOSED]** |
| 19 | **Manual fill for a user without manual rights** | `PersonaBuilder.handleBuildManually` already early-returns for non-enterprise users. Since the library is enterprise-only, both are available together — but keep the guard so the states can't diverge. | **[EXISTS]** [PersonaBuilder.tsx:1685](../frontend/src/components/pages/organization/Workspace/ResearchObjective/Persona/personaBuilder/PersonaBuilder.tsx#L1685) |
| 17 | **Permissions** | Read: any org member. Publish/archive: **[CONFIRM]** — see OQ 5. | **[CONFIRM]** |

---

## 10. Open Questions for the Team

These are the decisions I could not settle from the code. **Ranked by how much rework a late
reversal would cause.**

### OQ 1 — Enterprise-level or workspace-level library? 🔴 *highest impact*
My recommendation: **organization-level**, with origin workspace shown and filterable.
Workspace-level defeats the Mercedes use case (Workspace B could not reuse Workspace A's
persona). But: do some customers need workspace-private personas — e.g. an agency running
competing brands in separate workspaces of one org?
*Reversing this later means a data migration and an auth-model change.*

### OQ 2 — Explicit "Save to Library", or automatic? 🔴
My recommendation: **explicit**. Auto-publishing every calibrated persona fills the library with
throwaways and makes it unusable within weeks. But explicit means someone must remember to curate.
Middle option: auto-suggest publishing after an exploration completes.

### OQ 3 — Which fields are reusable? 🟡
Settled for the obvious ones (§7). Two need a call:
`predominant_patterns` and `ke_evidence_coverage` are **scored against the origin research
objective**. Copy them (score displays, but may mislead), or drop them (honest, but confidence
shows blank)? My recommendation: copy + flag + offer re-calibration.

### OQ 4 — Can a user edit a reused persona before running research? 🟡
The snapshot model makes editing the *imported copy* safe and free — it is an ordinary `Persona`
row and `PUT /personas/{id}` already works. The real question is whether edits should **flow back**
to the library item, and whether that creates **a new version** or mutates the existing one.
My recommendation for v1: **edits stay local to the exploration; no write-back, no versioning.**
Add "Save as new library persona" if demand appears.

### OQ 5 — Who can publish to and archive the library? 🟡
Options: (a) any org member, (b) `enterprise_admin` only, (c) creator + `enterprise_admin`.
My recommendation: **(c)**. The library is a curated enterprise asset; uncontrolled publishing
recreates the noise problem from OQ 2. **[EXISTS]** `require_enterprise_admin_or_sp` already
implements the admin half of this check.

### OQ 6 — Maximum library selections per exploration? 🟢
Currently bounded by the persona limit itself (4 for enterprise, +`additional_persona_limit`
purchased). Should library personas be exempt from the paid cap, since they cost no LLM spend?
*This is a pricing decision, not a technical one.*

### OQ 7 — Should we unify the two persona counters while we're in here? 🟢
**[EXISTS]** The Omi path and the manual path count personas differently (§6). Pre-existing,
not caused by this feature, but the library makes it more visible. Fix now or ticket separately?

---

## Recommended Approach for Team Review

### The recommended flow

Add **one button** — "Choose From Library" — next to the existing "Create with Omi" and
"Build Manually" CTAs after the Research Objective is confirmed. It opens an org-scoped picker
showing personas the organisation has already built, with their origin exploration. Selecting
personas **copies them into the current exploration** and drops the user into the **existing**
`PersonaBuilder` review screen with those slots pre-filled. Every slot that is still open can be
filled the same two ways as today — **generated with Omi or built manually** — and the review
screen labels all three sources. Nothing downstream changes.

### The major technical changes

1. **New table `persona_library_item`** — an org-scoped, frozen snapshot of a persona payload,
   independent of the origin exploration so it survives that exploration's deletion.
2. **Two nullable columns on `persona`** — `library_item_id`, `library_imported_at`. Additive,
   reversible, no data migration.
3. **One new endpoint that matters:** `POST /personas/import-from-library`. It is a
   field-copy variant of the existing `replicate_persona` with the LLM adaptation removed.
4. **Deliberately NOT changing the generation engine.** The
   `required − selected = to_generate` logic already exists and already handles the
   zero-remaining case without an LLM call. Keeping `parent_persona_id` NULL on library imports
   makes them count toward quota automatically — the existing counter needs no edit.
5. **Frontend:** one CTA, one picker screen, one badge. Existing card, preview, and review
   components are reused.

**Estimated surface: ~1 table, ~5 endpoints, ~3 frontend files.** The feature is far smaller
than it looks because the hard parts — snapshotting and gap-generation — already exist.

### The 5 decisions needed before implementation

| # | Decision | My recommendation | Cost if reversed late |
|---|---|---|---|
| 1 | Enterprise-level vs workspace-level library | **Enterprise (org)**, workspace shown as metadata | 🔴 Migration + auth rework |
| 2 | Explicit "Save to Library" vs automatic | **Explicit** — protects library quality | 🔴 Data cleanup |
| 3 | Reference vs snapshot when reusing | **Snapshot** — referencing is unsafe given the 6 FKs into `persona.id` and the hard delete on exploration removal | 🔴 Fundamental — would corrupt research data |
| 4 | Editing a reused persona / versioning | **Edits stay local; no write-back, no versions in v1** | 🟡 Additive later |
| 5 | Who may publish/archive | **Creator + enterprise_admin** | 🟡 Auth-only change |

Decision 3 is the one I would flag hardest: it is presented as an open question in the brief,
but the current schema effectively forecloses the reference option. Sharing one persona row
across explorations would let interview transcripts, survey responses, and neuro state from
different studies collect on the same record — and would let deleting one exploration destroy
another's personas.

### Risks

- 🔴 **The quota-counter interaction is the one place this can break silently.** If library
  imports set `parent_persona_id`, `_count_primary_personas` skips them and Case 2 generates 4
  extra personas. Keeping that column NULL for imports is the whole fix — but it must be caught
  in review, because the failure is silent and only shows up as too many personas.
- 🟡 **`persona_details` schema drift** (647 keys, 33 stable) means frozen payloads will vary in
  shape. `payload_version` plus a tolerant reader is the mitigation.
- 🟡 **Stale personas.** A persona calibrated 9 months ago against a different RO may not be
  valid today. Surface age; do not silently block.
- 🟢 **Non-enterprise tiers.** The CTA must be hidden for free/tier1 exactly as "Build Manually"
  already is, or those users hit a confusing 403.

---

## 11. What Shipped (2026-08-26)

Implemented end to end. **The shipped design is simpler than §7-§8 proposed** — there is
no `persona_library_item` table and no publish step. Read this section as the authority;
§7-§8 are kept as the design record of what was considered.

### The library is a live view, not a table

Every calibrated persona in the organisation is automatically reusable. Nothing is saved
into a library first. The listing is one join:

```
Persona → Exploration → Workspace  WHERE workspace.organization_id = :org
```

with five filters that keep it useful rather than noisy
([services/persona_library.py::_library_filters](../backend/app/services/persona_library.py)):

| Excluded | Why |
|---|---|
| Other organisations | The isolation boundary |
| Soft-deleted explorations | The study is gone |
| Drafts (`calibration_status == "draft"`) | No calibrated traits worth reusing |
| Personas that are themselves library copies | Otherwise reusing a persona twice makes it appear three times |
| The current exploration's own personas | They are not "reusable elsewhere", they are already here |

**What this buys:** no publish step, no curation burden, no sync problem, and no way for
the library to drift from reality.

**What it costs, honestly:** no archive/hide, no rename, no description. Deleting an
exploration removes its personas from the library (copies already made survive). If hiding
personas is wanted later, the natural addition is a single `is_library_hidden` boolean on
`persona` — still no extra table.

`times_reused` is **derived** (`COUNT` of personas whose `library_source_persona_id` points
at it), not stored — a counter column would drift the moment a copy is deleted.

### Database — 2 nullable columns, no new table

```
persona.library_source_persona_id   VARCHAR   ← the persona this row was copied from
persona.library_imported_at         TIMESTAMP
+ index ix_persona_library_source_persona_id
```

No FK on `library_source_persona_id` on purpose: the origin persona is hard-deleted along
with its exploration, and a constraint would either block that or erase the provenance.

Applied by the existing startup-migration mechanism inside `_repair_persona_schema`
([migrations/startup.py](../backend/app/migrations/startup.py)) — two `ensure_column` calls
and one `ensure_index`. Verified idempotent across consecutive runs.

### Backend

| File | Purpose |
|---|---|
| [services/persona_library.py](../backend/app/services/persona_library.py) | The library query, the card projection, and the copy-into-exploration logic |
| [routers/persona_library.py](../backend/app/routers/persona_library.py) | `GET /workspaces/{ws}/persona-library` and `GET .../{persona_id}` — read-only |
| [schemas/persona_library.py](../backend/app/schemas/persona_library.py) | Import request (ids de-duplicated in the validator) + output shapes |
| [routers/personas.py](../backend/app/routers/personas.py) | `POST .../personas/import-from-library` — placed here so it reuses `_persona_limit_for`, `_count_primary_personas` and `_build_persona_quota` |

Routes are **workspace-scoped**, not org-scoped: the organisation is resolved *from the
workspace*, which is the authoritative link. An ordinary member of an enterprise org
therefore reaches the right library even if their JWT predates the `organization_id` claim,
and authorisation reuses the same workspace-membership check every other persona route
already applies.

**`/auto-generate` was not touched.** Copies leave `parent_persona_id` NULL, so
`_count_primary_personas` counts them and the existing shortfall arithmetic works unchanged
— including the early return that skips the LLM entirely when the library fills every slot.

### Frontend

| File | Purpose |
|---|---|
| [services/personaLibraryService.js](../frontend/src/services/personaLibraryService.js) | API client |
| [hooks/usePersonaLibrary.js](../frontend/src/hooks/usePersonaLibrary.js) | react-query hooks; import invalidates the persona list, the quota, and the library |
| [Persona/personaLibrary/PersonaLibraryPicker.tsx](../frontend/src/components/pages/organization/Workspace/ResearchObjective/Persona/personaLibrary/PersonaLibraryPicker.tsx) | The picker — imports `PersonaBuilder.css` so it is visually identical to the persona grid |
| `AddResearchObjective.tsx` | Third CTA, reusing the existing `.aro-btn-manual` styling — no new button design |

Route: `:objectiveId/persona-library`, inside the existing `ResearchObjectiveLayout`.
After reuse the user lands on `/persona-builder` — the real grid — where the normal flow
continues (generate the rest with Omi, or build manually).

**`PersonaBuilder.tsx` is byte-for-byte unchanged.** Copies are ordinary persona rows, so
`GET /personas/` returns them and the existing grid renders them with no edit at all.

### Verification

| Suite | Result |
|---|---|
| `pytest tests/` | **101 passed** (63 pre-existing + 38 in `tests/test_persona_library.py`) |
| End-to-end against live Postgres | **48/48** — auto-listing, all five filters, cross-workspace reuse, quota counting, derived reuse counter, origin deletion |
| HTTP smoke against a running API | **28/28** — auth, envelopes, status codes, and `GET /personas/` showing the copy |
| `npm run build` | clean |
| Migration idempotency | consecutive runs, no duplicate objects |

### Deliberately not done

- **No badge distinguishing reused personas on the persona grid.** The design was to stay
  exactly as-is. `library_source_persona_id` is on the row if one is wanted later.
- **No archive / rename / description** — see the trade-off above.
- **No write-back or versioning** when a reused persona is edited (Open Question 4) — edits
  stay local to the exploration, as recommended for v1.
- **Any workspace member can reuse** any persona in their organisation. There is no
  publish permission to gate any more, which makes Open Question 5 largely moot.
