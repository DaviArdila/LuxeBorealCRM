# Proposal: Fase 07b — Agente con LLM y las 7 herramientas

- Change: `fase-07b-agente-llm-herramientas` · Fase de la hoja de ruta: **07b** (segunda de tres partes
  de la Fase 07) · Rama: `fase-07b-agente-llm-herramientas`
- Fecha: 2026-09-29 · Estado: **spec en revisión**
- Depende de: **07a cerrada** (contrato del turno, pipeline, handoff, guardia por paso) más Fases 00a-06
  y `politicas-contraentrega`.
- Análisis de la fase completa: `openspec/changes/fase-07a-turno-y-politicas/exploration.md`.

## Intent

Con 07a el turno ya sabe de tipos, handoff y políticas, pero el contenido sigue siendo un eco. Esta
parte pone el **LLM** en el último paso del pipeline: un bucle de herramientas que no conoce nombres
(**A4**), las 7 herramientas sobre los casos de uso que ya existen (catálogo, cotización, políticas,
fotos, contacto) más dos casos de uso nuevos de catálogo, historial corto, prompt versionado, salida
de imágenes por Chatwoot, y el mapeo de cualquier fallo del LLM a un traspaso con texto de cortesía.

Éxito: por webhook firmado (e2e, LLM falso programado), el cliente pregunta por un producto y recibe la
ficha en un solo mensaje, cotiza un envío con la política de contra entrega, recibe el collage como
imagen, deja sus datos, y un fallo o techo del LLM lo pasa a un asesor con el texto correcto.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| 7 herramientas | `buscar_producto`, `obtener_ficha`, `cotizar_envio`, `enviar_fotos`, `marcar_lead_caliente`, `guardar_datos_contacto`, `consultar_politica` | **R1**, `openspec/specs/agente/spec.md` |
| Recargo contra entrega | Nunca como porcentaje; políticas citadas literal | **R2**, CAT12 |
| Cuándo citar una política | Solo cuando preguntan por envío o pago, o al confirmar el pedido, una vez | `politicas-contraentrega` (va al prompt; se evalúa en 07c) |
| LLM | `LLM_PORT` (gateway de la Fase 06), perfil `conversacion`, sin SDK fuera de `llm/infraestructura` | ADR-0002, ADR-0014 |
| Composición | ADR-0016 (07a) | — |
| Entrega / review | `auto-chain` `stacked-to-main`, ~400 líneas; RDD por commit; `judgment-day` no obligatorio | `CLAUDE.md` |

## Scope

### In Scope

1. **Salida de imagen**: `MensajeSaliente` `imagen` con la clave del objeto; el publicador lee los
   bytes de `medios` y sube el adjunto multipart a Chatwoot con reconciliación idempotente.
2. **Bucle de herramientas** con efectos tipados, plazo del turno (ADR-0018) y mapeo de errores.
3. **`LlmModule` cableado** por `AgenteModule`; `ObtenerMensajeTechoGasto` exportado; `plazoMs` en
   `SolicitudGeneracion` (LLM14).
4. **Historial** en Redis por sesión (ADR-0017).
5. **Herramientas de consulta**: `buscar_producto` (caso de uso nuevo `BuscarProductos`),
   `obtener_ficha`, `cotizar_envio`, `consultar_politica`.
6. **`enviar_fotos`** (caso de uso nuevo `ObtenerFotosProducto`): collage por defecto, individuales
   con tope por sesión.
7. **`guardar_datos_contacto`** escribe `contacto`; **`marcar_lead_caliente`** registra la propuesta
   por un puerto cuya implementación de la 07 nunca deriva (la escala es de la Fase 08).
8. **Contexto inicial**: SKU prellenado, SKU inexistente, cliente conocido por nombre.
9. **Prompt versionado** (`agente/prompts/*.md`) con prefijo estable y la regla de citar políticas.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Evals, set dorado, corrida real, modelos de respaldo | 07c | Necesitan este agente completo |
| Escala determinista, `INSERT` en `lead`, derivación por lead, "pide persona" sin LLM, captura fuera de horario, Telegram | 08 | **R9-R11** |
| Atributos de contacto en Chatwoot, etiquetas `lead-caliente` | 08 | Van con la derivación |
| Endpoints | — | Ninguno |

## Qué se migra del prototipo

| Prototipo | Decisión | Destino | Motivo |
|---|---|---|---|
| `motor/bucleHerramientas.ts` | Rediseñar | `agente/aplicacion/bucle-herramientas.ts` | **A4** (caso especial de `enviar_fotos` → efecto tipado); plazo del turno |
| `tools/buscarProducto.ts` | Rediseñar | `catalogo/aplicacion/buscar-productos.ts` + envoltorio | La búsqueda es del catálogo |
| `tools/obtenerFicha.ts`, `cotizarEnvio.ts` | Conservar (contrato) | Envoltorios en `agente` | Lógica ya migrada en Fase 02 |
| `tools/enviarFotos.ts` | Rediseñar | `catalogo/aplicacion/obtener-fotos-producto.ts` + envoltorio | **A4**, **A14** |
| `tools/guardarDatosContacto.ts` | Rediseñar | Envoltorio + `REPOSITORIO_CONTACTO_AGENTE` | **P1**: por id de contacto |
| `tools/marcarLeadCaliente.ts` | Rediseñar (herramienta) / Posponer (escala) | Puerto `EVALUADOR_LEAD` | **R9** es de la 08 |
| `motor/contextoInicial.ts` | Conservar la regla | `agente/aplicacion/contexto-inicial.ts` | SPEC prototipo §3.3, §3.7 |
| `motor/systemPrompt.ts` | Rediseñar | `agente/prompts/sistema.v1.md` + ensamblador | ADR-0002 (prefijo estable) |
| `estado/historial.ts` | Rediseñar | `agente/infraestructura/redis/historial-redis.ts` | ADR-0017 |
| `chatwoot/chatwootClient.real.ts` (multipart) | Rediseñar | `canales/infraestructura/chatwoot` | Adjuntos por outbox (ADR-0004) |
| Tests `tools/*` (26), `argumentosInvalidos` (1), `casosEntrada` (3) | Rediseñar (se reescriben, no se copian) | Unitarios + integración + e2e | Regla de migración |

