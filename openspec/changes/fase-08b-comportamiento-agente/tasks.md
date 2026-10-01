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

- [x] T1 — Prompt en dos archivos: `reglas` (no negociable) y `estilo` (editable), versión `v2`
- [x] T2 — Estilo nuevo y aserciones de evals «sin emojis» y «sin SKU»
- [x] T3 — SKU interno: fuera del catálogo compacto y de los resultados de las herramientas
- [x] T4 — Esquema `foto.angulo` e importador (`fotos_angulos`) `[manual]` de esquema ya aprobado
- [x] T5 — Collage opcional (apagado por defecto) y sin casillas vacías
- [x] T6 — `enviar_fotos`: portada por defecto y ángulo bajo demanda; ficha con ángulos disponibles
- [x] T7 — Pie de foto armado por el backend (nombre, descripción corta, `precio_texto`)
- [x] T8 — Evals y e2e nuevos; ajuste de los que asumían collage; corrida real `[manual]`
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

Decision needed before apply: No (change aprobado el 2026-10-01; Q1 y Q2 resueltas).
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
- **Estado**: hecha (2026-10-01). RED: `vitest run ensamblar-prompt.spec.ts` → 4 fallos (orden con `estilo`,
  reglas intactas, estilo sin emojis y versión `v2`); GREEN: 145/145 en `src/modulos/agente`. `reglas.v2.md`
  conserva las herramientas tal cual (el bullet de `enviar_fotos` cambia en T6); el log de versión pasa a `v2`.

## T2 — Estilo nuevo y aserciones de evals

- **Qué**: el estilo ordena sin emojis, viñetas o listas cortas cuando ayuden y sin pegotes; aserciones
  `sin_emojis` y `sin_sku` en `test/evals/` con casos negativos.
- **RED**: la aserción nueva no existe; una respuesta con emoji o SKU debe fallar.
- **Estado**: hecha (2026-10-01). RED: `aserciones.spec.ts` → 6 fallos; GREEN: 42/42 en `test/evals` y
  `npm run evals` (33 pasan, veredicto APROBADA). Ambas son **no críticas** (preferencia del dueño, no regla
  invariante). Emoji = `Extended_Pictographic` sin ©®™; SKU = patrón `SKU-XXXX` del proyecto. Casos
  negativos `neg-emojis` y `neg-sku`; `saludo.json` las usa en positivo.

## T3 — SKU interno

- **Qué**: el catálogo compacto y los resultados de `buscar_producto` y `obtener_ficha` usan el `id`, no el
  SKU; `id_producto` sigue aceptando SKU como entrada.
- **RED**: los tres escenarios de AGT16.
- **Archivos**: `catalogo/dominio/producto.ts`, herramientas de `agente`, sus specs.
- **Estado**: hecha (2026-10-01). RED: 7 fallos (catálogo compacto, `buscar_producto`, `obtener_ficha`);
  GREEN: 735/735 en unit, evals APROBADA (100 %), e2e verde. **Desviación**: el delta de `catalogo` no
  incluía CAT4 (su texto decía «sku + nombre + descripción corta»); se agregó como MODIFIED con un escenario
  nuevo («Cada línea del catálogo compacto lleva el id del producto y no su SKU»). Las descripciones de las
  herramientas dejan de mencionar el SKU, pero `id_producto` lo sigue aceptando como entrada. `reglas.v2.md`
  pide no mencionar códigos internos.

## T4 — Esquema `foto.angulo` e importador

- **Qué**: `MODELO_DATOS.md` primero, luego `prisma/schema.prisma` y la migración; el importador lee
  `fotos_angulos` (IMP14); actualiza `datos-desarrollo/` con un ejemplo.
- **RED**: los cuatro escenarios de IMP14, uno contra Postgres real (integración).
- **Aprobación de esquema**: dada por el dueño (opción A, 2026-10-01).
- **Estado**: hecha (2026-10-01). RED: 8 fallos (validador, `ProcesarFotos`); GREEN: unit 768/768 e integración
  contra Postgres real (`repositorio-importacion.spec.ts`, 9/9, incluye la migración `20261001120000_foto_angulo`).
  `MODELO_DATOS.md` primero. Ángulos en `catalogo/dominio/angulo-foto.ts` (exportados por el barril para T6).
  `NuevaFotoImportada.angulo` y `FotoValidada.angulo` son obligatorios (`null` = sin etiquetar); se
  actualizaron las expectativas de `procesar-fotos.spec.ts`. La semilla de desarrollo trae `fotos_angulos`.

## T5 — Collage opcional y sin casillas vacías

- **Qué**: `CATALOGO_GENERAR_COLLAGE` (esquema de configuración, `.env.example`, contrato de variables);
  `ProcesarFotos` genera collage solo si está activa; `construirCollage` ajusta la grilla (MED8).
