# Comportamiento del bot (propuesta 08b)

- Objetivo: que el agente hable como quiere el dueño (sin emojis, con estructura, sin SKU), envíe una
  foto por defecto con pie de foto y tenga prompts editables sin desplegar.
- Estado: **propuesta, nada aprobado.** Hoy es solo documentación. Cualquier cambio de comportamiento
  exige antes un change de OpenSpec aprobado por el dueño (`openspec/changes/fase-08b-comportamiento-agente/`,
  aún sin crear).
- Alcance autorizado (2026-10-01): solo este documento, `docs/CONTEXTO_SESIONES.md`, la hoja de ruta y
  las preguntas P42-P45. Ningún archivo de `src/`, `test/` ni `prisma/`. Push, PR y merge: decisión del
  dueño.
- TDD: **estricto** cuando se implemente; fuente `CLAUDE.md` del proyecto; runner Vitest (`npm test`,
  `npm run test:integracion`, `npm run evals`). Hoy no aplica (solo documentación).
- Lugar en la hoja de ruta: fila 08b de `docs/fases/README.md` (estado `idea`), entre la 08 y la 09.

## Problema y evidencia

Hallado en pruebas reales con Chatwoot. Cada fila dice de dónde sale el comportamiento hoy.

| Comportamiento observado | Origen en el código | Tipo de cambio | Tamaño |
|---|---|---|---|
| Usa emojis | `src/modulos/agente/prompts/reglas.v1.md` no los prohíbe; el modelo los pone | Prompt | S |
| Respuestas pegadas, sin viñetas | `reglas.v1.md:3` ordena «Sin listas largas ni formato especial» | Prompt | S |
| Muestra el SKU al cliente | `buscar_producto` y `obtener_ficha` se lo entregan al modelo; además viaja en el catálogo compacto del prompt (`catalogo/dominio/producto.ts:80`) | Prompt + herramientas | M |
| Envía un collage en vez de fotos | `reglas.v1.md:17`, descripción de `enviar_fotos` (`aplicacion/herramientas/enviar-fotos.ts`), R13/AGT9 | Prompt + herramienta + spec | M |
| Las fotos no llevan pie | La `leyenda` ya viaja de punta a punta (`efectos.ts`, `salida-canal.ts`, adaptador Chatwoot), pero `enviar_fotos` nunca la rellena | Herramienta | S |
| Tope de fotos | `AGENTE_FOTOS_INDIVIDUALES_MAX` (def. 4, máx. 10) por sesión; el importador limita a 6 por producto | Config + importador | S |
| El importador genera collage | Fase 03 (`medios`/`catalogo`) | Importador + specs | M |
| Prompt fijo en un `.md` | Se carga una vez, versión `v1`; los textos `mensaje_*`/políticas ya son datos en `parametro` (R15) | Arquitectura + ADR + spec | L |
| Modelo no cumple evals | Evals reales: ver abajo | Prompt + elección de modelo | M |

### Evals reales (primera medición, 2026-09-30)

| Modelo | Resultado | Críticas fallidas | No críticas | Costo |
|---|---|---|---|---|
| `gpt-6-luna` (directo, `openai:`) | REPROBADA | 5 | 64,3 % | 0,0049 USD |
| `gpt-5.6-luna` | REPROBADA | 0 | 67,9 % | 0,0102 USD |

- Fallos comunes: no cita literal `precio_texto`, `rango_texto` ni el texto de políticas; a veces no
  llama herramientas (`obtener_ficha`, `marcar_lead_caliente`); el saludo no menciona el negocio.
- `gpt-6-luna` además: dinero sin rastro (R1/R2) y un traspaso indebido.
- Conclusión: **el agente no debe exponerse a clientes todavía.** El modelo más seguro hoy es
  `gpt-5.6-luna`; el prompt necesita trabajo para cualquier modelo.

## Decisiones del dueño (2026-10-01)

1. **Sin emojis**, mejor tono y expresiones, respuestas más estructuradas (viñetas o listas cortas
   cuando ayuden), sin pegotes.
2. **El SKU es solo referencia interna.** El cliente ve el **nombre del producto con sus atributos**
   (lo que provea la marca). Ese nombre más el precio (`precio_texto`, R2) es la «referencia» del pie de
   foto (P42, resuelta).
3. **Fotos:** el dueño arma y sube el collage como imagen; no hay collage automático. Por defecto se
   envía **una sola foto** (la principal). Si el cliente pide más fotos o ángulos, se envían las demás,
   **cada una con su pie de foto.** Esto **enmienda R13/AGT9** (hoy el modo por defecto es collage
   generado). Tope de fotos: P43; collage del importador: P44.
4. **Prompts editables desde la base de datos** con valores por defecto versionados (el `.md` actual como
   respaldo), para un futuro back office. Hoy es una idea a estudiar: caché con invalidación (prefijo
   estable, AGT13) y decidir si alcanza `parametro` o hace falta tabla nueva (el esquema es decisión del
   dueño, P45).

## Restricciones