## Capabilities

### Modified Capabilities

- `agente`: ADDED AGT4-AGT13.
- `catalogo`: ADDED CAT13 (búsqueda), CAT14 (fotos para enviar).
- `medios`: ADDED MED10 (leer un objeto).
- `canales`: MODIFIED CAN6 (enviar imagen); ADDED CAN10 (reconciliación de imagen).
- `conversaciones`: ADDED CNV10 (pasos de imagen por el punto único de salida).
- `llm`: ADDED LLM14 (plazo del llamador).

## Approach

Nueve tareas: imagen de extremo a extremo en la salida → bucle + LLM → historial → herramientas de
consulta (dos tareas) → fotos → contacto/lead/contexto → prompt → e2e y cierre. TDD estricto con Vitest;
LLM siempre falso (`FakePuertoLlm`) o el simulador OpenRouter; nunca la API real en CI. Entrega en 7 PRs
apilados (~2.750 líneas).

## Affected Areas

| Área | Impacto |
|---|---|
| `src/modulos/agente/` | Bucle, herramientas, historial, contexto, prompts |
| `src/modulos/catalogo/` | `BuscarProductos`, `ObtenerFotosProducto`, método `listarFotos` del repositorio |
| `src/modulos/medios/` | `Almacenamiento.leer` |
| `src/modulos/canales/` | Imagen en salida, outbox, adaptador multipart; importa `medios` |
| `src/modulos/conversaciones/` | `PasoRespuesta` imagen → `MensajeSaliente` imagen |
| `src/modulos/llm/` | `plazoMs`, `ObtenerMensajeTechoGasto` |
| `nest-cli.json` | `assets` para `agente/prompts/*.md` |
| `src/plataforma/config/esquema.ts` | `AGENTE_MAX_VUELTAS`, `AGENTE_HISTORIAL_TURNOS`, `AGENTE_FOTOS_INDIVIDUALES_MAX` |
| `prisma/`, `openapi/` | Sin cambio |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Chatwoot no guarda `content_attributes.luxe_clave` en un mensaje multipart → la reconciliación de imágenes no funciona | Media | Verificación `[manual]` en T1 contra el Chatwoot local de `infra/chatwoot`; respaldo: la marca va en el nombre del archivo adjunto y se reconcilia por él (CAN10) |
| Los `.md` de prompts no llegan a `dist/` | Alta si se olvida | `nest-cli.json` `assets` + test que arranca desde `dist/` (T8) |
| El bucle deriva de más por plazo en la corrida real | Media | Plazo y vueltas por configuración; medir en 07c |
| Salida de imagen (PR1, T1), bucle + LLM (PR2, T2) y historial + búsqueda (PR3, T3+T4) superan ~400 líneas por naturaleza (TDD estricto, ~60 % tests) | Alta | `size:exception` automática citando esta fila para PR1, PR2 y PR3; las demás preguntan si exceden |
| Escribir `contacto` desde el agente adelanta una pieza de `contactos` | Baja | Puerto propio del agente con solo los campos de captura; la 08 puede moverlo a su módulo sin cambiar la herramienta |
| El LLM inventa una condición o un precio | Media | Reglas en el prompt + auditoría por log (`agente.dinero-sin-rastro`, sin contenido) + evals en 07c |

## Rollback Plan

Revertir la cadena. Si hace falta volver al comportamiento de 07a sin revertir, el motor admite la
política de contenido provisional (eco) por configuración de composición en `AgenteModule`. Sin esquema.

## Dependencies

- 07a cerrada.
- Chatwoot local (`infra/chatwoot`) para la verificación `[manual]` de multipart (T1).
- Ninguna clave real de OpenRouter: todo con dobles y simulador.

## Preguntas abiertas

| # | Pregunta | Bloquea | Recomendación |
|---|---|---|---|
| P27 | Ubicación (ver 07a) | Escenario de ubicación | Marcador "ubicación compartida" + el bot pide ciudad/departamento |
| P31 | Texto de `mensaje_error_llm` | No | Texto del prototipo: «Ya te respondemos en un momento.» (en uso real) |

## Success Criteria

- [ ] El LLM recibe exactamente las 7 definiciones de herramientas y el bucle no conoce sus nombres.
- [ ] Ficha en un mensaje, cotización con política, collage como imagen, datos guardados (e2e).
- [ ] Error de pasarela → handoff con `mensaje_error_llm`; techo → `mensaje_techo_gasto`.
- [ ] Ningún turno supera el plazo (25 s con la config actual) ni 5 vueltas.
- [ ] `npm run verify` y `npm run test:e2e` en verde; cada escenario con su test `<id> — <título>`.