- **RED**: los seis escenarios de MED8 y los dos de IMP15; el de «Una sola foto no genera collage» falla hoy.
- **Estado**: hecha (2026-10-01). RED: 9 fallos (MED8 con 1, 2, 3 y 5 fotos y comprobación de píxeles, IMP15,
  variable de configuración); GREEN: unit 126/126 en catálogo, evals APROBADA, e2e verde. La grilla
  reparte casillas sin huecos (impar: la última ocupa toda la fila inferior); con menos de 2 fotos
  `construirCollage` devuelve `null` y con más de 6 lanza `RangeError`. **Desviaciones**: (1) el escenario
  MED9 «Redescargar una foto por archivo faltante…» usaba un producto de una sola foto, que con MED8
  nuevo ya no tiene collage; pasó a dos fotos, mismo comportamiento verificado. (2) `importar-catalogo-cli.spec.ts`
  (integración con MinIO, no corre sin Docker) fija `CATALOGO_GENERAR_COLLAGE=true` para seguir comprobando
  que el collage se genera cuando se pide. El primer CI de #46 falló ahí: ese test esperaba collage para
  `SKU-0002`, que tiene una sola foto (MED8: sin collage); ahora espera `null` y que el objeto no exista. Con la variable apagada, el collage guardado de una importación
  previa deja de referenciarse (`clave_collage` nula); el archivo huérfano queda en el almacenamiento.

## T6 — `enviar_fotos` por ángulo

- **Qué**: `ObtenerFotosProducto` devuelve la portada o la foto del ángulo pedido y los ángulos
  disponibles; `enviar_fotos` pierde `modo` y gana `angulo`; la ficha lista los ángulos disponibles; el
  contador por sesión se conserva.
- **RED**: CAT14 (4), AGT9 (5) y R13 «Una sola foto por defecto».
- **Estado**: hecha (2026-10-01). RED: 23 fallos en unit (caso de uso, herramienta, ficha, reglas); GREEN: unit
  1035 pasan, evals APROBADA (100 %), e2e 33/33 e integración de `repositorio-producto` contra Postgres real.
  `enviar_fotos` pierde `modo`, gana `angulo` (enum de `ANGULOS_FOTO`) y manda una sola foto por llamada; el
  contador por sesión suma 1. `ObtenerFotosProducto` devuelve `{ foto, angulosDisponibles, leyenda }`;
  `listarFotos` devuelve `FotoProducto[]` (clave y ángulo); la ficha trae `angulosFotos` y la herramienta
  `angulos_fotos`. `reglas.v2.md` explica una foto y el ángulo bajo demanda. **Desviaciones**: (1) el caso de
  evals `r13-collage` pasó a `r13-una-foto` (título del escenario nuevo) y la semilla de evals/e2e trae fotos con
  ángulo; el e2e comprueba la imagen en Chatwoot (T8 agrega el ángulo pedido y los demás casos). (2) El multipart
  convierte el salto de línea del pie en CRLF; el test lo normaliza. (3) La lista de ángulos disponibles en la
  ficha no tenía escenario en el delta; queda cubierta por un test de `ObtenerFichaProducto` y por D4 del diseño.

## T7 — Pie de foto

- **Qué**: `ObtenerFotosProducto` arma la `leyenda` con nombre, descripción corta y `precio_texto`, sin SKU;
  `enviar_fotos` la pone en cada efecto (ya viaja hasta Chatwoot).
- **RED**: los dos escenarios de AGT17, con transcripción completa (dinero, R2).
- **Estado**: hecha (2026-10-01; Q1 resuelta: el pie usa `descripcion_corta`). RED: `armarLeyendaFoto` inexistente, los
  dos escenarios de AGT17 en dominio y caso de uso, y el efecto sin `leyenda` en la herramienta (8 fallos);
  GREEN: `armarLeyendaFoto` en `catalogo/dominio/producto.ts` con `formatearCop` (R2), ficha del e2e verificada
  contra el multipart de Chatwoot: `<nombre> — <descripción corta>` y `$389.000`, sin SKU. El modelo nunca ve
  la leyenda (solo `enviadas`).

## T8 — Evals y e2e

- **Qué**: casos de evals de una foto por defecto, ángulo pedido, sin emojis, sin SKU; ajuste de
  `r13-collage.json`, `enviar-fotos.spec.ts`, `obtener-fotos-producto.spec.ts` y del e2e de fotos.
- **`[manual]`**: corrida real (`EVALS_MODO=real`) con `gpt-5.6-luna` y el candidato; registrar costo y
  elegir el modelo principal (EVL3, ADR-0002). Exige la clave de OpenAI del dueño.
- **`[manual]`**: verificación por WhatsApp (una foto por defecto, otro ángulo con pie, sin emojis ni SKU).
- **Estado**: hecha en lo automático (2026-10-01); las dos tareas `[manual]` quedan pendientes del dueño.
  Evals guionadas: caso nuevo `fotos-otro-angulo`, y `sinEmojis`/`sinSku` en 17 de los casos existentes (34
  pasan, veredicto APROBADA, 100 %). E2E nuevos: «Con ángulo llega solo la foto de ese ángulo, con su pie de
  foto» y «Un ángulo que el producto no tiene no manda ninguna imagen y el modelo lo sabe» (10/10 en
  `agente-llm`). El caso `r13-una-foto` y el e2e de la portada ya habían entrado en T6 para no dejar el CI rojo.

## T9 — Cierre documental

- Fusionar los deltas en `openspec/specs/{agente,conversaciones,catalogo,medios}`; `MODELO_DATOS.md` al día;
  `docs/migracion/inventario.md` y `docs/fases/README.md` (fila 08b); P43-P45 anotadas como resueltas;
  `verify-report.md` con «qué aprendimos»; archivar el change.
- **Estado**: pendiente.
