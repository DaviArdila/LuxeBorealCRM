# Estilo del bot en secciones

## Objetivo
El estilo del bot deja de ser un único texto y pasa a componerse de secciones independientes
(`seccion_estilo`) que el admin crea, edita, ordena y activa. Sin categorías. El bot sigue recibiendo
un solo bloque de estilo en el prompt (contexto siempre activo, no herramienta).

## Por qué
Hacerlo sostenible como los casos de uso. Medición local (2026-10-07): leer 9 secciones cuesta lo mismo que
leer un texto (~0,55 ms p50); el chequeo por turno sigue siendo un GET de Redis (~0,36 ms).

## Alcance y restricciones
- Trabajo fuera de fase (ODD). Esquema aprobado por el usuario el 2026-10-07 (tabla `seccion_estilo`).
- `version_estilo` se mantiene como foto del estilo compuesto: historial de 10, restaurar, CLI y evals siguen.
- `ProveedorEstilo` cachea el texto compuesto (secciones activas por `orden`); sin consultas extra por turno.
- Tope de 4.000 caracteres sobre la suma compuesta; reglas de `validar-estilo.ts` por sección y sobre el total.
- `estilo.v3.md` queda como respaldo; `estilo-inicial.md` como semilla (partida por encabezados `#`).
- Rama `feat/estilo-en-secciones` (sobre `chore/estilo-y-casos-semilla`). README.md y cliente/angular.json
  tienen cambios locales del usuario: NO se tocan ni se commitean.

## Tareas
- [x] T1 Backend núcleo: Prisma `seccion_estilo` + migración (parte el estilo vigente por `#`), dominio
      (compuesto + validación), repositorio, `ProveedorEstilo`/publicación como foto compuesta.
- [x] T2 API admin: CRUD + reordenar + restaurar sobre secciones, 409 por `actualizado`, contrato OpenAPI.
- [x] T3 CLI `prompt:estilo`, semilla y evals (`EVALS_ESTILO`) sobre el texto compuesto.
- [x] T4 Cliente Angular: lista de secciones (crear/editar/ordenar/activar) + historial.
- [x] T5 Docs: estilo-del-bot.md, MODELO_DATOS.md, spec agente, ADR (propuesta), CHANGELOG no se toca.

## Criterios de aceptación
Batería completa de CLAUDE.md «Publicar y encadenar fases» en verde; evals guionadas 100 %; el prompt
ensamblado con las secciones sembradas es idéntico al estilo inicial actual.

## Route / evidencia
Delegado: un escritor por tarea (≥2 archivos no triviales cada una), mapa previo de explorador (2026-10-07).

## Progreso
(commits por tarea se anotan aquí)
- T1 (delegado, un escritor): commit c380f6c (feat(agente): estilo en secciones con foto compuesta en version_estilo). Ruta: delegado. Tests: unit, integracion y persistencia en verde.

