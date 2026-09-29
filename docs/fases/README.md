# Hoja de ruta por fases

Este archivo es el **único lugar** donde vive el estado del proyecto y su tabla de fases. Cada fase
es un **change de OpenSpec** en `openspec/changes/fase-NN-<nombre>/`, producido por el ciclo
`sdd-new`/`sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive`
(skill `luxeboreal-fases`), creado **cuando le toca**, no antes: el change de una fase se escribe con
lo que se aprendió en la anterior (su `verify-report.md` archivado).

El ciclo de estados histórico de este archivo (`idea → spec en revisión → aprobada → en curso →
cerrada`) se mantiene como el vocabulario de la tabla de abajo y se mapea así sobre el ciclo SDD:

| Estado | Equivale a |
|---|---|
| `idea` | el change aún no existe |
| `spec en revisión` | `proposal.md` + `specs/` (delta) + `design.md` + `tasks.md` redactados (sdd-propose → sdd-spec → sdd-design → sdd-tasks) |
| `aprobada` | el usuario aprobó proposal + specs + design + tasks |
| `en curso` | `sdd-apply` en marcha; cada tarea de `tasks.md` cierra con su commit de unidad de trabajo |
| `cerrada` | `sdd-verify` + `sdd-archive` completos: el `verify-report.md` queda archivado y los delta specs se fusionaron en `openspec/specs/` |

## Reglas de las fases

1. **Corta**: una fase se implementa en 1-3 sesiones de trabajo. Si `tasks.md` pasa de ~10 tareas
   (límite de `openspec/config.yaml`), se parte en dos.
2. **Termina en algo que se puede probar**: un comando, un endpoint o un flujo verificable, con sus
   tests en verde. Nunca "infraestructura a medias".
3. **Solo depende de fases cerradas.** Nada de adelantar trabajo de una fase futura.
4. **Declara qué migra**: la `proposal.md` de cada fase incluye la tabla "Qué se migra del
   prototipo" (conservar/rediseñar/descartar/delegar/posponer, `openspec/config.yaml` §proposal) y
   lista los tests del prototipo que la fase reemplaza; al cerrar, esas filas se marcan migradas en
   `docs/migracion/inventario.md`.
5. **Ciclo de estados**: `idea → spec en revisión → aprobada → en curso → cerrada` (tabla de
   equivalencia arriba). Solo el usuario pasa un change a `aprobada`. Una fase `cerrada` tiene su
   `openspec/changes/archive/YYYY-MM-DD-fase-NN-<nombre>/verify-report.md` lleno con lo que pedía el
   antiguo "Registro de cierre" (§ "Cerrar la fase" de la skill `luxeboreal-fases`).
6. **Review**: las fases 04, 05, 06 y 10 cierran solo después de `judgment-day` (revisión ciega
   doble), además del RDD por commit.

## Mapa

```
00a Esqueleto ─▶ 00b CI y contrato ─▶ 01 Persistencia ─▶ 02 Catálogo ─▶ 03 Importador
                                                                             │
                                           04 Canal Chatwoot ◀┘
                                                  │
                                           05 Conversaciones ─▶ 06 Pasarela LLM ─▶ 07a Turno ─▶ 07b Agente LLM ─▶ 07c Evals ─▶ 08 Leads y handoff
                                                                                                                                       │
                                                                              09 Operación ◀───────────────────────────────────────────┘
                                                                                    │
                                                                              10 Corte (cutover)  ◀── aquí el prototipo se apaga
                                                                                    │
                                                       11 Usuarios/Auth ─▶ 12 Inventario ─▶ 13 Ventas y envíos ─▶ 14 API del back office
```

## Fases