| Regla | Qué implica aquí |
|---|---|
| R1/R2 | El LLM nunca calcula dinero; el pie de foto usa `precio_texto` del backend |
| R13 | Mínimo de mensajes: una foto por defecto es coherente; las extra son bajo demanda. Se enmienda con spec |
| R14 | Los prompts y pies de foto no loguean contenido de mensajes ni datos personales |
| R15 | Textos al cliente y parámetros del negocio son datos; el prompt editable sigue ese espíritu |
| EVL3 | Ningún cambio de modelo o prompt se fusiona sin una corrida real que alcance el umbral |
| Esquema | Tabla nueva o cambio de columnas: decisión explícita del dueño, no se hace sin ella |

Los evals guionados no dependen del texto del `.md`. Cambiarían con las fotos sueltas:
`test/evals/casos/sinteticos/r13-collage.json`, `enviar-fotos.spec.ts` y `obtener-fotos-producto.spec.ts`.

## Tareas

Todas sin marcar. Ruta sugerida: **I** = inline, **D** = delegada (escritor único). Cada tarea cierra
con un commit de unidad de trabajo en la rama de la fase; ~400 líneas por PR como heurística.

### Slice 1 — Prompt (PR1)

- [ ] C1.1 — Change de OpenSpec `fase-08b-comportamiento-agente` (proposal, delta `agente`, design,
  tasks) para aprobación del dueño. Ruta: D
- [ ] C1.2 — Reglas de estilo en `reglas.v1.md` (nueva versión): sin emojis, tono, viñetas y listas cortas
  cuando ayuden, sin pegotes. Ruta: I
- [ ] C1.3 — No citar el SKU: quitarlo de lo que ven el modelo y el catálogo compacto, dejarlo solo como
  clave interna de búsqueda; mostrar nombre con atributos. Ruta: D
- [ ] C1.4 — Evals guionados nuevos (sin emojis, sin SKU, estructura) con negativos. Ruta: D
- [ ] C1.5 — `[manual]` Corrida real de evals con el prompt nuevo en `gpt-5.6-luna` y en el candidato;
  registrar costo y elegir el modelo principal (EVL3, ADR-0002). Ruta: manual (clave del dueño)

### Slice 2 — Fotos (PR2)

- [ ] C2.1 — Enmienda de R13/AGT9 en el delta de `agente` y `conversaciones`: una foto por defecto, más
  bajo demanda. Ruta: D
- [ ] C2.2 — `enviar_fotos`: por defecto la foto principal; «más fotos» envía las demás, una por mensaje;
  descripción de la herramienta y `reglas` actualizadas. Ruta: D
- [ ] C2.3 — Pie de foto (`leyenda`) = nombre con atributos + `precio_texto`, tomado del backend (R2).
  Ruta: D
- [ ] C2.4 — Importador: sin collage automático, u opcional y desactivado por defecto (P44); ajustar
  `medios`/`catalogo`. Ruta: D
- [ ] C2.5 — Tope de fotos según P43; actualizar `r13-collage.json`, `enviar-fotos.spec.ts`,
  `obtener-fotos-producto.spec.ts` y el e2e. Ruta: D
- [ ] C2.6 — Verificación real por WhatsApp (solo en la máquina del dueño). Ruta: manual

### Slice 3 — Prompts en base de datos (PR3)

- [ ] C3.1 — ADR: prompts editables (alternativas: `parametro` clave/valor vs tabla con versionado; P45).
  Ruta: D
- [ ] C3.2 — Spec del dominio `agente`: lectura con respaldo al `.md`, caché con invalidación, prefijo
  estable (AGT13). Ruta: D
- [ ] C3.3 — Implementación con TDD, y migración solo si el dueño decide tabla nueva. Ruta: D
- [ ] C3.4 — Evals sobre el prompt leído de la base (EVL3). Ruta: D

## Criterios de aceptación

- Ninguna respuesta del bot contiene emojis ni el SKU (evals con negativos).
- Con una consulta de producto, sale una sola foto con pie de foto (nombre con atributos y precio); ante
  «más fotos» salen las demás, cada una con su pie.
- Todo precio en el pie sale de `precio_texto` (R1/R2); ningún número inventado.
- Un prompt editado en la base se aplica sin desplegar y, si falta, rige el `.md` versionado.
- Corrida real de evals por encima del umbral con el modelo elegido (EVL3).

## Checks

| Etapa | Check |
|---|---|
| Por tarea | RED observado → GREEN → REFACTOR; `npm test` y fronteras |
| Por slice | `npm run verify`; `npm run test:integracion`, `npm run test:e2e`, `npm run evals` (Docker para integración/e2e) |
| Cierre de slice 1 y 2 | Corrida real de evals (`EVALS_MODO=real`, `--testTimeout=1500000`, ~4-5 min) |
| Documentación | Enlaces y rutas existen; sin secretos ni ids |

## Preguntas abiertas

P43 (tope de fotos), P44 (collage del importador), P45 (prompts en BD) en `docs/PREGUNTAS_ABIERTAS.md`.
Además, que el dueño apruebe la 08b y la partición de la 09 en `docs/fases/README.md`.

## Progreso

- 2026-10-01: documento creado con las decisiones del dueño y la evidencia de código. Sin commit.

## Próximo paso

Antes de C1.1, en este orden: fusionar los PRs abiertos (`docs/CONTEXTO_SESIONES.md`), verificar el flujo
real por WhatsApp y decidir el modelo con los evals. Luego el dueño aprueba la 08b y se redacta el change.
