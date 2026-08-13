# Staging cutover runbook

Bringing the staging database under Alembic control without changing its schema
or losing a row.

**Estimated time:** 60–90 minutes, most of it verification.
**Rollback:** available at every step until Step 7.

---

## The one thing that must not go wrong

Steps 1–5 are **read-only** on staging. Both `schema_inventory.py` and
`generate_baseline.py` open their conn ection with
`set_session(readonly=True)` — PostgreSQL itself rejects any write they attempt.

The first write is **Step 6 (`alembic stamp`)**, and it inserts exactly one row
into one new table. Its complete inverse is `DELETE FROM alembic_version;`.

So: do not skip ahead to Step 6. The verification is the whole point.

---

## Order matters

Staging must be **stamped before the new code deploys**. After the cutover CI
runs the migration Job on every deploy; if staging is not stamped, that Job
tries to run `0001_baseline` against the populated database, hits
`DuplicateTable`, and blocks the deploy. That failure is safe — transactional
DDL rolls it back completely, as verified locally — but it is an avoidable
broken deploy.

```
Step 0  backup
Step 1  reach the staging database          ─┐
Step 2  snapshot staging                     │  read-only,
Step 3  build scratch DB from baseline       │  zero risk
Step 4  compare  ── DECISION POINT ──        │
Step 5  (only if mismatch) regenerate       ─┘
Step 6  stamp                                ← first write, one row
Step 7  upgrade head                         ← applies 0002
Step 8  prove nothing was lost
Step 9  deploy the new image
Step 10 prove the CI gate can fail
```

---

## Step 0 — Back up, and test the restore

A backup you have not restored is a hope, not a backup.

```bash
pg_dump -Fc "$STAGING_URL" > staging-$(date +%Y%m%d-%H%M).dump

createdb restore_test
pg_restore -d restore_test staging-*.dump
psql restore_test -tAc "SELECT count(*) FROM \"user\""   # sanity check
dropdb restore_test
```

**Gate:** restore completes and the row count looks right.

---

## Step 1 — Reach the staging database

Staging RDS is inside the VPC, so run from inside the cluster. The **currently
deployed** image does not yet contain the new scripts, so copy them in.

```bash
NS=syntera-mvp

kubectl run schema-check -n $NS --restart=Never \
  --image=175337843263.dkr.ecr.ap-south-1.amazonaws.com/synth-backend \
  --overrides='{"spec":{"serviceAccountName":"ssm-reader","containers":[{
    "name":"schema-check","image":"175337843263.dkr.ecr.ap-south-1.amazonaws.com/synth-backend",
    "command":["sleep","3600"],
    "env":[{"name":"AWS_REGION","value":"ap-south-1"},
           {"name":"SSM_PATH","value":"/app/staging/"}]}]}}'

kubectl wait --for=condition=ready pod/schema-check -n $NS --timeout=120s

kubectl cp backend/scripts/schema_inventory.py   $NS/schema-check:/app/scripts/
kubectl cp backend/scripts/generate_baseline.py  $NS/schema-check:/app/scripts/
kubectl cp backend/app/parameters.py             $NS/schema-check:/app/app/
```

`parameters.py` is copied too because the deployed image still has the version
that hardcodes `/app/staging/`. The new one reads `SSM_PATH` — which is set to
the same value here, so this pod reads staging either way. Copying it just keeps
the pod consistent with what you are about to ship.

> **If `kubectl run` is not available to you**, the alternative is a
> `port-forward` through any pod that can reach RDS, then run the scripts from
> your laptop with an explicit `--url`. Everything after this step is identical.

**Gate:** pod is `Running`.

---

## Step 2 — Snapshot staging (read-only)

```bash
kubectl exec -n $NS schema-check -- \
  python scripts/schema_inventory.py snapshot --rows --out - \
  > staging-before.json

head -c 300 staging-before.json    # confirm it is JSON, not an error
```

Omitting `--url` makes the script resolve `DATABASE_URL` through `app.config` —
the same SSM path the app and the migration Job use, so there is no chance of
inspecting one database while migrating another.

Record the reported numbers. For reference, local is:
`tables=51 columns=630 indexes=190 constraints=508`.

**Staging will probably differ, and that is expected** — its deployment history
is not local's.

**Gate:** valid JSON, table count is plausible.

---

