# Tasks: Fase 08b — Comportamiento del agente y fotos

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio
(regla 6: solo 04/05/06/10).

TDD estricto: RED observado → GREEN → REFACTOR. Runner **Vitest** (`npm test`,
`npm run test:integracion`, `npm run test:e2e`, `npm run evals`); `npm run verify` al cerrar cada slice.
La tarea T4 toca esquema y las tareas con dinero (T7) llevan transcripción completa del RED. Nunca se llama
a un LLM ni a Chatwoot reales salvo en las tareas `[manual]`.

Rama: `fase-08b-comportamiento-agente` (desde `main`). Un commit de unidad de trabajo por tarea,
Conventional Commits (encabezado y líneas del cuerpo ≤ 100 caracteres: `npm run commits` antes de subir),
sin atribución de IA. Antes de cada push, la batería completa de `CLAUDE.md` («Publicar y encadenar fases»).

**Resultado: 9 tareas, dentro del límite de 10.**

## Checklist

- [ ] T1 — Prompt en dos archivos: `reglas` (no negociable) y `estilo` (editable), versión `v2`
- [ ] T2 — Estilo nuevo y aserciones de evals «sin emojis» y «sin SKU»
- [ ] T3 — SKU interno: fuera del catálogo compacto y de los resultados de las herramientas
- [ ] T4 — Esquema `foto.angulo` e importador (`fotos_angulos`) `[manual]` de esquema ya aprobado
- [ ] T5 — Collage opcional (apagado por defecto) y sin casillas vacías
- [ ] T6 — `enviar_fotos`: portada por defecto y ángulo bajo demanda; ficha con ángulos disponibles
- [ ] T7 — Pie de foto armado por el backend (nombre, descripción corta, `precio_texto`)
- [ ] T8 — Evals y e2e nuevos; ajuste de los que asumían collage; corrida real `[manual]`
- [ ] T9 — Cierre documental

## Mapeo de escenarios por tarea (34 nuevos o modificados; los 4 vigentes de R13 se conservan)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | AGT13 (4: los dos vigentes, «El estilo va entre las reglas y el catálogo», «Cambiar el estilo no cambia las reglas») | 4 |
| T2 | AGT15 (2); AGT16 «Una respuesta con SKU falla la aserción» | 3 |
| T3 | AGT16 «El catálogo compacto no contiene SKU», «Los resultados de las herramientas no contienen SKU», «Un SKU como entrada sigue funcionando» | 3 |
| T4 | IMP14 (4) | 4 |
| T5 | IMP15 (2); MED8 (6) | 8 |
| T6 | CAT14 (4); AGT9 (5); R13 «Una sola foto por defecto» | 10 |
| T7 | AGT17 (2) | 2 |
| T8 | Casos de evals y e2e (sin escenarios nuevos; R13: los 4 escenarios vigentes se conservan) | 0 |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1.800 de autoría |
| 400-line budget risk | Medium: T4 y T6 pueden superarlo por tests (TDD, ~60 %) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: **Sí** — aprobación del dueño de esta fase y respuesta a Q1 (pie de foto) y Q2
(columna `fotos_angulos`).
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

| PR | Tareas | Estimado | Excepción anticipada | Comando enfocado | Rollback |
|---|---|---|---|---|---|
| PR1 | T1 + T2 | ~400 | No | `npm test -- agente` + `npm run evals` | Volver a `reglas.v1.md` y quitar las aserciones |
| PR2 | T3 | ~300 | No | `npm test -- agente catalogo` | Devolver el SKU al catálogo compacto |
| PR3 | T4 + T5 | ~500 | Sí (migración y collage, tests largos) | `npm test -- catalogo medios` + `npm run test:integracion -- catalogo` | Dejar de leer `angulo`; `CATALOGO_GENERAR_COLLAGE=true` |
| PR4 | T6 + T7 | ~500 | Sí (herramienta y pie, tests largos) | `npm test -- agente catalogo` + `npm run test:e2e` | Volver al modo collage/individuales |
| PR5 | T8 + T9 | ~400 | Sí (parte documental sin riesgo) | `npm run evals` + `npm run test:e2e` + `npm run verify` | Revertir casos y documentos |

---

## T1 — Prompt en dos archivos

