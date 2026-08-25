# Neuroscience layer — requirement register

Maps every requirement from the governing documents (specification, work
breakdown, backend clarifications) to its status. Statuses: implemented,
deferred (with owner/reason), or deviation (deliberate, with rationale).

## Implemented

| Requirement | Where |
|---|---|
| Frozen state contract, 3-axis affect space, max two belief components | `app/neuro/types.py` |
| Five tables incl. append-only event log and runtime flag | `app/models/neuro.py`, `repair_neuro_schema` in `app/migrations/startup.py` |
| Runtime flag, default off, no-redeploy flip, admin-gated | `app/neuro/service.py`, `app/routers/neuro.py` |
| Fail-open at every call site; failures recorded as error events | `app/neuro/service.py`, `state_store.record_failure` |
| Derived conversation identity; interview and rebuttal share a thread; artifact and survey use qualified threads | `app/neuro/conversation_key.py` |
| Row-locked read-modify-write per turn, bounded lock wait | `app/neuro/state_store.py` |
| Versioned parameter artifact (emotion coordinates, appraisal weights, thresholds) | `app/neuro/parameters.py` |
| Persona parameter derivation in code (fingerprint, OCEAN fallback, persistence, evidence None/0/counted) | `app/neuro/persona_params.py` |
| Deterministic question tagging, cached per question with tagger version | `app/neuro/question_features.py`, `neuro_question_feature` |
| Appraisal (five judgments), familiarity-scaled observation noise | `app/neuro/appraisal.py` |
| Carry-over via persistence-weighted prediction; gain update; contraction to a repeated-stimulus fixed point | `app/neuro/engine.py`, `tests/test_neuro_dynamics.py` |
| Arbitration: expressed vs felt state, say-do gap by framing and stakes | `app/neuro/arbitration.py` |
| Confidence (multiplicative), abstention threshold, ambivalence excluded | `app/neuro/confidence.py` |
| Effective respondent counts per question | `app/neuro/effective_n.py`, `/neuro/.../effective-n` |
| Deterministic renderer; distinct bimodal and abstained renderings | `app/neuro/renderer.py` |
| Provenance versions on every state; feature vector export, fixed order | `types.Provenance`, `to_feature_vector` |
| Shadow adapters: interview guide runs, interview live replies, rebuttal start and replies, artifact responses, single-persona survey simulation | `app/services/interview.py`, `rebuttal.py`, `persona_response.py`, `survey_simulation_combined.py` via `app/neuro/service.py` |
| Workspace-membership authorization on read endpoints | `app/routers/neuro.py` |
| Read-only trajectory/confidence/abstained/effective-N panel | `frontend/src/components/common/NeuroPanel/` |
| Unit/integration suite plus DB-backed smoke | `tests/`, `scripts/neuro_shadow_smoke.py` |

## Deferred

| Item | Reason / owner |
|---|---|
| Ambivalence trigger (goal-conflict populating the second component) | Spec sequences it last; needs conflict threshold and anchor-pull values from the model owner. Schema, confidence and rendering already handle two components. |
| Validation experiments (affect variance, persona discrimination, carry-over ablation, renderer discriminability) | Release-gate work over recorded shadow data. |
| Trajectory into client reports; provenance into traceability reports; effective-N as live report denominator | Client-visible output changes; gated on rollout. |
| Anti-sycophancy variance handover to arbitration; rendered-state prompt injection | Live-behaviour changes; one coordinated go-live commit. |
| Rollout gates, runbook, dashboards, owner handover | Release gate. |
| Emotion-coordinate and appraisal-weight value sign-off | Model owner; values are versioned data. |
| Licensed-dataset substrate route | Pending licence decision. |
| Interview re-run vs advanced-state semantics; batched interview transaction | Product decision pending (see decision memo); event log unaffected either way. |
| Group (multi-persona) rebuttal and population-level survey recording | Per-persona state only in v1; group-level representation undesigned. |
| SSM guard in `app/parameters.py` (smoke on a clean checkout still requires credentials or a local stub) | Shared runtime file; platform owner's call. Tests are isolated via `tests/conftest.py`. |

## Deviations

| Decision | Rationale |
|---|---|
| Persona affect parameters derived at computation time rather than written into persona records at generation | Works for all existing personas without regeneration or migration; can later be persisted without interface change. |
| Rule-based question tagger rather than model-based | Deterministic and free; cache/version interface unchanged if swapped. |
| Schema via the repository's startup-migration mechanism rather than Alembic | This branch's base predates the Alembic cutover; the repair step is idempotent and registry-ordered. |
