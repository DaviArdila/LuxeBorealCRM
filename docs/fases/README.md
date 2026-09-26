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
                                           05 Conversaciones ─▶ 06 Pasarela LLM ─▶ 07 Agente ─▶ 08 Leads y handoff
                                                                                                        │
                                                                              09 Operación ◀────────────┘
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
| 02 | Catálogo | Lectura de productos, ficha con dinero formateado, cobertura por exclusión + rango aproximado de envío (ciudad → departamento → nacional), horario de atención | Tests del cálculo de envío y del horario portados del prototipo; caché con invalidación por versión | idea |
| 03 | Importador y medios | Importar catálogo desde Google Sheets + fotos a almacenamiento de objetos + collage | `npm run catalogo:importar -- --dir <fixtures>` deja el catálogo y las fotos listos; todo-o-nada | idea |
| 04 | Canal Chatwoot | Entrada por inbox de eventos (firma, dedupe, 200 rápido), salida idempotente por un puerto de canal, perfil de capacidades por canal, y verificar los puntos "?" del doc 04 | Evento firmado → registro en inbox → procesado una vez; envío con reintento → cero duplicados; fixtures de contrato = payloads reales de Chatwoot grabados del prototipo (anonimizados) | idea |
| 05 | Conversaciones | Máquina de estados bot/humano en Postgres, debounce, lock, eco humano, vencimientos, rate limit | Tests 6-9 y 15 del SPEC del prototipo §9 reescritos y en verde (con un "agente eco" como respuesta) | idea |
| 06 | Pasarela LLM | Puerto `LlmPort`, gateway con timeout/reintento/circuit breaker/costo y adaptador AI SDK sobre OpenRouter (GPT-5.6 Luna + modelos de respaldo) | Misma conversación contra 2 modelos cambiando solo configuración; fallback probado; registro en `uso_llm` | idea |
| 07 | Agente | Las 6 tools con efectos tipados, pipeline de políticas, prompts versionados, evals | Evals de los 3 casos de entrada en verde con LLM simulado; corrida manual con LLM real; set dorado de evals construido con conversaciones reales del prototipo (leídas de Chatwoot, anonimizadas): aserciones deterministas (tools esperadas, sin precios inventados, sin traspaso sin señal fuerte) con umbral explícito de aprobación antes de cualquier cambio de modelo o prompt | idea |
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

> Las Fases 00a, 00b y 01 están cerradas y archivadas:
> `openspec/changes/archive/2026-09-23-fase-00a-esqueleto/`,
> `openspec/changes/archive/2026-09-25-fase-00b-ci-contrato-api/` y
> `openspec/changes/archive/2026-09-25-fase-01-persistencia/`. Los 14 requisitos (PER1-PER14, 30
> escenarios) de la Fase 01 quedaron fusionados en `openspec/specs/persistencia/spec.md` (dominio
> nuevo). Las demás fases siguen en `idea`. En cuanto una fase pase a `spec en revisión`, esta fila
> se anota con su carpeta: `openspec/changes/fase-NN-<nombre>/`
> (`archive/YYYY-MM-DD-fase-NN-<nombre>/` una vez cerrada).

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