- **Qué**: crear `estilo.v2.md` con identidad, tono, longitud y formato; dejar `reglas.v2.md` con lo no
  negociable; renombrar `turno.v1.md` a `v2`; `CargadorPrompts` carga los tres; `EnsamblarPrompt` los une
  en el orden de AGT13.
- **RED**: los dos escenarios nuevos de AGT13 fallan (no existe `estilo`).
- **Archivos**: `src/modulos/agente/prompts/*`, `infraestructura/prompts/cargador-prompts.ts`,
  `aplicacion/ensamblar-prompt.ts` y sus specs.
- **Estado**: pendiente.

## T2 — Estilo nuevo y aserciones de evals

- **Qué**: el estilo ordena sin emojis, viñetas o listas cortas cuando ayuden y sin pegotes; aserciones
  `sin_emojis` y `sin_sku` en `test/evals/` con casos negativos.
- **RED**: la aserción nueva no existe; una respuesta con emoji o SKU debe fallar.
- **Estado**: pendiente.

## T3 — SKU interno

- **Qué**: el catálogo compacto y los resultados de `buscar_producto` y `obtener_ficha` usan el `id`, no el
  SKU; `id_producto` sigue aceptando SKU como entrada.
- **RED**: los tres escenarios de AGT16.
- **Archivos**: `catalogo/dominio/producto.ts`, herramientas de `agente`, sus specs.
- **Estado**: pendiente.

## T4 — Esquema `foto.angulo` e importador

- **Qué**: `MODELO_DATOS.md` primero, luego `prisma/schema.prisma` y la migración; el importador lee
  `fotos_angulos` (IMP14); actualiza `datos-desarrollo/` con un ejemplo.
- **RED**: los cuatro escenarios de IMP14, uno contra Postgres real (integración).
- **Aprobación de esquema**: dada por el dueño (opción A, 2026-10-01).
- **Estado**: pendiente.

## T5 — Collage opcional y sin casillas vacías

- **Qué**: `CATALOGO_GENERAR_COLLAGE` (esquema de configuración, `.env.example`, contrato de variables);
  `ProcesarFotos` genera collage solo si está activa; `construirCollage` ajusta la grilla (MED8).
- **RED**: los seis escenarios de MED8 y los dos de IMP15; el de «Una sola foto no genera collage» falla hoy.
- **Estado**: pendiente.

## T6 — `enviar_fotos` por ángulo

- **Qué**: `ObtenerFotosProducto` devuelve la portada o la foto del ángulo pedido y los ángulos
  disponibles; `enviar_fotos` pierde `modo` y gana `angulo`; la ficha lista los ángulos disponibles; el
  contador por sesión se conserva.
- **RED**: CAT14 (4), AGT9 (5) y R13 «Una sola foto por defecto».
- **Estado**: pendiente.

## T7 — Pie de foto

- **Qué**: `ObtenerFotosProducto` arma la `leyenda` con nombre, descripción corta y `precio_texto`, sin SKU;
  `enviar_fotos` la pone en cada efecto (ya viaja hasta Chatwoot).
- **RED**: los dos escenarios de AGT17, con transcripción completa (dinero, R2).
- **Estado**: pendiente. **Bloqueada por Q1** hasta que el dueño confirme que el pie usa `descripcion_corta`.

## T8 — Evals y e2e

- **Qué**: casos de evals de una foto por defecto, ángulo pedido, sin emojis, sin SKU; ajuste de
  `r13-collage.json`, `enviar-fotos.spec.ts`, `obtener-fotos-producto.spec.ts` y del e2e de fotos.
- **`[manual]`**: corrida real (`EVALS_MODO=real`) con `gpt-5.6-luna` y el candidato; registrar costo y
  elegir el modelo principal (EVL3, ADR-0002). Exige la clave de OpenAI del dueño.
- **`[manual]`**: verificación por WhatsApp (una foto por defecto, otro ángulo con pie, sin emojis ni SKU).
- **Estado**: pendiente.

## T9 — Cierre documental

- Fusionar los deltas en `openspec/specs/{agente,conversaciones,catalogo,medios}`; `MODELO_DATOS.md` al día;
  `docs/migracion/inventario.md` y `docs/fases/README.md` (fila 08b); P43-P45 anotadas como resueltas;
  `verify-report.md` con «qué aprendimos»; archivar el change.
- **Estado**: pendiente.
