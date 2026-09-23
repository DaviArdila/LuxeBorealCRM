# Enriquecimiento del plan con el ecosistema Gentle-AI

- Objetivo: incorporar al plan de LuxeBorealCRM el proceso ejecutable de Gentle-AI (commits por
  unidad de trabajo, TDD estricto, review, slices de PR, skill-registry, CodeGraph, Engram) y
  resolver las contradicciones detectadas en el análisis.
- Origen: análisis aprobado por el usuario el 2026-09-22
  (`~/.claude/plans/analiza-luxeborealcrm-y-chatluxecrm-vast-cat.md`).
- Alcance autorizado: solo documentación de este repo. Sin código. Commits autorizados el 2026-09-23
  (foto en `main` + rama `chore/adopt-openspec`; el merge lo hace el usuario).
- TDD: no aplica (cambios de documentación); verificación por relectura estructural y grep.

## Tareas

- [x] T1 — `CLAUDE.md`: commits, idioma de artefactos, mapeo fase↔SDD/ODD, TDD, review, CodeGraph/Engram. Ruta: delegado (writer, 2+ archivos no triviales)
- [x] T2 — `luxeboreal-fases/SKILL.md` + `_plantilla.md`: slices/PRs, RED-GREEN-REFACTOR, review requerida, evidencia de commit. Ruta: delegado
- [x] T3 — `docs/fases/README.md`: CI en 00, fixtures en 04, golden set en 07, shadow mode en 10, prerrequisitos externos. Ruta: delegado
- [x] T4 — `PREGUNTAS_ABIERTAS.md`: P15 (R14 vs payload del inbox), P16 (aceptar ADR pendientes). Ruta: delegado
- [x] T5 — `.gitignore` con `.atl/` + `.atl/skill-registry.md`. Ruta: delegado
- [x] T6 — `SPEC.md` R14 + `MODELO_DATOS.md` §7 según la respuesta a P15 (payload redactado). Ruta: inline
- [x] T7 — Commit inicial en `main`. Ruta: inline
- [x] T8 — Engram: memorias reubicadas al proyecto `luxeborealcrm`. Ruta: inline
- [x] T9 — CodeGraph indexado en `../ChatLuxeCRM`. Ruta: inline
- [x] T10 — `sdd-init` en modo hybrid (`openspec/config.yaml`). Ruta: subagente sdd-init
- [x] T11 — ADR 0001/0003/0004/0005/0007 aceptados; 0004 con ajuste P15. Ruta: inline
- [x] T12 — R1-R16 → `openspec/specs/<dominio>/`; SPEC.md como índice. Ruta: delegado (writer)
- [x] T13 — Fases sobre el ciclo `sdd-*`; retirar `_plantilla.md`; skill y CLAUDE.md. Ruta: delegado (writer)
- [x] T14 — Preguntas: P12 y P16 resueltas, P13 y P14 con camino acordado. Ruta: inline

## Progreso y evidencia

- T1: `CLAUDE.md` (regla de commits reemplazada, sección "Flujo de trabajo (ecosistema Gentle-AI)"
  añadida, nota de `odd/tasks/` en "Orden de lectura"); `.claude/skills/luxeboreal-arquitectura/SKILL.md`
  (§10 ítem 8 actualizado consistente con `CLAUDE.md`).
- T2: `docs/fases/_plantilla.md` (campos `Rama` y `Review requerida` en cabecera; §7 con evidencia
  de test/commit; nueva §8 "Entrega (slices de PR)"; §11 Registro de cierre con commits/PRs y
  resultado de review; secciones renumeradas 8→11); `.claude/skills/luxeboreal-fases/SKILL.md` (§1
  paso 4 con criterios de slices/review requerida; §4 con rama por fase, RED primero, commit por
  tarea; §5 con judgment-day condicional al cerrar).
- T3: `docs/fases/README.md` (fila 00 con CI; fila 04 con fixtures de contrato; fila 07 con set
  dorado de evals; fila 10 con modo sombra; regla 6 de judgment-day en "Reglas de las fases";
  nueva sección "Prerrequisitos externos").
- T4: `docs/PREGUNTAS_ABIERTAS.md` (filas P15 y P16 añadidas a la tabla Abiertas).
- T5: `.gitignore` (entrada `.atl/` con comentario); `.atl/skill-registry.md` creado (índice de
  skills del proyecto, referencia de `ChatLuxeCRM` y skills de usuario, fecha 2026-09-22).
- T6: P15 resuelta por el usuario (payload redactado). `SPEC.md` R14, `MODELO_DATOS.md` §5 (`lead.resumen`) y §7
  (`evento_entrante.payload`), `docs/PREGUNTAS_ABIERTAS.md` (P15 movida a Resueltas).
- T7: `f3fcbc6 docs: add initial planning documents` en `main`; rama `chore/adopt-openspec`.
- T8: `rescue-ownership` no aplica a memorias con dueño; se recrearon como #3 y #4 en
  `luxeborealcrm` y las originales #1 y #2 quedaron con borrado suave (reversible).
- T9: `gentle-ai codegraph init` → 148 archivos TS; `codegraph status` "Index is up to date";
  `.codegraph/` ignorado por su propio `.gitignore`.
- T10: `4a80e33 chore(sdd): initialize openspec in hybrid mode`. `strict_tdd: false` hasta que la
  Fase 00 cree el runner (regla de Gentle-AI: sin runner real no se activa). Preflight SDD:
  interactive / hybrid / ask-on-risk.
- T11: `1865c12 docs(adr): accept pending ADRs 0001 0003 0004 0005 0007`.
- T14: `docs/PREGUNTAS_ABIERTAS.md` (decisiones D10-D12 del 2026-09-23).
- T12: `28c5829 docs(spec): move invariants to openspec specs` — 7 specs por dominio; cada R1-R16
  aparece en exactamente una spec (verificado con grep).
- T13: `00e9a52 docs(process): adopt sdd cycle for phases` — `_plantilla.md` retirada; su registro de
  cierre pasó a `openspec/config.yaml` en `0466785` (que además corrigió YAML inválido de sdd-init).
- Siguiente paso: el usuario revisa la rama `chore/adopt-openspec` (aprueba SPEC 0.3 e inventario) y
  hace el merge; luego `sdd-new fase-00-fundaciones`.
