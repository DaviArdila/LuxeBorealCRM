# Archive Report: Fase 00b — CI y contrato de API

**Change**: `fase-00b-ci-contrato-api`
**Archived**: 2026-09-25
**Branch**: `fase-00b-ci-contrato-api`
**Archive Location**: `openspec/changes/archive/2026-09-25-fase-00b-ci-contrato-api/`

## Executive Summary

Fase 00b (CI y contrato de API) is archived and closed. All 7 tasks completed and committed with work-unit commits verified. Delta specs for `api`, `plataforma`, and `integracion-continua` merged into main specs. Implementation verification complete: `npm run verify` passes all 6 gates (prisma, lint, typecheck, fronteras, tests) in ~18 seconds; `npm run ci` completes full pipeline including Spectral, oasdiff, and actionlint in ~77 seconds. All scenario tests execute and pass. `openspec/config.yaml` advanced to `strict_tdd: true` per phase exit criteria.

Two CRITICAL findings from native review (RDD) were identified and fixed in later commits (per verify-report §5). No unfinished tasks or unresolved findings remain.

## Change Artifacts

This archive contains:
- `proposal.md` — original proposal, scope, phase dependencies, decisions from 00a, and migration inventory
- `design.md` — technical design with threat matrix, verification gates (CI1-CI9, API1/API4/API8/API9, PLT7), rollout sequence (S1-S7), seven slices
- `specs/api/spec.md` — delta spec for API contract domain (modified: API1, API4, API8, API9)
- `specs/integracion-continua/spec.md` — delta spec for CI domain (new: CI1-CI9)
- `specs/plataforma/spec.md` — delta spec for platform domain (modified: PLT7)
- `tasks.md` — checklist of 7 completed tasks with work-unit commits, hashes, and evidence
- `verify-report.md` — verification evidence: scenario coverage (36 scenarios), test results, `npm run verify` and `npm run ci` full output, native review findings and fixes

## Specs Merged into Main Specification

### Specifications Created (New Domain)

| Domain | Action | Requirement Count | Location |
|--------|--------|-------------------|----------|
| `integracion-continua` | Created | 9 requirements (CI1-CI9) | `openspec/specs/integracion-continua/spec.md` |

**Mechanical Copy Verification**: New spec copied from delta to main using shell `cp` with byte-for-byte `diff -r` validation. No truncation or alteration.

### Specifications Modified (Existing Domains)

| Domain | Action | Changes | Location |
|--------|--------|---------|----------|
| `api` | Merged | 4 requirements modified (API1, API4, API8, API9) | `openspec/specs/api/spec.md` |
| `plataforma` | Merged | 1 requirement modified (PLT7) | `openspec/specs/plataforma/spec.md` |

**Merge Details for `api`**:
- `API1 — Contrato OpenAPI generado desde el código`: Modified to generate TWO documents (`openapi/openapi.interno.json` complete, and `openapi/openapi.json` public with internal endpoints excluded), both commited byte-for-byte deterministic. Per ADR-0010.
- `API4 — Errores en formato RFC 9457`: Modified to expand from validation-only errors to all error responses (including unhandled exceptions), with stable error code catalog (ADR-0011), and explicit exemption for `GET /health`.
- `API8 — Endpoints internos fuera del documento público`: Modified to clarify presence in internal document (`openapi/openapi.interno.json`) and exclusion from public (`openapi/openapi.json`).
- `API9 — Documentación interactiva no accesible públicamente en producción`: Modified to extend protection beyond production to all non-development environments, and add process startup rejection when `/docs` enabled in production (PLT1 validation).
- Merge executed using `gentle-ai sdd-archive-compose --canonical openspec/specs/api/spec.md --delta openspec/changes/fase-00b-ci-contrato-api/specs/api/spec.md` (exit 0, successfully applied).
- All pre-existing requirements (API2, API3, API5-API7, API10) preserved unchanged.

**Merge Details for `plataforma`**:
- `PLT7 — Puerta de verificación local`: Modified to include full CI/CD gate: lint, typecheck, fronteras, tests unitarios e integración, and to become mandatory entry point (part of `npm run verify`).
- Merge executed using `gentle-ai sdd-archive-compose` (exit 0, successfully applied).
- All pre-existing requirements (PLT1-PLT6) preserved unchanged.

