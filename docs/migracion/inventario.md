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
| `health/` | Rediseñar | `@nestjs/terminus` | 00 | |
| `db/prisma.ts`, `db/repositorios/*`, `db/tipos.ts` | Rediseñar | `PrismaService` + repositorios por módulo | 01 | La regla "solo la capa de datos toca Prisma" se conserva, pero por módulo |
| `envios/calculo.ts` | Conservar | `catalogo/dominio/envio` | 02 | B12, puro |
| `horario/dentroHorario.ts` | Conservar | `horario/` | 02 | |
| `motor/catalogoCompacto.ts` | Rediseñar | `catalogo/aplicacion` con caché inyectable | 02 | La invalidación por versión (ADR-005) se conserva |
| `catalogo/` (importador Sheets/Drive) | Conservar | `catalogo/importacion` + comando CLI | 03 | Funciona; se adapta a puertos (`FuenteCatalogo`, `Almacenamiento`) |
| `media/collage.ts`, `media/placeholder.ts` | Conservar | `medios/` | 03 | `sharp` igual |
| `webhook/verifySignature.ts`, `parseEvent.ts` | Conservar | `canales/chatwoot/entrada` | 04 | Probado con Chatwoot real |
| `webhook/router.ts`, `webhook/dedupe.ts` | Rediseñar | Controlador + inbox de eventos | 04 | A8 |
| `chatwoot/enviarMensaje.ts`, `idempotencia.ts` | Rediseñar | `conversaciones/salida` (puerto) + adaptador Chatwoot | 04 | B5 se conserva; A9 |
| `chatwoot/chatwootClient.*` | Conservar | `canales/chatwoot/infraestructura` | 04 | |
| `estado/maquinaEstados.ts`, `esperaHandoff.ts`, `estadoGlobal.ts` | Rediseñar | `conversaciones/dominio` (FSM) | 05 | A6: Postgres fuente de verdad, transición inválida lanza, eventos de dominio |
| `estado/buffer.ts`, `lock.ts`, `contadorAudio.ts` | Conservar | `conversaciones/infraestructura/redis` | 05 | Efímero, correcto en Redis |
| `estado/historial.ts` (últimos turnos para el LLM) | Rediseñar | Redis efímero o lectura desde la API de Chatwoot | 07 | Nunca en Postgres (P3); se decide midiendo latencia |
| `queue/chatQueue.ts`, `chatWorker.ts` | Rediseñar | `@nestjs/bullmq` processor | 05 | Mismo debounce + lock |
| `queue/reactivacionQueue.ts`, `leadsQueue.ts` | Rediseñar | `@nestjs/schedule` / jobs repetibles BullMQ | 05, 08 | |
| `rateLimit/rateLimiter.ts` | Conservar | `conversaciones/politicas` | 05 | |
| `llm/*` | Rediseñar | `llm/` (puerto + gateway + adaptador AI SDK) | 06 | A7, ver investigación §3 |
| `tools/*` (6 tools) | Rediseñar | `agente/herramientas` con efectos tipados | 07 | Contratos con el LLM **sin cambios** (SPEC §3.1); A4 |
| `motor/motor.ts`, `bucleHerramientas.ts`, `enrutadorTipoMensaje.ts`, `contextoInicial.ts` | Rediseñar | `agente/` pipeline de políticas + bucle | 07 | A5 |
| `motor/systemPrompt.ts` | Rediseñar | `agente/prompts/*.md` versionados | 07 | Prefijo estable para caché |
| `leads/*` (señales, calificar, derivar, captura) | Conservar reglas / Rediseñar orquestación | `leads/` | 08 | B3; la derivación pasa a eventos + outbox |
| `telegram/*` | Rediseñar | `notificaciones/` (puerto `Notificador` + outbox) | 08 | |
| `meta/indicadorEscribiendo.ts` | Conservar | `canales/whatsapp-meta` | 08 | Única llamada directa a Meta |
| `admin/` (kill switch) | Conservar | `admin/` con guard de token | 09 | |
| `scripts/backup.sh`, `restore.sh` | Conservar | `ops/` | 09 | Probado |
| `scripts/chatwoot-*.sh`, `infra/chatwoot/` | Conservar | `infra/` | 04 | Entorno local; movido de 00a a 04 al cerrar 00a (N1 de `proposal.md`: 00a no integra canales) |
| `panel/` (ya retirado, ADR-006) | Descartar | — | — | El back office es cliente aparte |
| `queue/refrescoMediaQueue.ts` (stub, ya obsoleto) | Descartar | — | — | Chatwoot sube los medios |
| `.kilo/worktrees/`, `data/sqlite/`, `db.sql` | Descartar | — | — | Restos |
| **Todos los datos** del prototipo (catálogo de prueba, contactos, leads, parámetros) | Descartar | — | — | Arranque limpio (P7); solo se toma la estructura (`MODELO_DATOS.md`) |
| `db/repositorios/estadoConversacion.ts` + tabla `estado_conversacion` | Rediseñar | tabla `conversacion` por sesión | 01, 05 | ADR-0003 |
| `db/repositorios/tarifas.ts`, `envios/` + tabla `tarifa_envio` | Rediseñar | `zona_sin_cobertura` + `tarifa_estimada` | 01, 02 | P4: cobertura por exclusión, rango aproximado |
| Contacto identificado por teléfono (`lib/numero.ts` como clave) | Rediseñar | `contacto.id` + `chatwoot_contact_id` | 01, 04 | P1 |
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
| `MODELO_DATOS.md` | Conservar como base | `MODELO_DATOS.md` borrador v1 (2026-09-22); se aprueba al escribir la Fase 01 |
| `docs/adr/0001-0008` | Conservar como antecedentes | Se referencian; los que cambian se reemplazan con ADR nuevos |
| `docs/CHATWOOT.md`, `docs/CATALOGO.md` | Conservar | `docs/operacion/` en las fases 03-04 |
| `.claude/skills/whatsapp-meta-conventions` | Conservar | Copiar a `.claude/skills/` al llegar a la Fase 04 |

## Tests

Los 199 tests del prototipo son la **especificación ejecutable** del comportamiento. Regla de
migración: cada fase lista qué tests del prototipo cubre y los reescribe (no se copian) en el nivel
correcto de la pirámide. Un comportamiento del prototipo que no tenga test equivalente en el
proyecto nuevo se considera no migrado.
