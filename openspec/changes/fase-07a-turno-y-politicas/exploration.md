# Exploración: Fase 07 — Agente (análisis de toda la fase)

- Fecha: 2026-09-29 · Rama de planeación: `docs/fase-07-planeacion`
- Alcance: este documento analiza la **Fase 07 completa**. La fase se parte en tres changes
  (`fase-07a-turno-y-politicas`, `fase-07b-agente-llm-herramientas`, `fase-07c-evals`); los otros dos
  remiten aquí en vez de repetir el análisis.
- Fuentes leídas: `SPEC.md`, `CLAUDE.md`, skills `luxeboreal-fases` y `luxeboreal-arquitectura`,
  `openspec/config.yaml`, `docs/fases/README.md`, `docs/migracion/inventario.md`,
  `docs/analisis/{01,04,05}`, `docs/PREGUNTAS_ABIERTAS.md`, `docs/adr/` (0002, 0003, 0004, 0005, 0013,
  0014), `MODELO_DATOS.md`, las specs vigentes de `agente`, `conversaciones`, `llm`, `catalogo`,
  `canales`, `leads`, `horario`, `medios`, `configuracion-negocio` y `privacidad`, los changes
  archivados de las Fases 05 y 06 y de `politicas-contraentrega` (con sus `verify-report.md`), el
  código de `src/modulos/*` (vía CodeGraph) y el prototipo `../ChatLuxeCRM` (`src/motor/*`,
  `src/tools/*`, `src/leads/*`, `src/estado/*` y sus tests).

## Resumen en cinco líneas

1. Todo lo que el agente necesita **debajo** ya existe: catálogo con ficha/cotización/políticas, horario,
   medios con collage, pasarela LLM con fallback y techo, canal Chatwoot con outbox, máquina de estados.
2. Lo que falta es el **agente** y, sobre todo, el **contrato entre el turno y el agente**: hoy el
   generador solo recibe `{idMensaje, texto}` y solo devuelve texto; no hay handoff, imagen, tipo de
   contenido, historial ni conversación.
3. Hay 14 inconsistencias (tabla abajo); 4 son de texto y se corrigen ya; 10 se resuelven en los changes.
4. La fase supera los límites de `luxeboreal-fases` §4 (≈ 22 tareas, verificación con "y además…"):
   se parte en **07a** (turno y políticas deterministas), **07b** (LLM y herramientas) y **07c** (evals).
5. Se proponen 3 ADR (0016 composición agente↔conversaciones, 0017 historial en Redis por sesión,
   0018 presupuesto de tiempo del turno) y 6 preguntas nuevas (P27-P32), ninguna bloquea 07a salvo P27.

## 1. Qué dejaron las fases cerradas y qué consume la 07

| Fase | Qué dejó (verificado en el código) | Cómo lo usa la 07 |
|---|---|---|
| 00a/00b | `Clock`, config Zod, logger con redacción, fronteras (14 reglas), Vitest `unit`/`integracion`/`e2e` | Todo el código nuevo; una regla de fronteras nueva (15) |
| 01 | Tablas `contacto`, `lead`, `conversacion` (con `version`), `parametro` jsonb, `uso_llm` | `contacto` para datos capturados y cliente conocido; `lead` queda para la 08 |
| 02 | `ObtenerFichaProducto`, `CotizarEnvio`, `ListarProductosActivos`, `ObtenerCatalogoCompacto` (caché por versión), puerto `HORARIO` | Envoltorio de las herramientas; texto de handoff según horario |
| 03 | `MediosModule` (`ALMACENAMIENTO`: `guardar`/`obtenerUrl`/`eliminar`), `producto.clave_collage`, `foto.clave_archivo` | `enviar_fotos`; falta leer los bytes para subirlos a Chatwoot |
| 04 | `SALIDA_CANAL` sobre outbox (solo texto), `LECTOR_MENSAJE_CANAL`, `perfilDeCapacidades` (no exportado), `EventoCanal.tipoContenido` | Salida de imagen, capacidades por canal, tipo de contenido |
| 05 | FSM, debounce, lock (30 s, sin heartbeat), buffer, `GENERADOR_RESPUESTA → AgenteEco`, `EnviarRespuestaTurno` (relee una vez por lote), rate limit, aviso de espera | El agente reemplaza al eco; la 07 amplía el contrato y resuelve la relectura por paso (aprendizaje 4 de su `verify-report.md`) |
| 06 | `LLM_PORT` (gateway con timeout 15 s, presupuesto por llamada = lock − 5 s, fallback, circuito, techo), `FakePuertoLlm`, simulador OpenRouter; `LlmModule` **sin** registrar | Bucle de herramientas; mapeo de errores a handoff; texto `mensaje_techo_gasto` |
| `politicas-contraentrega` | `ConsultarPolitica` (CAT12), `politica_contraentrega_texto` en la cotización, ficha sin recargo | Séptima herramienta `consultar_politica`; regla de cuándo citar |