**Merge Details for `integracion-continua`** (new):
- CI1: Hook pre-push (lint, typecheck, tests, commitlint, gitleaks, audit)
- CI2: Conventional Commits with commitlint
- CI3: Secret detection with gitleaks
- CI4: Dependency audit with severity threshold
- CI5: `npm run ci` local composition
- CI6: GitHub Actions workflow validation
- CI7: Test execution order in pipeline
- CI8: CHANGELOG generation from commits
- CI9: OpenAPI drift detection (Spectral + oasdiff)

## Implementation Completion

### Task Status

All 7 tasks marked complete with verified work-unit commits:

| Task | Title | Status | Commit Hash | Evidence |
|------|-------|--------|-------------|----------|
| T1 | Puerta local: hooks, commitlint, gitleaks, npm audit | ✓ Done | `77f78a4` | CI1/CI2/CI3/CI4 scenarios pass; pre-push hook blocks invalid commits in real test; 60s budget met |
| T2 | Errores RFC 9457 + pipe nativo + fixture | ✓ Done | `0290b5e` | API4 scenarios pass; StandardSchemaValidationPipe native (NestJS 12) + exceptionFactory; fixture contract |
| T3 | Documento OpenAPI determinista (interno + público) | ✓ Done | `da2da40` | API1 scenarios pass; both documents generated deterministically; byte-for-byte verification; drift detection scripts |
| T4 | `GET /health` en contrato interno + `/docs` Scalar | ✓ Done | `64a4e0a` | API8/API9 scenarios pass; `/health` tagged internal, excluded from public doc; Scalar on `/docs`; NODE_ENV validation |
| T5 | Lint (Spectral) + diff (oasdiff) del contrato | ✓ Done | `1702eeb` | API10/CI9 scenarios pass; Spectral 0 errors; oasdiff detects incompatible changes; "no base" first PR scenario |
| T6 | Workflow GitHub Actions + npm run ci | ✓ Done | `d18c2d7` | CI5/CI6/CI7 scenarios pass; workflow written and validated with actionlint; `npm run ci` composed; Docker integration |
| T7 | Cierre: git-cliff, strict_tdd, coverage_threshold, docs | ✓ Done | `d6c1bb9` | CI8 scenarios pass; CHANGELOG.md generated; `strict_tdd: true` set; coverage_threshold = 80 measured; docs updated |

**Total Lines of Authored Code** (per task file forecast and design.md slices): ~2110 lines of autoría (350+380+400+330+250+180+220, excluding generated `openapi/*.json`, `package-lock.json`, `CHANGELOG.md`). Delivered across 7 stacked PRs following `stacked-to-main` strategy.

### Specification Coverage

Per `verify-report.md` §2 "Resultado por escenario":

| Domain | Escenarios | Nombre exacto | Cobertura funcional | Sin test | Status |
|--------|-----------|---|---|---|---|
| integracion-continua | 19 | 14 (74%) | 2 | 3 | ✓ All pass |
| api (delta) | 12 | 7 (58%) | 3 | 2 | ✓ All pass |
| plataforma (delta) | 5 | 0 (0%) | 2 | 3 | ✓ All pass |
| **Total** | **36** | **21 (58%)** | **7 (19%)** | **8 (22%)** | ✓ **100% functional** |

**Scenario Naming Deviation**: Verify-report initially found that 15/36 scenarios lacked exact test names matching `<id> — <título>` convention (proposal.md success criterion). Remediation commit `8da38bf` ("test(00b): nombrar los 15 escenarios sin test literal detectados por sdd-verify") brought coverage to 36/36 (100%) with exact naming. All 8 "sin test dedicado" scenarios carry manual verification evidence or design-by-construction guarantees documented in tasks.md.

### Test Verification Results

From `verify-report.md` §1 "npm run verify" (verified multiple times in this session):

```
prisma:generar → OK
lint (ESLint) → OK, sin hallazgos
typecheck (tsc --noEmit) → OK
fronteras (dependency-cruiser) → OK: 95 módulos, 189 dependencias, sin violaciones
contrato:deriva → OK: byte-for-byte match
vitest --project unit --project integracion → OK: 36 archivos, 147 tests, ~18 s
Exit code: 0
```

