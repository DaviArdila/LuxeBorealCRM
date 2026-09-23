# Hoja de ruta por fases

Este archivo es el **único lugar** donde vive el estado del proyecto. Cada fase tiene su spec en
`FASE-NN-<nombre>.md`, creada a partir de `_plantilla.md` **cuando le toca**, no antes: la spec de
una fase se escribe con lo que se aprendió en la anterior.

## Reglas de las fases

1. **Corta**: una fase se implementa en 1-3 sesiones de trabajo. Si la spec pasa de ~10 tareas, se
   parte en dos.
2. **Termina en algo que se puede probar**: un comando, un endpoint o un flujo verificable, con sus
   tests en verde. Nunca "infraestructura a medias".
3. **Solo depende de fases cerradas.** Nada de adelantar trabajo de una fase futura.
4. **Declara qué migra**: cada fase lista las filas de `docs/migracion/inventario.md` que cierra y
   los tests del prototipo que reemplaza.
5. **Ciclo de estados**: `idea → spec en revisión → aprobada → en curso → cerrada`. Solo el usuario
   pasa una spec a `aprobada`. Una fase `cerrada` tiene su sección "Registro de cierre" llena.
6. **Review**: las fases 04, 05, 06 y 10 cierran solo después de `judgment-day` (revisión ciega
   doble), además del RDD por commit.

## Mapa

```
00 Fundaciones ─▶ 01 Persistencia ─▶ 02 Catálogo ─▶ 03 Importador
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
| 00 | Fundaciones | Esqueleto NestJS con config validada, logs, reloj, health, lint, tests (Jest) y Docker de desarrollo, en el repo propio ya iniciado | `npm run verify` en verde; `GET /health` responde con Postgres y Redis arriba; CI (GitHub Actions, o hook git local mientras el repo no esté en GitHub) en verde: lint, typecheck, `dependency-cruiser`, Jest integración (Testcontainers), `gitleaks`, `npm audit`, commitlint | idea |
| 01 | Persistencia | `PrismaService`, esquema de `MODELO_DATOS.md` v1 (UUID v7, sin teléfono como PK), migración inicial, semilla DANE, arnés de tests con base aislada | Migración aplicada desde cero; test de repositorio contra Postgres real; semilla DANE idempotente | idea |
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
| 14 | API del back office | Contrato OpenAPI estable para el cliente (Next.js u otro) | Cliente generado desde OpenAPI compila y consume la API | idea |
| — | Posterior | Canales adicionales, RAG, analítica, campañas | Se priorizan después del corte | — |

> **Decidido (P8, 2026-09-22):** las fases 11-14 van **después del corte**. Mientras tanto el
> catálogo se carga con la hoja de Sheets + importador (Fase 03). La primera pantalla podría ser una
> Dashboard App dentro de Chatwoot (P14, se decide en la Fase 11).

## Prerrequisitos externos

Las fases 09 y 10 están bloqueadas por, fuera de este repo: VPS + Dokploy con dominio fijo, token
de sistema-usuario permanente de Meta, Chatwoot movido al VPS, y catálogo/fotos/tarifas reales
cargados. Detalle en `../ChatLuxeCRM/REQUISITOS_PENDIENTES.md`.

## Cómo se trabaja una fase

1. **Escribir la spec** (`FASE-NN-*.md` desde `_plantilla.md`): objetivo, alcance, qué migra, criterios
   de aceptación, diseño, tareas. Se usa la skill `luxeboreal-fases`.
2. **Revisión del usuario** → estado `aprobada`. Si surge una decisión con alternativas, ADR.
3. **Implementar** tarea por tarea; cada tarea deja su test.
4. **Cerrar**: checklist de la skill `luxeboreal-arquitectura`, llenar "Registro de cierre",
   actualizar esta tabla y `docs/migracion/inventario.md`.