Deudas heredadas que la 07 debe atender (de los `verify-report.md`):

| Deuda | Origen | Dónde se atiende |
|---|---|---|
| `EnviarRespuestaTurno` relee el estado una vez por lote, no por mensaje (R5) | Fase 05, aprendizaje 4 ("la Fase 07 MUST resolverlo") | 07a, T3 (guardia de envío por paso) |
| Pérdida del buffer si el generador falla a mitad de turno | Fase 05, WARNING | 07b: el bucle nunca lanza hacia `ProcesarTurno`; todo fallo del LLM termina en handoff con texto (AGT6) |
| `LlmModule` fuera de `AppModule`; falta caso de uso para `mensaje_techo_gasto` | Fase 06, pendiente 5 | 07b, T2 |
| W1 presupuesto vs backoff; S2 408/409 | Fase 06 | W1 ya corregido (`68f418d`); la 07 agrega el **plazo del turno** (LLM14) |
| Defaults de recargo 0 % y fuera de cobertura | Fase 02 | Resuelto por `politicas-contraentrega` (ficha sin recargo, texto sin promesa) |

## 2. Qué falta (brechas concretas)

| Brecha | Evidencia |
|---|---|
| El generador no recibe tipo de contenido, conversación, contacto, canal ni capacidades | `src/modulos/conversaciones/puertos/generador-respuesta.ts:4-23` |
| El consumidor descarta `tipoContenido` y arma `texto ?? ''` | `src/modulos/conversaciones/aplicacion/consumidor-conversaciones.ts:124-126` |
| La respuesta no puede pedir handoff ni enviar imagen | `generador-respuesta.ts:9-11`, `salida-conversacion.ts:2-5` |
| `MensajeSaliente` solo admite texto | `src/modulos/canales/puertos/salida-canal.ts:18-19` |
| `Almacenamiento` no permite leer un objeto | `src/modulos/medios/puertos/almacenamiento.ts:10-17` |
| Una respuesta sin pasos lanzaría (`SalidaCanalOutbox` rechaza 0 mensajes) | `src/modulos/canales/aplicacion/salida-canal-outbox.ts:35-40` |
| Ninguna transición se espeja en Chatwoot (el prototipo sí: bot ↔ `pending`, humano/handoff ↔ `open`) | `transicionar-conversacion.ts` completo vs `../ChatLuxeCRM/src/estado/maquinaEstados.ts:99-106` |
| No hay búsqueda de productos ni caso de uso de fotos | `src/modulos/catalogo/index.ts` (solo listado, ficha, cotización, compacto, políticas) |
| No hay repositorio de contacto fuera de `obtenerOCrear` | `repositorio-conversacion.ts:37-41`; aprendizaje 2 de la Fase 05 |
| No hay módulo `agente`, ni prompts, ni historial, ni evals | `src/modulos/` |
| El plazo del gateway es por llamada; el bucle hace varias llamadas | `src/modulos/llm/aplicacion/llm-gateway.ts:49,122-126` |

## 3. Inconsistencias encontradas y cómo se corrigen