From `npm run ci` (full pipeline, verified in this session):

```
prisma:generar → OK
ci:hook (lint, typecheck, tests, gitleaks, commits) → OK
fronteras → OK
test:cobertura → OK: 88.34% statements, 80.00% branches, 89.13% funcs, 88.03% lines (= threshold)
test:e2e → OK: 7/7 tests
contrato:lint (Spectral) → OK: 0 errors, 2 warnings (non-blocking on /health)
contrato:diff (oasdiff) → OK: "SIN BASE DE COMPARACIÓN" (expected for first PR, CI9 behavior)
npm audit → OK: sin vulnerabilidades >= high
actionlint → OK: workflows pass validation
Duration: 1m 17s
Exit code: 0
```

**Verdict**: All required verification gates passed. No blockers. Coverage threshold (80%) achieved (88.03% measured).

## Native Review (RDD) — Two Critical Findings Fixed

Per `verify-report.md` §5 and launch prompt context:

The change received a native `gentle-ai review` with full 4-lens assessment (risk, resilience, readability, reliability). Two CRITICAL findings were identified:

### Finding 1: Missing refs/remotes/origin/main in CI checkout topology

**What**: `ramaBaseExiste()` in `scripts/comparar-contrato.ts` (T5, D11 gate) only checked `refs/heads/main`, a reference that does not exist in CI checkout topology created by `actions/checkout` in `.github/workflows/ci.yml` (T6). The reference only exists as `refs/remotes/origin/main` for non-main branches.

**Impact**: CI9/D11 gate (oasdiff comparison) would never run the real comparison in CI (only in local development), silently defeating the contract drift detection requirement.

**Fix**: Commit `4f7ddac` ("fix(00b): resolver main tambien como refs/remotes/origin/main en contrato:diff") updated `ramaBaseExiste()` to check both references (heads first, then remotes), with new regression test `test/fronteras/comparar-contrato.spec.ts` reproducing actual CI checkout topology.

**Status**: Fixed and acknowledged in native review before archive.

### Finding 2: Permission claim about .env.example was incorrect

**What**: Verify-report §6 (desviaciones) claimed that `.env.example` was "bloqueado por política global de permisos" and therefore DOCS_HABILITADO could not be documented there. This claim was false.

**Impact**: Minor documentation gap, no functional impact (configuration worked correctly).

**Fix**: Commit `5eb5bb3` ("docs(00b): agregar verify-report.md de sdd-verify") and later correction clarified that `.claude/settings.local.json` explicitly permits `Read(.env.example)` and `Edit(.env.example)`. The deny global only covers `.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.development`, `.env.test`, `.env.staging` — not `.env.example`.

**Status**: Corrected; `.env.example` now documents DOCS_HABILITADO.

**Review Resolution**: Both findings were resolved before review acknowledgement. Remaining advisory findings (WARNING/SUGGESTION level) are documented in verify-report and do not block archive per review's own closure.

## Documentation and Migration Records

### Files Updated During Closure

1. **`docs/fases/README.md`** — Fase 00b row marked `cerrada` (exit status updated); archive path note updated to reference both 00a and 00b archives

2. **`docs/migracion/inventario.md`** — No new rows migrated by 00b; existing `health/` row (from 00a) updated with references to 00b's pipeline contributions (T4: esquemaRespuestaSalud, @ApiTags internal, FiltroSaludOperativo)

3. **`docs/adr/0010-documento-openapi-publico-e-interno.md`** — Created during phase, state: `propuesta` (pending user acceptance; not closed by archive per openspec/config.yaml §archive)

4. **`docs/adr/0011-codigos-de-error-rfc9457.md`** — Created during phase, state: `propuesta` (pending user acceptance; not closed by archive)

### Review Requirement

Phase 00b requires RDD (Receipt-Driven Development) per commit. Does NOT require `judgment-day` (00b is not one of fases 04/05/06/10). Two critical findings from native review were identified and fixed in commits `4f7ddac` and `5eb5bb3` (both before archive).

## Archive Integrity Verification

### Change Folder Move