## Step 3 — Build a scratch database from the baseline

Locally, or anywhere with a throwaway PostgreSQL:

```bash
cd backend
createdb parity_check
python -m alembic -x db_url="postgresql://user:pw@localhost:5432/parity_check" \
  upgrade head
```

Use the **same PostgreSQL major version as staging**. Check it with
`SELECT version()` — the snapshot from Step 2 records it under
`server_version`. Local dev is on 18.1; `docker-compose.yml` pins 15. A version
mismatch produces cosmetic rendering differences that muddy the comparison.

**Gate:** `upgrade head` exits 0.

---

## Step 4 — Compare · DECISION POINT

```bash
python scripts/schema_inventory.py compare \
    --baseline staging-before.json \
    --candidate-url "postgresql://user:pw@localhost:5432/parity_check"
```

Read the output by category:

| Category | Meaning | Action |
|---|---|---|
| **LOSSES** | staging has an object the baseline does not create | **Stop.** Regenerate — Step 5. Stamping now would orphan real objects. |
| **CHANGES** | same object, different definition | **Stop.** Regenerate — Step 5. |
| **ADDITIONS** | baseline creates something staging lacks | Investigate. Usually means staging is behind; decide whether a revision should add it. |
| **RENDERING** | textually different, semantically identical | Fine. Expect `idx_sync_source_scrape_url_retry`. |

- **PASS** → go to Step 6.
- **FAIL** → Step 5.

Expect FAIL to be reasonably likely. The baseline was generated from local, and
`app/migrations/startup.py` plus `SQLModel.create_all` produce
history-dependent schemas. That is exactly why this check exists.

---

## Step 5 — Regenerate the baseline from staging (only if Step 4 failed)

Staging is the reference environment production will mirror, so it — not local —
should define the baseline.

```bash
kubectl exec -n $NS schema-check -- \
  python scripts/generate_baseline.py --out - \
  > alembic/versions/0001_baseline.py
```

> If your `generate_baseline.py` build does not support `--out -`, write to
> `/tmp/0001_baseline.py` inside the pod and `kubectl cp` it back out.

Then:

1. **Re-run Steps 3 and 4** against the new baseline. Repeat until PASS.
2. Re-run the local test suite: `pytest tests/test_migrations.py -v`.
   `EXPECTED_TABLE_COUNT` and `UNMODELLED_TABLES` in
   `tests/test_migrations.py` are hardcoded from local — update them to
   staging's real numbers, since staging is now the reference.
3. Check whether the `NOT_VALID_FOREIGN_KEYS` list in `0002_validate_fks.py`
   matches staging:

```bash
kubectl exec -n $NS schema-check -- python -c "
import psycopg2, re
from app.config import settings
url = re.sub(r'\+\w+://', '://', settings.DATABASE_URL)
c = psycopg2.connect(url); cur = c.cursor()
cur.execute(\"SELECT conrelid::regclass::text, conname FROM pg_constraint WHERE contype='f' AND NOT convalidated ORDER BY 1,2\")
[print(r) for r in cur.fetchall()]"
```

The revision skips constraints that are already valid or absent, so extras are
harmless — but anything on staging that is **missing** from the list stays
unvalidated. Add it.

4. **Do not hand-edit the generated baseline.** If it is wrong, regenerate.

**Gate:** Step 4 reports PASS, and local tests pass against the new baseline.

---

## Step 6 — Stamp · FIRST WRITE

```bash
kubectl exec -n $NS schema-check -- python -m alembic stamp 0001_baseline
kubectl exec -n $NS schema-check -- python -m alembic current
```

Expected: `0001_baseline`.

This creates `alembic_version` and inserts one row. **It executes no DDL.**

**Rollback:** `DELETE FROM alembic_version;`

**Gate:** `alembic current` returns `0001_baseline`.

---

## Step 7 — Apply everything after the baseline

```bash
kubectl exec -n $NS schema-check -- python -m alembic upgrade head
kubectl exec -n $NS schema-check -- python -m alembic current
```

Expected: `0002_validate_fks (head)`.

Only `0002` runs. It validates foreign keys that were created `NOT VALID` and
never validated. `VALIDATE CONSTRAINT` takes `SHARE UPDATE EXCLUSIVE`, which
does **not** block reads or writes.