| # | Fase | Objetivo (una frase) | Sale con… (verificación) | Estado |
|---|---|---|---|---|
| 00a | Esqueleto y verificación local | Esqueleto NestJS 12 con config validada (Zod), reloj inyectable, logger con redacción, `compartido/`, fronteras (dependency-cruiser), Vitest (ESM), health con Terminus (Postgres + Redis vía `schema.prisma` mínimo, sin modelos) y Docker Compose de desarrollo, en el repo propio ya iniciado | `npm run verify` en verde en local (lint, typecheck, fronteras, tests); `npm test` corre con Vitest; `GET /health` responde con Postgres y Redis arriba; primera tarea deja registrada la verificación de compatibilidad de dependencias clave con NestJS 12 (ADR-0001 enmienda) | cerrada |
| 00b | CI y contrato de API | Hook pre-push local (lint, typecheck, tests unitarios, commitlint, gitleaks) + workflow de GitHub Actions completo listo (activo al subir el repo), y el pipeline de contrato de API (ADR-0008/ADR-0010): `StandardSchemaValidationPipe` nativo (NestJS 12) + `@nestjs/swagger` generan `openapi/openapi.json` (público) y `openapi/openapi.interno.json` (completo), Scalar sirve `/docs` protegido fuera de desarrollo, `GET /health` entra al documento **interno**, excluido del público, errores RFC 9457 (ADR-0011), CHANGELOG con `git-cliff`. Depende de 00a | CI en verde local (pre-push) con el workflow de Actions escrito; `openspec/config.yaml` en `strict_tdd: true`; `npm run ci` completo en verde: lint, typecheck, `dependency-cruiser`, tests de integración (Testcontainers), `gitleaks`, `npm audit`, commitlint, deriva de los dos documentos + Spectral + oasdiff | cerrada |
| 01 | Persistencia | `PrismaService`, esquema de `MODELO_DATOS.md` v1 (UUID v7, sin teléfono como PK), migración inicial, semilla DANE, arnés de tests con base aislada | Migración aplicada desde cero; test de repositorio contra Postgres real; semilla DANE idempotente | cerrada |
| 02 | Catálogo | Lectura de productos, ficha con dinero formateado, cobertura por exclusión + rango aproximado de envío (ciudad → departamento → nacional), horario de atención | Tests del cálculo de envío y del horario portados del prototipo; caché con invalidación por versión | cerrada |
| 03 | Importador y medios | Importar catálogo desde Google Sheets + fotos a almacenamiento de objetos + collage | `npm run catalogo:importar -- --dir <fixtures>` deja el catálogo y las fotos listos; todo-o-nada | cerrada |
| 04 | Canal Chatwoot | Entrada por inbox de eventos (firma, dedupe, 200 rápido), salida idempotente por un puerto de canal, perfil de capacidades por canal, y verificar los puntos "?" del doc 04 | Evento firmado → registro en inbox → procesado una vez; envío con reintento → cero duplicados; fixtures de contrato = payloads reales de Chatwoot grabados del prototipo (anonimizados) | cerrada |
| 05 | Conversaciones | Máquina de estados bot/humano en Postgres, debounce, lock, eco humano, vencimientos, rate limit | Tests 6-9 y 15 del SPEC del prototipo §9 reescritos y en verde (con un "agente eco" como respuesta) | cerrada |
| 06 | Pasarela LLM | Puerto `LlmPort`, gateway con timeout/reintento/circuit breaker/costo y adaptador AI SDK sobre OpenRouter (GPT-5.6 Luna + modelos de respaldo) | Misma conversación contra 2 modelos cambiando solo configuración; fallback probado; registro en `uso_llm` | cerrada |
| 07a | Agente: turno y políticas deterministas (`openspec/changes/archive/2026-09-29-fase-07a-turno-y-politicas/`) | Contrato ampliado del turno (tipo de contenido, contexto, handoff), espejo del estado en Chatwoot, relectura por paso (R5), módulo `agente` con pipeline de políticas: mensajes no textuales (R12), tope de turnos por sesión (R13), aviso de asistente automatizado (R14). Sin LLM: el contenido sigue siendo un eco | E2E por webhook firmado: audio → pide texto; segundo audio → `handoff_pendiente` y Chatwoot `open`; imagen → pide descripción; sticker → nada; primer texto → eco con aviso de datos; tope de turnos → asesor | cerrada (verify y e2e en verde, 2026-09-29): `src/modulos/agente/` (pipeline, R12 en `politica-no-textuales.ts`, R13 en `politica-tope-turnos.ts`, aviso en `dominio/aviso-datos.ts`), E2E en `test/e2e/agente-politicas.e2e-spec.ts`; el e2e destapó y corrigió tres fallos de cableado de la 05 (ver `design.md`, D3/T7) |
| 07b | Agente: LLM y las 7 herramientas (`openspec/changes/fase-07b-agente-llm-herramientas/`) | Bucle de herramientas con efectos tipados y plazo del turno, las 7 herramientas sobre los casos de uso existentes (más búsqueda y fotos en `catalogo`), historial corto por sesión, prompt versionado, salida de imagen por Chatwoot, fallos del LLM → asesor. Depende de 07a cerrada | E2E por webhook con LLM falso: ficha en un mensaje, cotización con política de contra entrega, collage como imagen, datos guardados; fallo o techo del LLM → asesor con el texto correcto | spec en revisión |
| 07c | Agente: evals (`openspec/changes/fase-07c-evals/`) | `npm run evals` con LLM guionado en CI y modo real bajo demanda, aserciones deterministas con umbral explícito, set dorado anonimizado y elección de modelos de respaldo. Depende de 07b cerrada | `npm run evals` en verde con LLM guionado (3 casos de entrada, R1, R2, R12, políticas, sin traspaso sin señal fuerte) dentro de `npm run ci`; corrida manual con LLM real que alcanza el umbral; set dorado de conversaciones reales anonimizadas | spec en revisión |
| 08 | Leads y handoff | Escala determinista, derivación, captura fuera de horario, Telegram vía outbox, recordatorios | Tests 10-14 y 21 del prototipo reescritos; aviso real en Telegram | idea |
| 09 | Operación | Kill switch, observabilidad mínima (logs JSON con rotación, Sentry, Uptime Kuma), backups, imagen Docker de producción, despliegue en Dokploy | Stack de producción arriba en el VPS; restore de backup probado | idea |
| 10 | Corte | Modo sombra (~1 semana) antes del corte: el servicio nuevo recibe los mismos eventos por un segundo Agent Bot/webhook, genera respuestas sin enviarlas y compara decisiones (tools, traspasos, leads) con el prototipo; luego apuntar el Agent Bot real al servicio nuevo, período de observación, apagar el prototipo | 1 semana con tráfico real sin incidentes; plan de reversa probado | idea |
| 11 | Usuarios y autenticación | Usuarios, roles (admin/asesor), login para el back office | Endpoints protegidos por rol con tests | idea |
| 12 | Inventario | Ledger de movimientos con `stock` como caché en la misma transacción | Conciliación ledger = stock en tests | idea |
| 13 | Ventas y envíos | Ciclos de estado de venta y envío con sus efectos sobre el inventario (MODELO_DATOS §6) | Cada transición genera los movimientos correctos | idea |
| 14 | API del back office | Estabilizar la API v1 y probar un cliente generado | Un cliente generado desde `openapi.json` compila y consume la API; ningún cambio incompatible sale sin pasar a `/api/v2` | idea |
| — | Posterior | Canales adicionales, RAG, analítica, campañas | Se priorizan después del corte | — |

