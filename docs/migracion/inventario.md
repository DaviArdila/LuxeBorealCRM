# Inventario de migración: ChatLuxeCRM → LuxeBorealCRM

- Fecha: 2026-09-22 · Estado: borrador para revisar con el usuario
- Cada pieza del prototipo tiene una decisión y una fase destino. Al cerrar una fase, sus filas
  pasan a **migrado** con la referencia al código nuevo.

Leyenda de decisión:

- **Conservar** — la lógica se porta casi igual (cambia la forma: clase inyectable, tipos).
- **Rediseñar** — la regla de negocio se conserva, la implementación cambia.
- **Descartar** — no pasa al proyecto nuevo (con motivo).
- **Delegar** — no se construye: lo resuelve Chatwoot Community (ADR-0005, `docs/analisis/04-chatwoot-delegar-vs-construir.md`).
- **Posponer** — tiene sentido, pero no en la migración inicial.

## Módulos de código

| Prototipo (`ChatLuxeCRM/src/…`) | Decisión | Destino en LuxeBorealCRM | Fase | Motivo / nota |
|---|---|---|---|---|
| `config/env.ts` | Rediseñar | `plataforma/config` (ConfigModule + Zod) | 00 | A1: validar una vez, inyectar |
| `lib/logger.ts` | Rediseñar | `nestjs-pino` con redacción | 00 | |
| `lib/tiempo.ts` | Conservar | `plataforma/reloj` (`Clock` inyectable) | 00 | B8; se elimina el reloj global mutable |
| `lib/dinero.ts`, `lib/texto.ts`, `lib/numero.ts` | Conservar | `compartido/` | 00 | **Migrado** — `src/compartido/dinero/`, `src/compartido/texto/`, `src/compartido/numero/` (Fase 00a, T5, commit `d2aa48a`); funciones puras con tests reescritos |
| `health/` | Rediseñar | `@nestjs/terminus` | 00 | **Migrado** — `src/plataforma/salud/` (Fase 00a: indicadores Postgres/Redis, apagado ordenado; Fase 00b, T4: `esquemaRespuestaSalud` documenta la respuesta desde zod, `FiltroSaludOperativo` la exime de `application/problem+json`, y `GET /health` entra al documento OpenAPI **interno**, excluido del público) |
| `db/prisma.ts`, `db/repositorios/*`, `db/tipos.ts` | Rediseñar | `PrismaService` + repositorios por módulo | 01 | **Migrado** — `PrismaService` (Fase 00a) + esquema v1 con 21 tablas/11 enums y migración inicial (Fase 01, T2) + primer repositorio real por módulo, `src/modulos/geografia/infraestructura/repositorio-geografia-prisma.ts` (Fase 01, T3); la regla "solo la capa de datos toca Prisma" pasa a fronteras (regla 12). Extendido en Fase 02 (T5/T6): repositorios de producto, envío, parámetro (`catalogo`) y horario (`horario`), cada uno con puerto propio, sin módulo `configuracion` compartido (D4). Extendido **parcialmente** en Fase 03 (T7, commit `ece9719`): `catalogo/infraestructura/repositorio-importacion-prisma.ts` porta el lado de **escritura** de `db/repositorios/catalogo.ts` (upsert todo-o-nada dentro de una sola `$transaction`, resolución de departamento/ciudad por FK DANE en vez de texto libre); el lado de **lectura** de ese mismo archivo del prototipo ya había migrado en Fase 02 |
| `envios/calculo.ts` | Conservar | `catalogo/dominio/envio` | 02 | B12, puro. **Migrado** — `src/modulos/catalogo/dominio/envio.ts` (Fase 02, T2, commit `84db4e5`) |
| `horario/dentroHorario.ts` | Conservar | `horario/` | 02 | **Migrado** — `src/modulos/horario/dominio/horario.ts` (Fase 02, T4, commit `0a2c600`) + puerto/repositorio/aplicación (T6, T9) |
| `motor/catalogoCompacto.ts` | Rediseñar | `catalogo/aplicacion` con caché inyectable | 02 | La invalidación por versión (ADR-005) se conserva. **Migrado** — `src/modulos/catalogo/infraestructura/cache-catalogo-redis.ts` como *provider* de NestJS, sin abrir Redis al importarse (corrige A1/A3) (Fase 02, T7, commit `1a9eb26`) |
| `catalogo/importar.ts` | Conservar | `catalogo/aplicacion/importar-catalogo.ts` | 03 | **Migrado** — orquestador todo-o-nada (Fase 03, T9, commit `5e1db77`; corrección `858e596`) |
| `catalogo/fuentes.ts` | Conservar | `catalogo/infraestructura/fuente-catalogo-sheets.ts` + `fuente-catalogo-directorio.ts` | 03 | **Migrado** — mismo endpoint público `gviz/tq?tqx=out:csv`, sin fricción de credenciales (Fase 03, T4, commit `312f2c3`) |
| `catalogo/drive.ts` | Conservar | `catalogo/infraestructura/descarga-drive.ts` | 03 | **Migrado** — detección de enlaces/carpeta y validación por *magic bytes* (Fase 03, T6, commit `af86ab4`) |
| `catalogo/validar.ts` | Conservar (reglas) / Rediseñar (forma de parámetros) | `catalogo/dominio/validar-catalogo.ts` | 03 | **Migrado** — seis sub-validadores + parser jsonb propio por clave conocida, `parametro.valor` pasa de texto plano a `jsonb` (Q3) (Fase 03, T2, commit `ecfde9d`) |
| `catalogo/cli.ts` | Rediseñar | comando Nest CLI (`scripts/importar-catalogo.ts` + caso `catalogo:importar` de `scripts/cli.ts`) | 03 | **Migrado** — corrige A1 (contexto de aplicación propio al ejecutarse, nunca conexión abierta al importar el módulo) (Fase 03, T10, commit `dfe2c6b`) |
| `catalogo/fotos.ts` | Rediseñar | `catalogo/aplicacion/procesar-fotos.ts` sobre puerto `Almacenamiento` | 03 | **Migrado** — reemplaza disco local (A14) por MinIO, con idempotencia (Fase 03, T8, commit `76b4aa7`) |
| `catalogo/notificar.ts` | Posponer | `notificaciones/` | 08 | No migrado en esta fase; ver fila `telegram/*` |
| `media/collage.ts` | Conservar | `medios/aplicacion/collage.ts` | 03 | **Migrado** — función pura, `sharp` igual (Fase 03, T3, commit `17d3abc`) |
| `media/placeholder.ts` | Posponer | — | — | No migrado en esta fase (Q4 de `proposal.md`): el prototipo solo lo usa desde su script de semilla de datos de prueba, no desde el flujo de importación real; los fixtures de la Fase 03 usan fotos reales pequeñas en vez de generarlas |
| `webhook/verifySignature.ts`, `parseEvent.ts` | Conservar | `canales/infraestructura/chatwoot/{verificar-firma,traducir-evento}.ts` | 04 | **Migrado** — Probado con Chatwoot real (Fase 04, T2, commit ver `tasks.md` archivado) |
| `webhook/router.ts`, `webhook/dedupe.ts` | Rediseñar | `canales/interfaz/webhook-chatwoot.controller.ts` + inbox `evento_entrante` | 04 | **Migrado** — A8: dedupe pasa a `UNIQUE(origen, id_externo)` de ADR-0004, sin marcar antes de procesar (Fase 04, T3) |
| `chatwoot/enviarMensaje.ts`, `idempotencia.ts` | Rediseñar | `canales/puertos/salida-canal.ts` (puerto) + `AdaptadorCanalChatwoot` + `plataforma/outbox` | 04 | **Migrado** — B5 se conserva (idempotencia por paso, `clave_idempotencia`); A9 (el dominio no habla Chatwoot) (Fase 04, T5-T7) |
| `chatwoot/chatwootClient.*` | Conservar | `canales/infraestructura/chatwoot/cliente-chatwoot.ts` | 04 | **Migrado** — cliente HTTP sin reintentos propios, clasificación de fallos por código HTTP (Fase 04, T5) |
| `estado/maquinaEstados.ts`, `esperaHandoff.ts`, `estadoGlobal.ts` | Rediseñar | `conversaciones/dominio` (FSM) | 05 | **Migrado** — A6: Postgres fuente de verdad, transición inválida lanza (`dominio/maquina-estados.ts`, T1); `esperaHandoff.ts` → `aplicacion/consumidor-conversaciones.ts` + `infraestructura/redis/marca-espera-handoff.ts` (T8); `estadoGlobal.ts` → `infraestructura/redis/interruptor-global-redis.ts`, solo lectura (T3; la escritura es Fase 09, ver fila `admin/`) |
| `estado/buffer.ts`, `lock.ts`, `contadorAudio.ts` | Conservar | `conversaciones/infraestructura/redis` | 05 | **Migrado (parcial)** — `buffer.ts` → `buffer-turno.ts`, `lock.ts` → `lock-turno.ts` (T3); `contadorAudio.ts` **pospuesto** a la Fase 07 (su único consumo es R12, mensajes no textuales — decisión ya tomada en `proposal.md`) |
| `estado/historial.ts` (últimos turnos para el LLM) | Rediseñar | Redis efímero o lectura desde la API de Chatwoot | 07 | Nunca en Postgres (P3); se decide midiendo latencia |
| `queue/chatQueue.ts`, `chatWorker.ts` | Rediseñar | `@nestjs/bullmq` processor | 05 | **Migrado** — `chatQueue.ts` → `infraestructura/colas/cola-turno.ts` (debounce + `WorkerHost`), `chatWorker.ts` → `aplicacion/procesar-turno.ts` (T4) |
| `queue/reactivacionQueue.ts`, `leadsQueue.ts` | Rediseñar | `@nestjs/schedule` / jobs repetibles BullMQ | 05, 08 | `reactivacionQueue.ts` → `infraestructura/colas/barrido-vencimientos.ts`, job repetible BullMQ (**Migrado**, T7); `leadsQueue.ts` sigue pendiente, Fase 08 |
| `rateLimit/rateLimiter.ts` | Conservar | `conversaciones/politicas` | 05 | **Migrado** — `infraestructura/redis/contador-rate-limit.ts` (T3); landed bajo `infraestructura/redis/`, no `politicas/`, porque toda la lógica es un wrapper delgado de INCR+EXPIRE sobre Redis, sin regla de negocio propia que justifique una carpeta aparte |
| `llm/*` | Rediseñar | `llm/` (puerto + gateway + adaptador AI SDK) | 06 | **Migrado** — A7: un solo `LlmGateway` con timeout, reintento acotado, fallback por modelo (ADR-0014), circuit breaker en memoria (ADR-0013) y registro de costo por intento en `uso_llm`, y un adaptador OpenRouter que hace un solo intento (`src/modulos/llm/aplicacion/llm-gateway.ts`, `infraestructura/adaptador-openrouter.ts`); A1/A2: tokens DI y dobles en `test/fakes/`, sin `MOCK_*`; techo mensual con aviso al 80 % (R13, P17). **Pospuesto a la Fase 07**: motor, herramientas, prompts, historial y modelos de respaldo concretos; el consumo del error tipado (handoff) y del texto `mensaje_techo_gasto` es de las Fases 07/08 (Fase 06, T1-T9) |
| `tools/*` (6 tools) | Rediseñar | `agente/herramientas` con efectos tipados | 07 | Contratos con el LLM **sin cambios** (SPEC §3.1); A4. La lógica de aplicación de `obtenerFicha.ts`/`cotizarEnvio.ts` (sin el contrato de *tool*) ya está **migrada** a `src/modulos/catalogo/aplicacion/obtener-ficha-producto.ts`/`cotizar-envio.ts` (Fase 02, T8, commit `ea87f58`); Fase 07 construye el envoltorio de *tool* sobre estos servicios, no la lógica de negocio |
| `motor/motor.ts`, `bucleHerramientas.ts`, `enrutadorTipoMensaje.ts`, `contextoInicial.ts` | Rediseñar | `agente/` pipeline de políticas + bucle | 07 | A5 |
| `motor/systemPrompt.ts` | Rediseñar | `agente/prompts/*.md` versionados | 07 | Prefijo estable para caché |
| `leads/*` (señales, calificar, derivar, captura) | Conservar reglas / Rediseñar orquestación | `leads/` | 08 | B3; la derivación pasa a eventos + outbox |
| `telegram/*` | Rediseñar | `notificaciones/` (puerto `Notificador` + outbox) | 08 | |
| `meta/indicadorEscribiendo.ts` | Conservar | `canales/whatsapp-meta` | 08 | Única llamada directa a Meta |
| `admin/` (kill switch) | Conservar | `admin/` con guard de token | 09 | **Migrado (parcial)** — la lectura del interruptor (`bot:activo`) ya migró en la Fase 05 (`conversaciones/infraestructura/redis/interruptor-global-redis.ts`, T3), consumida por el consumidor antes de generar respuesta; el endpoint `POST /admin/pausa` que lo escribe sigue pendiente en la Fase 09 |
| `scripts/backup.sh`, `restore.sh` | Conservar | `ops/` | 09 | Probado |
| `scripts/chatwoot-*.sh`, `infra/chatwoot/` | Conservar | `infra/` | 04 | **Migrado (parcial)** — entorno local portado (Fase 04, T8); movido de 00a a 04 al cerrar 00a (N1 de `proposal.md`: 00a no integra canales). `infra/chatwoot/.env` real aún no copiado desde `../ChatLuxeCRM/infra/chatwoot/.env` — bloqueado por permisos de sandbox, pendiente de que el usuario lo copie a mano; `scripts/chatwoot-devolver-bot.sh` deliberadamente no portado (depende de la FSM bot/humano de la Fase 05) |
| `panel/` (ya retirado, ADR-006) | Descartar | — | — | El back office es cliente aparte |
| `queue/refrescoMediaQueue.ts` (stub, ya obsoleto) | Descartar | — | — | Chatwoot sube los medios |
| `.kilo/worktrees/`, `data/sqlite/`, `db.sql` | Descartar | — | — | Restos |
| **Todos los datos** del prototipo (catálogo de prueba, contactos, leads, parámetros) | Descartar | — | — | Arranque limpio (P7); solo se toma la estructura (`MODELO_DATOS.md`) |
| `db/repositorios/estadoConversacion.ts` + tabla `estado_conversacion` | Rediseñar | tabla `conversacion` por sesión | 01, 05 | ADR-0003. Fase 01 (T2): tabla `conversacion` con `version` en el esquema. **Migrado** — `conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.ts`, bloqueo optimista sobre `version` con reintento único (Fase 05, T1/T2) |
| `db/repositorios/tarifas.ts`, `envios/` + tabla `tarifa_envio` | Rediseñar | `zona_sin_cobertura` + `tarifa_estimada` | 01, 02 | P4: cobertura por exclusión, rango aproximado. Fase 01 (T2): ambas tablas en el esquema, incluida la restricción `[manual]` de `zona_sin_cobertura`. **Migrado** — repositorio (`src/modulos/catalogo/infraestructura/repositorio-envio-prisma.ts`, join directo a `departamento`/`ciudad` sin depender de `geografia`) y cálculo de envío (T2/T5, Fase 02); especificidad de `tarifa_estimada` resuelta por algoritmo, sin restricción de esquema nueva (Q2) |
| Contacto identificado por teléfono (`lib/numero.ts` como clave) | Rediseñar | `contacto.id` + `chatwoot_contact_id` | 01, 04 | P1. Fase 01 (T2): `contacto.id` propia y `chatwoot_contact_id` en el esquema; traducción/uso real desde el canal llega en la Fase 04 |
| Inventario, ventas, envíos, usuarios (solo tablas) | Construir | `inventario/`, `ventas/`, `usuarios/` | 11+ | Lógica nueva según MODELO_DATOS §5-§6 |