- T2 (delegado, un escritor): commit de T2: ver git log (feat(agente): API admin de secciones del estilo). Ruta: delegado. Tests: unit, integracion, e2e y contrato en verde; 4 codigos nuevos en el catalogo (seccion-inexistente, seccion-duplicada, seccion-modificada, orden-secciones-invalido).
- T2 commit: 8b80422 (feat(agente): endpoints admin de secciones del estilo).
- T3 (delegado, un escritor): subcomando `prompt:estilo secciones` (solo lectura, sin textos); publicar/restaurar ya reemplazaban secciones (T1); semilla y EVALS_ESTILO confirmadas con tests de integracion y evals; prueba de equivalencia del prompt ensamblado. Ruta: delegado. Commit: ver git log (feat(agente): subcomando secciones del CLI de estilo).
- T3 commit: 5bbda24 (feat(agente): subcomando secciones del CLI de estilo).
- T4 (delegado, un escritor): pantalla `/asistente/estilo` en secciones (lista, crear/editar en ventana, subir/bajar, encender/apagar, contador global con aviso al 90 %, 409 `seccion-modificada` recarga y toma la marca nueva, restaurar recarga). Se retiró la publicación de texto único de la UI (el endpoint sigue). Cliente HTTP regenerado. Ruta: delegado. Proof: `npm --prefix cliente run ci` en verde (17 tests de la pantalla).
- Review nativo del rango de T4 aprobado (3 hallazgos consultivos corregidos en este commit: R3-001 interruptor tras rechazo, R3-002 versión/historial tras ordenar, R3-003 conflicto 409 con recarga caída cubierto por prueba). Hash de T4: afb9db1.
- Fix de T4 (delegado): commit 5b33231 (fix(cliente): interruptor, orden y conflicto del estilo tras un rechazo del servidor).
- T5 (delegado, un escritor): estilo-del-bot.md reescrito para secciones, requisitos EST-S1..S5, EST-API y EST-CLI en
  `openspec/specs/agente/spec.md`, ADR-0026 (propuesta, el usuario la acepta), fila en el índice de ADR y `-- secciones`
  en la tabla de comandos de CLAUDE.md. MODELO_DATOS.md ya traía `seccion_estilo` desde T1 (sin cambios). Sin preguntas
  abiertas nuevas: arrastrar para reordenar queda anotado en el ADR como fuera de alcance. Ruta: delegado. Comprobación:
  lectura estructural (enlaces, numeración, sin secciones duplicadas) y `npm run commits`. Commit: ver git log
  (docs(agente): documenta el estilo en secciones y su adr).

## Resumen de commits

| Tarea | Commit |
|---|---|
| T1 | c380f6c |
| T2 | 8b80422 |
| T3 | 5bbda24 |
| T4 | afb9db1 |
| Fix de T4 | 5b33231 |
| T5 | ver git log |

## Review nativo

| Rango | Resultado |
|---|---|
| T4 | Aprobado y reconocido; hallazgos consultivos corregidos en 5b33231 |
| T1 + T2 | No se pudo revisar: `lens_context_budget_exceeded` por el JSON regenerado de OpenAPI |
| T3 y el fix de T4 | Bajo el presupuesto de revisión |

## Entrega (pronóstico, sin empujar nada)

Líneas de autoría (sumas más borrados) desde `f11b4b6`, sin `openapi/*.json` ni `cliente/src/app/api/`: **2.432**
(~1.090 sin contar tests). Por commit: T1 1.252, T2 449, T3 124, T4 556, fix 67. Supera ~400, así que se encadena
(`stacked-to-main`) en cinco PRs:

| PR | Rama sugerida | Contenido | Líneas |
|---|---|---|---|
| 1 | `feat/estilo-secciones-p1-nucleo` | T1: tabla, dominio, repositorio, foto compuesta | ~1.250 (excepción: ~60 % tests y migración) |
| 2 | `feat/estilo-secciones-p2-api` | T2: endpoints admin y contrato | ~450 |
| 3 | `feat/estilo-secciones-p3-cli` | T3: subcomando, semilla, evals | ~125 |
| 4 | `feat/estilo-secciones-p4-cliente` | T4 + fix | ~620 (excepción: ~50 % tests) |
| 5 | `docs/estilo-secciones` | T5: documentación y ADR-0026 | ~330 |

El PR 1 podría partirse en dominio/migración y repositorio/proveedor si el usuario lo pide; no se parte por el tamaño solo.

## Nota del rebase

La cadena se rebasó sobre `origin/main` (2026-10-07) para recoger `sharp 0.35.5` (GHSA-wq5f-xc86-pv6w), que
tumbaba el CI. Los hashes de arriba son los posteriores al rebase. El ADR pasó de 0025 a 0026 porque `main`
ya usaba el 0025 (multiempresa).
El cliente HTTP generado (`cliente/src/app/api/`) se movió al corte de la API (commit `bb25c67`): sin él
`api:deriva` fallaba en los cortes 2 y 3, donde el contrato ya tenía los endpoints.