> **Decidido (P8, 2026-09-22):** las fases 11-14 van **después del corte**. Mientras tanto el
> catálogo se carga con la hoja de Sheets + importador (Fase 03). La primera pantalla podría ser una
> Dashboard App dentro de Chatwoot (P14, se decide en la Fase 11).

> Las Fases 00a, 00b, 01, 02, 03 y 04 están cerradas y archivadas:
> `openspec/changes/archive/2026-09-23-fase-00a-esqueleto/`,
> `openspec/changes/archive/2026-09-25-fase-00b-ci-contrato-api/`,
> `openspec/changes/archive/2026-09-25-fase-01-persistencia/`,
> `openspec/changes/archive/2026-09-26-fase-02-catalogo/`,
> `openspec/changes/archive/2026-09-26-fase-03-importador-medios/` y
> `openspec/changes/archive/2026-09-28-fase-04-canal-chatwoot/`. Los 14 requisitos (PER1-PER14, 30
> escenarios) de la Fase 01 quedaron fusionados en `openspec/specs/persistencia/spec.md`; los 18
> requisitos (CAT1-CAT11, HOR1-HOR7, 32 escenarios) de la Fase 02 quedaron fusionados en
> `openspec/specs/catalogo/spec.md` y `openspec/specs/horario/spec.md` (dominios nuevos). Su
> `verify-report.md` dejó dos desviaciones anotadas para confirmar antes de que la Fase 07 conecte
> estos servicios al LLM: `RepositorioParametroCatalogoPrisma` fija de facto un recargo contraentrega
> de 0 % y un mensaje genérico de fuera de cobertura cuando el parámetro respectivo no existe en la
> base — ninguna spec de la Fase 02 fija ese valor de negocio, así que antes de la Fase 07 el usuario
> debería cargar los valores reales de `recargo_contraentrega_pct`/`mensaje_fuera_cobertura` o decidir
> que esos defaults son aceptables. Los 13 requisitos nuevos (IMP1-IMP13, 39 escenarios) de la Fase 03
> quedaron anexados a `openspec/specs/catalogo/spec.md` (sin tocar CAT1-CAT11) y los 9 requisitos
> (MED1-MED9, 20 escenarios) quedaron en el dominio nuevo `openspec/specs/medios/spec.md`. Su
> `verify-report.md` dejó cuatro hallazgos abiertos, no bloqueantes, para que el usuario los revise
> antes de la Fase 09: (1) `docker-compose.yml` y el arnés de Testcontainers usan la imagen
> `bitnamilegacy/minio` en vez de `minio/minio` (Docker Hub retiró la imagen oficial gratuita en 2025)
> — decisión de infraestructura tomada por necesidad durante `sdd-apply`, pendiente de que el usuario
> la confirme o decida una alternativa antes de producción; (2) `.env.example` sigue sin las 8
> variables `MINIO_*`/`CATALOGO_SHEET_ID` — el permiso de sandbox bloqueó leer archivos `.env*`
> durante toda la fase, pendiente de que alguien con acceso lo complete; (3)
> `ResultadoImportacion.productosActivados` cuenta el total de productos importados, no los que
> quedan `activo=true` — hallazgo menor, ningún escenario depende de ese valor; (4) el escenario
> combinado de IMP13 (error de validación + foto inaccesible en la misma corrida) no es alcanzable con
> el contrato actual de `validarCatalogoCompleto` (aborta en el primer error de fila) — comportamiento
> real y documentado por diseño (D6/D7), no un defecto. Los 8 requisitos nuevos (CAN1-CAN8, 13
> escenarios) de la Fase 04 quedaron anexados a `openspec/specs/canales/spec.md` sin tocar R3/R4 del
> esqueleto (`openspec/config.yaml`, `sdd-archive-compose`, diff vacío tras la fusión). `judgment-day`
> aprobó la fase con un hallazgo CRITICAL (backoff de `Retry-After` sin acotar a
> `OUTBOX_BACKOFF_MAX_S`) corregido y re-verificado en el código (commit `e38653a`). Su
> `verify-report.md` dejó cinco hallazgos abiertos, no bloqueantes, para que el usuario los revise:
> (1) posible condición de carrera entre `abortarSecuencia`/`marcarMuerta` y un segundo publicador
> concurrente del outbox — solo relevante si se escala a más de un worker publicador, hoy el diseño
> asume un solo proceso; (2) un adjunto de video de Chatwoot se mapea como `tipoContenido: 'imagen'`
> en vez de tener su propia variante — cosmético; (3) `infra/chatwoot/.env` real aún no se copió desde
> `../ChatLuxeCRM/infra/chatwoot/.env` a este repo — bloqueado por permisos de sandbox del
> orquestador, pendiente de que el usuario lo copie a mano para completar la migración de la instancia
> temporal de Chatwoot a la portada; (4) `scripts/chatwoot-devolver-bot.sh` deliberadamente no se
> portó — depende de la máquina de estados bot/humano de la Fase 05; (5) dos escenarios (R3, R4) sin
> un test con el título exacto de la spec — hallazgo de `sdd-verify`, cobertura funcional real
> confirmada, solo trazabilidad de nomenclatura; (6) hallazgo del 2026-09-28, primera vez que
> `npm run contrato:lint` corrió hasta el final en CI: Spectral marca `POST
> /api/v1/webhooks/chatwoot` y `GET /health` con `operation-description` (sin `description`, solo
> `summary: ""`) y `operation-tag-defined` (usan los tags `WebhookChatwoot`/`Salud`, no declarados en
> `tags:` global de `openapi/openapi.interno.json`) — advertencias de Spectral, no bloquean `npm run
> ci`, pendientes de que el usuario decida si se documentan esos dos endpoints o se declaran los tags.
> Las demás fases siguen en `idea`. En cuanto una fase pase a `spec en revisión`, esta fila se anota
> con su carpeta: `openspec/changes/fase-NN-<nombre>/` (`archive/YYYY-MM-DD-fase-NN-<nombre>/` una vez
> cerrada).
>
> Las Fases 00a-04 están cerradas y archivadas (ver sus notas más abajo y sus carpetas en
> `openspec/changes/archive/`).
>
> **Fase 05 (Conversaciones) cerrada y archivada** (2026-09-28):
> `openspec/changes/archive/2026-09-28-fase-05-conversaciones/`. El usuario aprobó los cuatro
> artefactos (`proposal.md`, `specs/conversaciones/spec.md`, `design.md`, `tasks.md`) y las
> preguntas Q1-Q3 de la proposal con la recomendación de cada una: Q1 `mensaje_espera_handoff` usa
> un repositorio de parámetros propio de `conversaciones` (sin depender de `catalogo`); Q2 se
> mantienen los valores de TTL/debounce/rate-limit del prototipo como default Zod; Q3 el "agente
> eco" reenvía el texto del último mensaje del turno como único paso, sin `handoff`. Las 8 tareas
> (T1-T8) quedaron completas, cada una con su commit de unidad de trabajo, más 3 commits de
> corrección de `judgment-day` y 1 de cierre documental (13 commits totales en la rama
> `fase-05-conversaciones`, rango `9b9416d`..`151949f`). `judgment-day` (obligatorio para esta
> fase, regla 6 de arriba) corrió 2 rondas de corrección (el máximo del protocolo):
> **JUDGMENT: APPROVED ✅**. Ronda 1: ambos jueces confirmaron un CRITICAL —
> `ConsumidorConversaciones.manejarMensajeEntrante` no era idempotente ante la reentrega del mismo
> evento (`ContadorRateLimit.verificarLimite` incrementaba sin deduplicar por `idMensaje`) —
> corregido junto con un hallazgo relacionado (`LectorMensajeCanalChatwoot.obtenerTexto` no cumplía
> de verdad su contrato "nunca lanza"). El re-juicio de esa corrección encontró un CRITICAL nuevo,
> causado por el propio fix: la marca de idempotencia se creaba *antes* de que el trabajo real
> terminara, así que una falla transitoria a mitad de turno perdía el mensaje del cliente en
> silencio — corregido en la ronda 2 (marcar "procesado" solo tras el éxito, nunca antes). El
> re-juicio final no encontró ningún CRITICAL. Quedan 8 hallazgos WARNING/SUGGESTION documentados,
> no bloqueantes (relectura por lote en vez de por mensaje en el punto único de salida, pérdida del
> buffer si el generador falla a mitad de turno, sin *heartbeat* en el lock del turno, sin
> validación cruzada de los TTL de `handoff_pendiente`, eco de texto vacío si Chatwoot falla al
> resolver un mensaje, una condición de carrera menor en la marca de aviso de espera, y dos
> hallazgos de la ronda 2 de judgment-day: posible duplicado de buffer en una ventana estrecha, y
> pérdida de atomicidad de la guarda de idempotencia si se escala a más de un *worker* de inbox —
> no explotable hoy, `concurrency: 1`). Desviaciones reales encontradas durante `sdd-apply`
> (D16/D17 de `design.md`, detalladas en `tasks.md` y `verify-report.md` del change archivado):
> `canales` ganó un puerto nuevo de solo lectura `LECTOR_MENSAJE_CANAL` porque `EventoCanal` nunca
> trae texto (R14/CAN5); `RepositorioConversacion.obtenerOCrear` porque `design.md` asumía un
> `REPOSITORIO_CONTACTO` que no existía; un bug real de `CanalesModule` que no exportaba
> `RegistroConsumidorEventosCanal` en Nest (solo en el barril TS), y el aviso de espera de T8 no
> puede pasar por el punto único de salida porque exige `estado === 'bot'` de forma literal (R5).
> Filas 41-46, 54 (parcial) y 61 de `docs/migracion/inventario.md` marcadas **Migrado**. Los 20
> requisitos (R5-R8, R13 parcial ampliado con las nuevas escenarios por hora/día, CNV1-CNV6, 20
> escenarios) quedaron fusionados en `openspec/specs/conversaciones/spec.md` — R5/R6/R8 se
> reemplazaron por las versiones más precisas de esta fase; R7 y R13 conservaron los escenarios del
> esqueleto todavía no implementados (el asesor resuelve la conversación; agrupación de mensajes,
> collage, tope de turnos y costo por llamada al LLM — Fases 06/07) y solo se les agregaron los
> escenarios nuevos, sin borrar contenido de fases futuras.
>
> Nota de proceso, repetida en tres puntos de esta fase (`sdd-explore`, `sdd-apply`, `sdd-verify`/
> `sdd-archive`): un hook del entorno (`PreToolUse:Agent`) rechazó la delegación a cualquier agente
> `sdd-*` con "SDD child dispatch refused", pese a confirmar el preflight canónico repetidamente con
> `AskUserQuestion`. El usuario autorizó implementar/verificar/archivar la fase directamente en cada
> caso. Los agentes de `judgment-day` (`jd-judge-a/b`, `jd-fix-agent`) sí se delegaron sin problema.
>
> **Fase 06 (Pasarela LLM) cerrada y archivada** (2026-09-29):
> `openspec/changes/archive/2026-09-29-fase-06-pasarela-llm/`. Las 9 tareas (T1-T9) quedaron completas,
> cada una con su commit de unidad de trabajo, más 1 commit de corrección de `judgment-day` y los de
> documentación (rama `fase-06-pasarela-llm`, rango `d3b4d6e`..`90307b5`). Los 13 requisitos
> (LLM1-LLM13, 27 escenarios) quedaron en el dominio nuevo `openspec/specs/llm/spec.md` y R13 de
> `openspec/specs/conversaciones/spec.md` pasó a reflejar que el costo por llamada lo escribe el gateway
> (Fase 06). `judgment-day` (obligatorio para esta fase, regla 6) aprobó en la ronda 1 de 2: un
> CRITICAL confirmado por ambos jueces (el circuit breaker se quedaba en `semiabierto` para siempre si
> la sonda fallaba con un 4xx no reintentable, dejando el gateway muerto con el perfil de un solo
> modelo) corregido y re-juzgado sin hallazgos. Se crearon y **aceptaron (2026-09-29)** el ADR-0014
> (fallback iterado en el gateway, no con el parámetro `models` de OpenRouter; matiza ADR-0002) y el
> ADR-0013 (circuit breaker en memoria). **Post-cierre (2026-09-29):** se corrigieron dos de los cinco
> hallazgos informativos de `judgment-day` —W1: el backoff ahora se descuenta del presupuesto del lock y
> un lock corto ya no aborta el primer intento; S2: el 408 se reintenta— en el commit `68f418d`;
> `.env.example` documenta las 17 variables `LLM_*`/`OPENROUTER_*`; los precios de
> `LLM_PRECIOS_USD_JSON` se verificaron contra la API pública de OpenRouter (0,20 / 1,20 / 0,02 USD por
> millón de tokens) y el techo mensual de 10 USD quedó confirmado (P17). Las decisiones
> que quedaban (P20-P23) se resolvieron el 2026-09-29 con criterio del proyecto y quedaron en
> `docs/PREGUNTAS_ABIERTAS.md`; además, el techo mensual se puede subir sin reiniciar con el parámetro
> `llm_techo_mensual_usd` (P25), lo que el spec ya pedía y la primera implementación no cumplía.
> Entrega: el rango excede el presupuesto de 400 líneas por PR por naturaleza (TDD estricto: ~60 % son
> tests) y se parte en 5 PRs apilados (`stacked-to-main`), cada uno con su `size:exception`
> documentado. `LlmModule` **no** está registrado en `AppModule`: la Fase 07 lo cablea, reemplaza
> `GENERADOR_RESPUESTA` y exporta un caso de uso para leer `mensaje_techo_gasto`.
> Mismo hook `PreToolUse:Agent` que en la Fase 05 rechazó `sdd-apply` (el usuario eligió implementar
> inline); los agentes de `judgment-day` sí se delegaron sin problema.
>
> **Antes de la Fase 07 (2026-09-29), cerrado y archivado:** cambio chico `politicas-contraentrega` (`openspec/changes/archive/2026-09-29-politicas-contraentrega/`, PR #9 a #12):
> las políticas del negocio pasan a filas `politica_<tema>` de la tabla `parametro` (la de contra entrega con el texto
> aprobado por el usuario como respaldo), la cotización de envío con contra entrega las devuelve, la ficha deja de
> citar el porcentaje del recargo al cliente (solo que «se suma al total»; el 5 % queda como dato interno para la
> Fase 13) y el texto de respaldo de fuera de cobertura deja de prometer un contacto. La Fase 07 agrega la séptima
> herramienta, `consultar_politica`, y la regla de cuándo citar cada política.
>
> **Requisitos para las Fases 11 y 14 (2026-09-29):** la carga y edición masiva pasa a archivo `.xlsx`/CSV con
> exportación previa, control de versión por fila, vista previa e informe por pestaña, y Google Sheets se retira
> cuando exista el reemplazo (ADR-0015, aceptada; detalle en `docs/analisis/06-cliente-back-office.md`). El
> exportador por CLI es un cambio propio posterior a la Fase 07; la pantalla y sus endpoints, Fases 11 y 14.
>
> **2026-09-28**: primer push del repo a GitHub — primera vez que `npm run ci` corrió sobre un
> runner Linux real (antes solo se había verificado en Windows + Docker Desktop). Salieron tres
> defectos de entorno nunca vistos en local, corregidos en la rama `fix/actionlint-temp-dir-permisos`
> (mergeada a `main`): (1) la imagen `rhysd/actionlint` corre como usuario no root y no podía
> atravesar el `0700` que `mkdtemp` deja por defecto en el fixture de `validar-flujos.spec.ts`; (2)
> `verificar-commits.ts` asumía que `main` existe como rama local, pero `actions/checkout` sobre
> cualquier otra rama solo deja `refs/remotes/origin/main` (mismo caso que D11 ya resolvía para
> `contrato:diff`); (3) `VITEST_POOL_ID` no es único entre procesos concurrentes — el planificador de
> Vitest puede asignar el mismo poolId a dos procesos hijos distintos, haciendo que dos archivos de
> integración compitan por (o compartan en vivo) la misma base `test_<poolId>`; el arnés de
> `test/soporte/` ahora identifica el worker con `<poolId>_<pid>` (`process.pid` sí es único).
> Ninguno de los tres es específico de una fase — afectan el arnés compartido desde la Fase 01/00b —
> así que quedan documentados aquí en vez de en el `verify-report.md` de una fase concreta.

## Prerrequisitos externos

Las fases 09 y 10 están bloqueadas por, fuera de este repo: VPS + Dokploy con dominio fijo, token
de sistema-usuario permanente de Meta, Chatwoot movido al VPS, y catálogo/fotos/tarifas reales
cargados. Detalle en `../ChatLuxeCRM/REQUISITOS_PENDIENTES.md`.

## Cómo se trabaja una fase

1. **Explorar y proponer** (`sdd-new`/`sdd-propose`): crea `openspec/changes/fase-NN-<nombre>/` y su
   `proposal.md` — objetivo, alcance, qué migra del prototipo, plan de rollback, preguntas
   bloqueantes. Se usa la skill `luxeboreal-fases`.
2. **Especificar y diseñar** (`sdd-spec → sdd-design → sdd-tasks`): delta specs por dominio
   (Dado/Cuando/Entonces), diseño de módulos/puertos/eventos, y el checklist de tareas (`tasks.md`,
   ≤10, slices de PR ~400 líneas, "Review requerida").
3. **Revisión del usuario** → estado `aprobada` (solo el usuario la marca). Si surge una decisión
   con alternativas, ADR `propuesta`.
4. **Implementar** (`sdd-apply`) tarea por tarea, en la rama `fase-NN-<nombre>`; cada tarea deja su
   test (RED → GREEN → REFACTOR) y su commit de unidad de trabajo, registrado en `tasks.md`.
5. **Cerrar** (`sdd-verify → sdd-archive`): checklist de la skill `luxeboreal-arquitectura`,
   `judgment-day` si la fase es 04/05/06/10, `verify-report.md` con lo que aprendimos, archivar el
   change (fusiona los delta specs en `openspec/specs/`) y actualizar esta tabla y
   `docs/migracion/inventario.md`.