| # | Inconsistencia | Dónde (ruta:línea) | Corrección | Estado |
|---|---|---|---|---|
| I1 | R1 dice "6 herramientas"; la spec vigente ya dice 7 | `SPEC.md:77` vs `openspec/specs/agente/spec.md:14-16` | Texto → 7 | **Corregido** (`SPEC.md:77`, verificado en disco) |
| I2 | Propósito de la spec `agente` dice "6 herramientas" | `openspec/specs/agente/spec.md:6` | Texto → 7 | **Corregido** (verificado en disco) |
| I3 | Propósito de la spec `llm` dice "las 6 herramientas" | `openspec/specs/llm/spec.md:26` | Texto → 7 | **Corregido** (verificado en disco) |
| I4 | Fila 07 de la hoja de ruta ("6 tools") e inventario (`tools/*` "6 tools") | `docs/fases/README.md:66`, `docs/migracion/inventario.md:48` | Fila 07 partida en 07a/07b/07c; inventario → 6 del prototipo + `consultar_politica`, filas de la 07 apuntan a 07a/07b/07c | **Corregido** (verificado en disco) |
| I5 | CNV6 promete que la 07 reemplaza el eco "sin cambiar el contrato del puerto", pero el contrato actual no alcanza (sin handoff, imagen ni tipo) | `openspec/specs/conversaciones/spec.md:268-271` | MODIFIED CNV6 en 07a | Delta 07a |
| I6 | R12: el requisito dice "segundo audio del mismo **contacto**", el escenario dice "en la misma **conversación**"; el prototipo cuenta por número con TTL de 1 h y reinicia con texto | `openspec/specs/agente/spec.md:97-114`, `../ChatLuxeCRM/src/estado/contadorAudio.ts` | MODIFIED R12: por sesión de la conversación, se reinicia con un texto | Delta 07a |
| I7 | R12: "la ubicación puebla ciudad/departamento del contacto", pero el prototipo **nunca lo hizo** (guarda lat/lon en el buffer y el motor los ignora) y exige geocodificación inversa | `agente/spec.md:122-127`; `../ChatLuxeCRM/src/motor/motor.ts:67-70` (solo une textos) | P27 + MODIFIED R12 con la recomendación | Delta 07a, **P27** |
| I8 | La Fase 05 no espeja el estado en Chatwoot: un handoff quedaría invisible en la bandeja (la conversación sigue `pending`) y una vuelta por TTL deja `open` | `transicionar-conversacion.ts`; `../ChatLuxeCRM/src/estado/maquinaEstados.ts:99-106` | ADDED CNV8 (espejo) en 07a | Delta 07a |
| I9 | R5 exige relectura por mensaje; la implementación relee una vez por lote | `enviar-respuesta-turno.ts:27-37`; verify-report Fase 05 §aprendizaje 4 | ADDED CNV9 + CAN9 (guardia de envío en el publicador) | Delta 07a |
| I10 | El principio 7 dice que el agente lee el perfil de capacidades, pero `perfilDeCapacidades` no sale del barril de `canales` y la regla 13 impide que `agente` importe `canales` | `src/modulos/canales/index.ts`; `.dependency-cruiser.cjs:153-166` | `conversaciones` traduce el perfil a capacidades del turno (CNV7) | Delta 07a |
| I11 | El canal `otro` (inbox local de pruebas) da perfil "no soportado"; el agente no tendría capacidades | `src/modulos/canales/dominio/perfil-capacidades.ts:52-55` | Perfil no soportado → capacidades conservadoras (cuesta por mensaje, admite imagen) | Design 07a D5 |
| I12 | El tope de 4 fotos individuales es "por conversación" en el SPEC del prototipo pero "por turno" en su código | `../ChatLuxeCRM/src/tools/enviarFotos.ts:62` vs `bucleHerramientas.ts:106-109` | Por sesión bot (AGT9) | Delta 07b |
| I13 | `MODELO_DATOS.md` §3 "Claves conocidas" no lista las claves ya usadas por las Fases 05-06 (`mensaje_espera_handoff`, `mensaje_techo_gasto`, `llm_techo_mensual_usd`, `llm_estado_techo`); el registro del importador solo valida 3 claves y las de texto generan advertencia | `MODELO_DATOS.md:121-124`; `src/modulos/catalogo/dominio/validar-catalogo.ts:467-471` | Lista de claves: **corregida** (texto). El registro del importador no se toca en la 07 (las advertencias son inocuas; el reemplazo del importador es ADR-0015) | **Corregido (texto)**: `MODELO_DATOS.md` §3 lista las 4 claves; resto anotado |
| I14 | R14 exige el aviso de asistente automatizado en el primer mensaje, pero el prototipo lo delegaba al LLM ("inclúyelo de forma natural"), sin garantía | `openspec/specs/privacidad/spec.md:14-29`; `../ChatLuxeCRM/src/motor/systemPrompt.ts:31-38` | ADDED AGT2: prefijo determinista en el primer turno | Delta 07a |