**If validation fails**, that is a real finding, not a migration bug: rows exist
that violate a foreign key. Do not weaken the constraint. Find them:

```sql
SELECT child.* FROM <child_table> child
LEFT JOIN <parent_table> parent ON parent.id = child.<fk_column>
WHERE child.<fk_column> IS NOT NULL AND parent.id IS NULL;
```

Locally this succeeded, which proved there were no orphaned rows. Staging has
more history, so it is worth watching.

**Gate:** `alembic current` returns head.

---

## Step 8 — Prove nothing was lost

```bash
kubectl exec -n $NS schema-check -- \
  python scripts/schema_inventory.py snapshot --rows --out - \
  > staging-after.json

python scripts/schema_inventory.py compare \
    --baseline staging-before.json \
    --candidate staging-after.json \
    --rows-must-not-shrink
```

**Expected output:** `CHANGES` listing exactly the foreign keys `0002`
validated — `NOT VALID → validated: True` — and **nothing else**. No `LOSSES`.
No row-count change.

The command exits 1 because constraints changed. That is correct: it is
reporting the migration doing its job. What matters is that the list contains
only the intended changes.

**Gate:** every reported change is a foreign-key validation. Total row count
identical.

---

## Step 9 — Deploy the new image

```bash
kubectl delete pod schema-check -n $NS      # clean up first
```

Merge and let `staging.yml` run. It will now:

1. build and push the image
2. create the migration Job and **wait** for it
3. update the Deployment only if the Job succeeded

The Job runs `alembic upgrade head`, finds staging already at head, and exits 0
in under a second.

Watch:

```bash
kubectl get jobs -n $NS -w
kubectl logs -n $NS job/<name>
kubectl rollout status deploy/synth-backend -n $NS
```

**Gate:** Job succeeds, rollout completes, `/health` green on all replicas.

**Rollback:** `kubectl rollout undo deploy/synth-backend -n $NS`. The schema is
unchanged from before the deploy, so the old image runs against it fine.

---

## Step 10 — Prove the gate can actually fail

Do not skip this. Until you have watched it go red, you do not have a gate — you
have an assumption. The previous initContainer *looked* like protection for
months while exiting 0 on every failure.

```bash
git checkout -b test/prove-migration-gate
```

Add a deliberately broken revision:

```python
# alembic/versions/9999_deliberate_failure.py
revision = "9999_fail"
down_revision = "0002_validate_fks"

def upgrade() -> None:
    op.execute("SELECT 1/0")

def downgrade() -> None:
    pass
```

Push to staging.

**Expected:** the "Run database migrations" step fails, `kubectl set image`
never runs, and the previous version keeps serving.

Then delete the revision and confirm the next deploy is green.

**Gate:** you personally watched CI go red and the rollout not happen.

---

## After the cutover

- `RUN_STARTUP_MIGRATIONS` stays `false`. Staging logs should no longer contain
  `"Startup migrations: advisory lock acquired"`.
- All schema change now goes through `alembic/versions/`. Reject any PR that
  edits `app/migrations/startup.py`.
- After ~2 weeks and at least two real schema changes shipped as revisions,
  delete `app/migrations/startup.py`, the flag, and the call in `app/main.py`.
- Consider revision `0003` to reconcile the `json` / `jsonb` drift, then flip
  `test_no_model_drift` from `xfail` to a hard assertion.

## Before production

Production is a different procedure — an empty database, so `upgrade head` runs
the baseline in full rather than being stamped. Prerequisites:

- [ ] Use the committed overlay `k8sdeployment/migrate-job.production.yaml`,
      which sets `SSM_PATH=/app/platform/`. Production's parameter tree is
      `/app/platform/`, **not** `/app/production/`.
- [ ] The `/app/platform/` tree is actually populated — at minimum
      `DATABASE_URL`, `JWT_SECRET`, `SUPERADMIN_*` and `MAIL_*`
- [ ] **Verified by hand** that the resolved `DATABASE_URL` host is *not* the
      staging host, by reading the `migrations: target=` line. Do not infer
      this from a green pipeline — this was a real defect in the manifests.
- [ ] Pre-flight: `SELECT count(*) FROM information_schema.tables WHERE
      table_schema='public'` returns 0
- [ ] `RUN_STARTUP_MIGRATIONS` false from the very first pod — production's
      schema must come entirely from the revision chain