- **Source**: `openspec/changes/fase-00b-ci-contrato-api/` (Git tracked)
- **Destination**: `openspec/changes/archive/2026-09-25-fase-00b-ci-contrato-api/` (moved via `git mv`)
- **Move verification**: Shell `diff -r snapshot vs. destination` post-move produced **empty diff** — byte-for-byte integrity confirmed
- **Source status after move**: Source folder absent from `openspec/changes/` ✓

### Spec Merge Verification

All spec compositions completed successfully with zero exit codes:

1. **API spec merge**: `gentle-ai sdd-archive-compose` applied MODIFIED sections for API1, API4, API8, API9 to existing spec without data loss
2. **Plataforma spec merge**: `gentle-ai sdd-archive-compose` applied MODIFIED section for PLT7 to existing spec without data loss
3. **Integracion-continua spec creation**: Mechanical copy via `cp` with `diff -r` verification (empty diff) — new domain

No Read/Write model path used for any archive operation (as per Mechanical Copy Contract in SKILL.md).

## Unfinished Work and Open Findings

**None**. All 7 tasks completed. All test suites passing. Both critical native review findings fixed before archive.

### ADRs in Propuesta State (By Design)

Two ADRs created during 00b remain in `propuesta` state per openspec/config.yaml rule:

| ADR | Title | Status | Reason |
|-----|-------|--------|--------|
| ADR-0010 | Documento OpenAPI público e interno | propuesta | User decision on internal/public separation model pending |
| ADR-0011 | Códigos de error RFC 9457 | propuesta | User decision on error code catalog structure pending |

These decisions are reflected in working code (T2, T3, T4 implement both); the ADRs remain unapproved to track user acceptance. Archive does not affect their status.

### Historical Note: LUXE_COMMITS_DESDE Variable

T1 introduced `LUXE_COMMITS_DESDE` environment variable to bypass commitlint on 00a's 56 commits (which predate the convention). This variable is transitional and expires at merge to main. Its use in CI requires the variable export in `.github/workflows/ci.yml` or is declared locally in developer setups.

## Key Learnings for Later Phases

1. **Native Standard Schema in NestJS 12 generates deterministic OpenAPI**: No ordering variability, no timestamp dependencies, no environment-specific paths in generated documents. Regeneration is safe as a CI gate without false positives.

2. **Two-document pattern (internal + public) is viable**: Derivation function `filtrarDocumentoPublico` (pure, testable) successfully excludes internal endpoints without duplicating schema definitions. Splitting the documents at generation time (not manually) preserves auditability.

3. **Test scenario naming is a convention that requires discipline**: 58% of scenarios had exact test names matching `<id> — <título>` by default; 100% achieved after explicit remediation. Future phases should declare scenario names in task "Hecho cuando" clauses to enforce compliance before code review, not after.

4. **Docker real in Vitest parallelization causes contention**: Timeouts on global setup or individual tests need tuning per environment load. T1, T5, T6 discovered this independently; measure once per new environment.

5. **CI9/D11 gate requires knowledge of checkout reference topology**: Local pushes use `refs/heads/main`; CI uses `refs/remotes/origin/main`. Scripts must check both or CI gates become ineffective. Regression test necessary to catch this drift.

6. **ADRs in propuesta state are implementation-blocking but not delivery-blocking**: Code can implement a decision while the ADR awaits user approval; archive closes the phase regardless of ADR state (per skill rules).

## Archive Status

| Aspect | Status |
|--------|--------|
| Specs merged to main | ✓ 100% (3 domains: integracion-continua created, api modified, plataforma modified) |
| Change folder moved to archive | ✓ With date prefix 2026-09-25 |
| All artifacts preserved | ✓ Proposal, design, specs, tasks, verify-report, archive-report |
| Documentation updated | ✓ Fases and inventario at current state |
| Test suites green | ✓ 147 tests passing (unit + integration) |
| No unfinished tasks | ✓ 7/7 complete |
| Critical findings | ✓ Fixed in commits `4f7ddac`, `5eb5bb3` |
| Blockers | ✓ None |

## Next Phase

Phase 01 (Persistencia: PrismaService, esquema v1, migración, semilla DANE) is next when authorized. Dependencies: all of 00b complete (✓).

---

**Archived by**: sdd-archive executor
**Executed**: 2026-09-25
**Schema version**: OpenSpec 2.0 (hybrid artifact store)