Inconsistencias que **no** se corrigen, a propósito: `docs/analisis/01-analisis-chatluxecrm.md:33,49` y
`docs/analisis/02-investigacion.md:25,89` dicen "6 tools" porque describen el prototipo (que sí tenía
6) y el análisis de ese momento; reescribirlos falsearía el registro histórico.

## 4. Qué se migra del prototipo (criterio de `luxeboreal-fases` §3)

| Prototipo (`../ChatLuxeCRM/src/…`) | Decisión | Change | Motivo |
|---|---|---|---|
| `motor/enrutadorTipoMensaje.ts` (audio/imagen/ignorar) | **Rediseñar** | 07a | Regla visible al cliente (se conserva); pasa a una política del pipeline (**A5**); textos por defecto a parámetros (**R15**) |
| `estado/contadorAudio.ts` | **Rediseñar** | 07a | Clave por sesión de conversación, no por número (**P1**, I6) |
| Tope de 12 turnos (`motor.ts:80-87`, `historial.contarTurnos`) | **Rediseñar** | 07a | Política propia; cuenta por sesión bot (**P29**) |
| `mensajeHandoff(dentroHorario)` (`motor.ts:27-38`) | **Conservar** (regla) | 07a | Texto por horario; defaults a parámetros (**A5**) |
| `derivarAHumano` + espejo de status (`leads/derivar.ts:60-67`, `maquinaEstados.ts:99-106`) | **Rediseñar** | 07a | La transición la ejecuta `conversaciones` (**A3**: el agente pide, no transiciona) |
| `motor/motor.ts` (orquestador) | **Rediseñar** | 07a/07b | **A5**: pipeline de políticas explícitas |
| `motor/bucleHerramientas.ts` | **Rediseñar** | 07b | **A4**: el bucle no conoce nombres; efectos tipados; plazo del turno (ADR-0018) |
| `tools/buscarProducto.ts` | **Rediseñar** | 07b | Lógica pura portada a `catalogo` (CAT13); envoltorio en `agente` |
| `tools/obtenerFicha.ts`, `tools/cotizarEnvio.ts` | **Conservar** (contrato) | 07b | La lógica ya migró en la Fase 02; solo el envoltorio. El recargo ya no se cita (**R2** vigente) |
| `tools/enviarFotos.ts` | **Rediseñar** | 07b | **A4** (caso especial en el bucle) → efecto `EnviarImagen`; **A14** (ruta local) → clave de objeto |
| `tools/guardarDatosContacto.ts` | **Rediseñar** | 07b | Escribe `contacto` por su id, no por número (**P1**) |
| `tools/marcarLeadCaliente.ts` | **Rediseñar** (parcial) + **posponer** escala | 07b / 08 | La herramienta y su contrato llegan en 07b; la escala determinista, el `INSERT` en `lead` y la derivación son de la Fase 08 (**R9**) |
| `motor/contextoInicial.ts` (SKU prellenado, cliente conocido) | **Conservar** (regla) | 07b | SPEC prototipo §3.3 y §3.7 |
| `motor/systemPrompt.ts` | **Rediseñar** | 07b | `.md` versionados, prefijo estable (ADR-0002); `aviso_datos` sale del prompt (I14) |
| `motor/catalogoCompacto.ts` | Ya migrado | — | Fase 02 (`ObtenerCatalogoCompacto`) |
| `estado/historial.ts` | **Rediseñar** | 07b | Redis por sesión (ADR-0017); nunca Postgres (**P3**) |
| `leads/senales.ts`, `calificar.ts`, `capturaFueraHorario.ts`, `derivar.ts` (aviso) | **Posponer** | 08 | **R9-R11** son de la Fase 08 |
| `webhook/parseEvent.ts` (lat/lon de ubicación) | **Descartar** (por ahora) | — | Nadie los usaba (I7); depende de **P27** |
| Captura fuera de horario en el prompt (`systemPrompt.ts:41-56`) | **Posponer** | 08 | **R10** |
| `tests/motor/mensajeNoTextual.test.ts` (3) | Reescribir | 07a | Unitario de la política + e2e |
| `tests/estado/handoffExplicito.test.ts` (1) | Reescribir (solo la parte de transición) | 07a | La detección "pide persona" es de la 08 |
| `tests/motor/argumentosInvalidos.test.ts` (1) | Reescribir | 07b | Unitario del bucle |
| `tests/tools/*` (26) | Reescribir | 07b | `formateoDinero` y la lógica de cotización ya están cubiertos en Fase 02 |
| `tests/motor/casosEntrada.test.ts` (3) | Reescribir | 07b (unitario) y 07c (evals) | Los 3 casos de entrada |
| `tests/motor/catalogoCompacto.test.ts` | Ya migrado | — | Fase 02 |
| `tests/leads/calificar.test.ts`, `tests/estado/fase3Flujos.test.ts` | Posponer | 08 | Escala y captura |