## Delegado a Chatwoot (no se construye)

| Capacidad | Nota |
|---|---|
| Canales (WhatsApp, Instagram, Messenger, web) y webhook de Meta | Ya era así en el prototipo |
| Historial de mensajes y adjuntos | P3: no se guarda en nuestra base |
| Identidad del contacto entre canales | P1: `chatwoot_contact_id` |
| Asignación, equipos, etiquetas, notas, respuestas guardadas, macros | Configuración de Chatwoot, no código |
| Reportes de atención y CSAT | Nuestros reportes son de negocio (leads → ventas) |

## Documentos

| Documento del prototipo | Decisión | Destino |
|---|---|---|
| `SPEC.md` §3-§8 (reglas de negocio) | Conservar, reescribiendo sin historial de versiones | `SPEC.md` §4 + specs de fase |
| `SPEC.md` §10-§12 (fases del prototipo, config manual) | Descartar / Conservar | Fases nuevas en `docs/fases/`; config manual a `docs/operacion/` en Fase 09 |
| `MODELO_DATOS.md` | Conservar como base | `MODELO_DATOS.md` v1 aprobada (Fase 01, cerrada 2026-09-25) |
| `docs/adr/0001-0008` | Conservar como antecedentes | Se referencian; los que cambian se reemplazan con ADR nuevos |
| `docs/CHATWOOT.md`, `docs/CATALOGO.md` | Conservar | `docs/operacion/` en las fases 03-04 |
| `.claude/skills/whatsapp-meta-conventions` | Conservar | Copiar a `.claude/skills/` al llegar a la Fase 04 |

## Tests

Los 199 tests del prototipo son la **especificación ejecutable** del comportamiento. Regla de
migración: cada fase lista qué tests del prototipo cubre y los reescribe (no se copian) en el nivel
correcto de la pirámide. Un comportamiento del prototipo que no tenga test equivalente en el
proyecto nuevo se considera no migrado.
