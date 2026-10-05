# Portabilidad de la batería de pruebas en Windows

Trabajo fuera de fase (ODD). Rama `fix/portabilidad-windows` sobre `main`; luego el mismo arreglo en
la rama de la reestructuración `ccr-51a2b6d0-2fsxtk` (PR #82).

## Problema

En un checkout limpio en Windows, `npm run ci` falla en dos pruebas que en Linux (CI de GitHub)
pasan:

1. **Deriva del cliente generado.** `ng-openapi-gen` escribe con el fin de línea del sistema (CRLF en
   Windows); git guarda `cliente/src/app/api/` en LF (`.gitattributes`, `eol=lf`). La comparación
   byte a byte falla siempre. Además, `cliente:generar` deja el árbol de trabajo en CRLF y git lo
   marca como modificado.
2. **`prompts-build.spec.ts`.** Llama a `execFileSync('npx', …)` sin shell; en Windows el ejecutable es
   `npx.cmd` y falla con `spawnSync npx ENOENT`.

## Por qué

La regla del repo es que la batería completa corre en local antes de cada push. Si falla en Windows
por el entorno, los fallos reales quedan escondidos entre los falsos.

## Alcance

- El generador del cliente normaliza a LF todo lo que escribe (generar y deriva).
- La prueba del build invoca el CLI de Nest con `node` directamente, sin `npx` ni shell.
- PER10 («Las filas escritas por un worker no son visibles para otro worker») agotaba los 20 s de
  `testTimeout` bajo la batería completa. Causa: su cuerpo clona la plantilla (`CREATE DATABASE …
  TEMPLATE`), la misma operación del `beforeAll` de `base-por-worker.setup.ts`, cuyo presupuesto en
  el repo es `hookTimeout` (60 s); la plantilla creció con las migraciones de la Fase 11. Se le da
  ese mismo presupuesto.

## Tareas

- [x] T1 — `main`: LF en el generador del cliente, `nest build` sin `npx` y presupuesto de PER10
      (inline; cambios pequeños y ya entendidos, sin investigación pendiente).
- [x] T1 cerrada con `d800bea`, fusionada en `main` por el PR #83 (`75216dd`).
- [x] T2 — `ccr-51a2b6d0-2fsxtk`: merge de `main` (inline). Las dos pruebas movidas a
      `servicio/test/` llegan solas; `scripts/generar-cliente.ts` y `test/fronteras/cliente-deriva.spec.ts`
      ya no existen en la rama (los reemplaza `cliente/herramientas/`), así que el arreglo de LF y su
      prueba se aplican en `cliente/herramientas/api.mjs` y `api.spec.ts`.

## Checks

- RED observado (Windows, checkout limpio de `main`): `cliente-deriva.spec.ts` → «El cliente
  commiteado coincide con el contrato público» falla; `prompts-build.spec.ts` → `spawnSync npx ENOENT`.
- GREEN: ambos archivos de prueba pasan y `git status` queda limpio tras correrlos.
- Batería del repo antes del push (`lint`, `typecheck`, `fronteras`, `contrato:deriva`, `commits`, unit,
  integración, e2e, evals).

## Progreso

- T1 (Windows 11, Docker Desktop 28.3.2, Node 24.19, npm 11.17): `ci:hook`, `fronteras`,
  `test:cobertura` (249 archivos, 1754 tests), `test:e2e`, `evals`, `contrato:lint`, `contrato:diff`,
  `auditoria`, `flujos` y `cliente:ci` en verde; `git status` limpio tras regenerar el cliente.
  Revisión nativa (lente de fiabilidad) aprobada sin bloqueos; sugerencias informativas: la prueba de
  LF solo discrimina en Windows, ruta fija al CLI de Nest.
- Nota de entorno, no del repo: `~/.npmrc` con `allow-scripts` hace fallar `npm ci` con npm 11.17
  (ver `conexion-redis-perezosa.md`, T5); se corrió con un `.npmrc` vacío vía `NPM_CONFIG_USERCONFIG`.

- T2 (mismo entorno): RED observado en `api.spec.ts` (deriva y LF) antes de tocar `api.mjs`; después,
  en `servicio/`: `prisma:generar`, `ci:hook`, `fronteras`, `test:cobertura` (246 archivos, 1742
  tests), `test:e2e`, `evals`, `contrato:lint`, `contrato:diff`, `auditoria`, `flujos`; en `cliente/`:
  `ci` y `auditoria:cliente`. Todo en verde y `git status` limpio tras regenerar el cliente.

Siguiente: el PR #82 sigue su revisión normal.