## 5. Decisiones propuestas (resumen; el detalle está en cada `design.md`)

| # | Decisión | Recomendación | Alternativa descartada | Dónde |
|---|---|---|---|---|
| 1 | Leads y contacto en la 07 | `guardar_datos_contacto` **escribe** `contacto` ya en 07b (barato, y el contexto inicial necesita leer `contacto.nombre` de todas formas); `marcar_lead_caliente` solo registra la **propuesta** por un puerto `EVALUADOR_LEAD` cuya implementación de la 07 nunca deriva; la 08 pone la escala, el `INSERT` en `lead` y la derivación | Escribir `lead` ya en la 07: sin la escala determinista no se puede llenar `temperatura`/`derivado` con su significado de `MODELO_DATOS.md` §5, y quedarían filas que la 08 tendría que reinterpretar | 07b D6 |
| 2 | Contrato ampliado de `GeneradorRespuesta` | Entrada: `{ contexto, mensajes }` con tipo de contenido, ids, canal, versión de la conversación y capacidades; salida: pasos `texto`/`imagen` + `handoff?` con motivo. `conversaciones` ejecuta el handoff con `TransicionarConversacion` | Que el agente transicione: rompería **R6** (el agente no debe tocar la FSM) y crearía un ciclo | 07a D1-D3 |
| 3 | Dirección de dependencias | `agente → conversaciones` (tipos y token en `conversaciones`); `AppModule` compone con `ConversacionesModule.conGenerador(AgenteModule)` | Registro en `onModuleInit` (patrón de `canales`): sirve para eventos, no para un puerto de petición/respuesta; o `conversaciones → agente`: invierte el puerto | **ADR-0016**, 07a D4 |
| 4 | Dónde se decide R12 | En el turno (después del debounce y bajo el lock), como política del agente; contador en Redis del agente por sesión | Antes del buffer en el consumidor: dos respuestas por ráfaga, fuera del lock, y el consumidor tendría textos al cliente | 07a D6 |
| 5 | Historial | Redis del agente, clave por sesión bot (`conversacionId` + `version`), 6 turnos, TTL 7 días | API de Chatwoot por turno: +1 llamada HTTP en el camino crítico, mezcla notas privadas y humanos, y falla si Chatwoot cae; reconstruir del buffer: el buffer se vacía en cada turno | **ADR-0017**, 07b D3 |
| 6 | Tiempo del bucle frente al lock de 30 s | Plazo del turno compartido = `LOCK_TURNO_TTL_S − 5 s` (25 s), tope de 5 vueltas; cada llamada al LLM recibe el plazo restante (LLM14); agotado → handoff con `mensaje_error_llm` | Subir el lock a 60-90 s (retrasa todo turno fallido) o heartbeat del lock (más piezas móviles, y el turno igual superaría el p95 < 20 s de `SPEC.md` §5) | **ADR-0018**, 07b D2 |
| 7 | Búsqueda y fotos | Casos de uso nuevos en `catalogo` (`BuscarProductos`, `ObtenerFotosProducto`); salida de imagen por el outbox con la **clave** del objeto, el publicador lee los bytes de `medios` y sube multipart a Chatwoot | Filtrar en el agente (reparte lógica del catálogo); URL firmada en el mensaje (Chatwoot no adjunta desde URL) | 07b D4-D5 |
| 8 | Prompts y evals | `agente/prompts/*.md` versionados, copiados al build; prefijo estable reglas → herramientas → catálogo; evals con LLM guionado en CI y modo real bajo demanda; set dorado `[manual]` | Prompt en código TS (sin diff legible); evals solo con LLM real (cuestan y no son deterministas) | 07b D8, 07c D2-D8 |
| 9 | Cableado | `LlmModule`, `CatalogoModule`, `HorarioModule`, `MediosModule` entran por `AgenteModule`; `LlmModule` exporta `ObtenerMensajeTechoGasto` | Registrar cada módulo en `AppModule` por separado | 07a D4, 07b D2 |
| 10 | Tamaño | Tres changes verticales (abajo) | Un solo change de ~22 tareas | §6 |

