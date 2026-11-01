# Tasks: fix-lectura-mensajes-chatwoot

- Modo TDD: **estricto** (fuente: CLAUDE.md del proyecto) · Runner: Vitest (`npm test`,
  `npm run test:integracion`).
- Entrega: un PR chico, muy por debajo del presupuesto de 400 líneas.

## Tareas

- [x] **T1 — Lectura con token de usuario (CAN6).** Variable `CHATWOOT_API_TOKEN_LECTURA`, credencial
  por llamada en `ClienteChatwoot`, lector y reconciliación con `lectura`, `warn` de arranque sin
  valores, Chatwoot falso que autoriza como el real. RED: el lector devolvía `null` (401) contra el
  servidor falso realista; GREEN con el token de lectura.
- [x] **T2 — Docs.** `.env.example`, delta de CAN6, pregunta P41 en `docs/PREGUNTAS_ABIERTAS.md`.

## Cierre

Queda sin archivar: lo hace el usuario o la CI de fases (`sdd-archive` fusiona el delta en
`openspec/specs/canales/`).
