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
- [ ] T4 Cliente Angular: lista de secciones (crear/editar/ordenar/activar) + historial.
- [ ] T5 Docs: estilo-del-bot.md, MODELO_DATOS.md, spec agente, ADR (propuesta), CHANGELOG no se toca.

## Criterios de aceptación
Batería completa de CLAUDE.md «Publicar y encadenar fases» en verde; evals guionadas 100 %; el prompt
ensamblado con las secciones sembradas es idéntico al estilo inicial actual.

## Route / evidencia
Delegado: un escritor por tarea (≥2 archivos no triviales cada una), mapa previo de explorador (2026-10-07).

## Progreso
(commits por tarea se anotan aquí)
- T1 (delegado, un escritor): commit 771ae07 (feat(agente): estilo en secciones con foto compuesta en version_estilo). Ruta: delegado. Tests: unit, integracion y persistencia en verde.

- T2 (delegado, un escritor): commit de T2: ver git log (feat(agente): API admin de secciones del estilo). Ruta: delegado. Tests: unit, integracion, e2e y contrato en verde; 4 codigos nuevos en el catalogo (seccion-inexistente, seccion-duplicada, seccion-modificada, orden-secciones-invalido).
- T2 commit: 41b2c3d (feat(agente): endpoints admin de secciones del estilo).
- T3 (delegado, un escritor): subcomando `prompt:estilo secciones` (solo lectura, sin textos); publicar/restaurar ya reemplazaban secciones (T1); semilla y EVALS_ESTILO confirmadas con tests de integracion y evals; prueba de equivalencia del prompt ensamblado. Ruta: delegado. Commit: ver git log (feat(agente): subcomando secciones del CLI de estilo).
