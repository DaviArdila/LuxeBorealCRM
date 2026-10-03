# Tasks: fix-fallas-criticas-evals-agente

- Modo TDD: **estricto** (fuente: CLAUDE.md del proyecto) · Runner: Vitest (`npm test`,
  `npm run test:integracion`, `npm run evals`).
- El detalle por tarea, con commits y revisión, vive en `odd/tasks/fallas-criticas-evals-agente.md`.

## Tareas

- [x] **T1-T3** Arnés y auditoría: grabador por ronda, casos corregidos, parser de montos (AGT24).
- [x] **T4, T4b** Guarda de dinero sin rastro con reintento y traspaso; la cifra del cliente cuenta (AGT23).
- [x] **T5** `mensaje_sin_cobertura` literal desde el backend (AGT25).
- [x] **T6** Regla de cita literal, prompt `v3` (AGT26).
- [x] **T7** Casos `soloGuionado` (EVL4), deltas de esta spec y guía de operación.

## Cierre

Queda sin archivar: `sdd-archive` fusiona el delta en `openspec/specs/agente/`.