## 6. Tamaño y partición

Conteo honesto de la fase completa: ~22 tareas, 1 módulo nuevo (`agente`) más cambios en 6 módulos
existentes, y una verificación de salida con cuatro "y además…" (contrato, herramientas, prompts,
evals). Supera las cuatro señales de `luxeboreal-fases` §4. Partición por capa vertical probable sola:

| Change | Qué se puede probar al cerrar | Tareas |
|---|---|---|
| `fase-07a-turno-y-politicas` | Por webhook firmado (e2e): audio → pide texto; segundo audio → `handoff_pendiente` y Chatwoot `open`; imagen → pide descripción; sticker → nada; texto → eco con aviso de datos en el primer turno; tope de turnos → handoff. Sin LLM | 7 |
| `fase-07b-agente-llm-herramientas` | Por webhook firmado (e2e, LLM falso): el bot busca, da ficha, cotiza con política, manda collage como imagen, guarda datos y deriva por fallo o techo del LLM | 9 |
| `fase-07c-evals` | `npm run evals` en verde con LLM guionado (3 casos de entrada, R1/R2, R12, políticas) con umbral explícito; corrida real `[manual]`; set dorado `[manual]` | 5 |

Por qué este orden: 07a deja el contrato estable antes de construir encima (07b solo agrega políticas y
herramientas sin tocar `conversaciones` salvo la imagen), y 07c necesita el agente completo.

## 7. Riesgos principales

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Chatwoot no conserva `content_attributes.luxe_clave` en un mensaje multipart → la reconciliación de imágenes (D13 de la Fase 04) no funciona | Media | Verificación `[manual]` contra Chatwoot local al empezar 07b T1; respaldo: marca en el nombre del archivo adjunto |
| El espejo de estado a Chatwoot no se escribe en la misma transacción que la transición (el outbox no acepta transacción externa) | Media | Clave idempotente por versión; ventana de pérdida = caída entre dos `INSERT`; anotado como desviación de ADR-0004 |
| El turno con varias vueltas supera el plazo y deriva de más | Media | Tope de vueltas 5 y plazo 25 s; medir en la corrida manual (07c) y ajustar por configuración |
| Los `.md` de prompts no llegan a `dist/` con `nest build` | Alta si se olvida | `nest-cli.json` `assets` + test de arranque que carga el prompt |
| Set dorado con datos personales en el repo | Media | Anonimizador con test (07c) y P30 antes de extraer nada |
| El hook `PreToolUse:Agent` sigue bloqueando `sdd-apply` | Alta | Implementación directa del orquestador, como en 05 y 06 |
