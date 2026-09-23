# Enriquecimiento del plan con el ecosistema Gentle-AI

- Objetivo: incorporar al plan de LuxeBorealCRM el proceso ejecutable de Gentle-AI (commits por
  unidad de trabajo, TDD estricto, review, slices de PR, skill-registry, CodeGraph, Engram) y
  resolver las contradicciones detectadas en el análisis.
- Origen: análisis aprobado por el usuario el 2026-09-22
  (`~/.claude/plans/analiza-luxeborealcrm-y-chatluxecrm-vast-cat.md`).
- Alcance autorizado: solo documentación de este repo. Sin código. Sin commits (pendiente de
  autorización del usuario).
- TDD: no aplica (cambios de documentación); verificación por relectura estructural y grep.

## Tareas

- [x] T1 — `CLAUDE.md`: commits, idioma de artefactos, mapeo fase↔SDD/ODD, TDD, review, CodeGraph/Engram. Ruta: delegado (writer, 2+ archivos no triviales)
- [x] T2 — `luxeboreal-fases/SKILL.md` + `_plantilla.md`: slices/PRs, RED-GREEN-REFACTOR, review requerida, evidencia de commit. Ruta: delegado
- [x] T3 — `docs/fases/README.md`: CI en 00, fixtures en 04, golden set en 07, shadow mode en 10, prerrequisitos externos. Ruta: delegado
- [x] T4 — `PREGUNTAS_ABIERTAS.md`: P15 (R14 vs payload del inbox), P16 (aceptar ADR pendientes). Ruta: delegado
- [x] T5 — `.gitignore` con `.atl/` + `.atl/skill-registry.md`. Ruta: delegado
- [x] T6 — `SPEC.md` R14 + `MODELO_DATOS.md` §7 según la respuesta a P15 (payload redactado). Ruta: inline
- [ ] T7 — Commit inicial. Bloqueada: autorización del usuario

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
