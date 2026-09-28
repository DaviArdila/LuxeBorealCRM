# Tasks: Fase 04 — Canal Chatwoot

Review requerida (por commit de unidad de trabajo): **RDD**. Además, esta fase **completa** (no cada
tarea) requiere **`judgment-day` obligatorio antes de `sdd-verify`** — fase-04-canal-chatwoot está en
la lista 04/05/06/10 de `docs/fases/README.md` regla 6 y así lo confirman `proposal.md` §"Decisiones
ya tomadas" y `design.md` §"Migration / Rollout". Ver sección aparte "Review de la fase" al final de
este documento; ninguna tarea individual la repite.

Convención de conteo (`openspec/config.yaml` §rules.tasks, "Máximo 10 tareas por change"): cada
**tarea** de este archivo (`T1`…`T9`) es una unidad de trabajo completa que termina en **un solo
commit**. Los seis slices del Approach de `proposal.md` (`(a)`-`(f)`) se reparten en **9 tareas**,
siguiendo `design.md` §"File Changes" y §"Migration / Rollout": la slice `(a)` se abre en dos tareas
(captura de fixtures primero, después el dominio puro que las usa) y la slice `(e)` se abre en las
`(e1)`/`(e2)` que el propio `design.md` anticipó por riesgo de tamaño. Ninguna tarea mezcla archivos de
dos slices distintas.

**Resultado: 9 tareas, dentro del límite de 10.** No hace falta proponer partir la fase.

## Nota de conteo de escenarios (verificada línea por línea, 2026-09-26)

Esta fase implementa por primera vez **R3** y **R4** (esqueleto existente,
`openspec/specs/canales/spec.md`, "Fase que lo implementa: 04") y agrega el delta nuevo **CAN1-CAN8**
(`specs/canales/spec.md` de este change). Total: **17 escenarios**, no solo los 13 de CAN#:

- **R3 (2 escenarios)**: "Evento con firma válida", "Evento con firma inválida".
- **R4 (2 escenarios)**: "Reintento del proveedor sobre un evento entrante", "Reintento de un job de
  envío tras un fallo".
- **CAN1-CAN8 (13 escenarios)**: CAN1(1), CAN2(1), CAN3(1), CAN4(1), CAN5(2), CAN6(3), CAN7(2),
  CAN8(2).

Varios escenarios se prueban a **dos niveles** (unitario y de integración), siguiendo exactamente
`design.md` §"Testing Strategy" (su fila de `traducirEvento` lista `CAN3, CAN5(2)` y su fila de
integración del webhook lista de nuevo `CAN2, CAN3, CAN5` junto con `R3(2), CAN1, R4 escenario 1`):
CAN2, CAN3 y CAN5 tienen un test unitario (T2) **y** un test de integración (T3) con el mismo título
exacto — ambos cuentan como cobertura del mismo escenario, no como escenarios distintos. La tabla de
mapeo abajo asigna cada escenario a su tarea **primaria** (donde se declara por primera vez, RED
incluido) y anota la tarea de soporte donde también se confirma.

## Checklist

- [x] T1 — Fixtures reales de Chatwoot anonimizados + verificación de campos (`test/fixtures/chatwoot/`) (S(a))
- [x] T2 — Dominio puro de canales: firma, traducción/redacción, perfil, claves (S(a))
- [x] T3 — Webhook + inbox + dedupe (`WebhookChatwootController`) (S(b))
- [x] T4 — `plataforma/colas` + procesador del inbox (S(c))
- [x] T5 — Puerto de salida + adaptador Chatwoot (S(d))
- [x] T6 — `plataforma/outbox` genérico + migración `clave_idempotencia` (S(e1))
- [x] T7 — `SalidaCanalOutbox` + reconciliación + e2e de cero duplicados (S(e2))
- [x] T8 — Entorno local de Chatwoot portado (`infra/chatwoot/`) (S(f))
- [ ] T9 — Cierre documental: doc 04 §3, skill de Meta, skill de arquitectura (S(f))

## Mapeo de escenarios por tarea (17 escenarios, R3+R4+CAN1-CAN8)

| Tarea | Requisitos (primario) | # Escenarios primarios | Soporte (mismo escenario, otro nivel) |
|---|---|---|---|
| T1 | — (sin requisito propio; captura y verificación de insumos para T2/T7) | 0 | — |
| T2 | CAN2(1), CAN3(1), CAN5(2), CAN8(2) | 6 | R3 esc. "firma inválida" (unitario, confirmado también en T3) |
| T3 | R3(2), CAN1(1), R4 esc. "Reintento del proveedor sobre un evento entrante"(1) | 4 | CAN2, CAN3, CAN5 (integración, mismos títulos que T2) |
| T4 | CAN4(1) | 1 | R4 esc. "Reintento del proveedor..." (confirma "se ejecuta una sola vez") |
| T5 | CAN6(3) | 3 | CAN7 (clasificación 429/5xx/4xx a nivel de cliente, confirmada en T7) |
| T6 | — (mecanismo genérico del outbox; sin escenario propio de `canales`) | 0 | — |
| T7 | CAN7(2), R4 esc. "Reintento de un job de envío tras un fallo"(1) | 3 | — |
| T8 | — (infraestructura local, sin escenario de spec) | 0 | — |
| T9 | — (documentación) | 0 | — |
| **Total** | | **17** | |

## Matriz de amenazas aplicable a esta fase

Reproducida desde `design.md` §"Threat Matrix" (regla de la skill: las filas se copian sin cambios;
la matriz formal de la skill genérica —rutas de documentación, VCS/PR, shell— es **N/A** para esta
fase; los vectores propios sí aplican, ninguno es `N/A`):

| Vector | Mitigación | RED test | Tarea(s) |
|---|---|---|---|
| Petición falsificada al webhook | HMAC sobre body crudo en guardia, antes de todo (D3) | firma inválida/ausente → 401, sin fila | T2 (unitario), T3 (integración) |
| Replay de un payload capturado | Tolerancia de timestamp 300 s con `CLOCK` (D3); dedupe por `(origen, id_externo)` dentro y fuera de la ventana | timestamp a 301 s → 401 | T2 |
| Firma validada sobre JSON re-serializado | `req.rawBody` nativo (D2); el HMAC nunca usa `JSON.stringify(req.body)` | fixture con espacios/orden de claves no canónico firmado de verdad → 200 | T3 |
| Despliegue sin secreto acepta todo | Secreto vacío ⇒ `false` (falla cerrada) + `superRefine` en production | secreto `''` → 401 | T2 |
| Cuerpo gigante (DoS de memoria) | Límite 1 MB en el parser (D2) | 1 MB + 1 byte → 413 | T3 |
| PII en la base (R14) | Lista blanca en la traducción (D4), `wamid` excluido, `efimero` eliminado al cerrar la fila (D10), `error` sin `message` libre (D7) | aserciones negativas sobre fixtures; fila enviada sin `efimero` | T2 (lista blanca), T4 (`error` sin `message` libre), T7 (`efimero` eliminado) |
| PII en logs (R14) | `req.body` ya redactado; clientes y procesadores loguean ids, nunca contenido ni token | test de redacción existente + caso con cabecera `api_access_token` | T4, T5 |
| Token de Chatwoot filtrado en errores | `FalloCanal` solo con método, `pathname` y status (D12) | fallo 500 → mensaje sin token ni cuerpo | T5 |
| Mensaje duplicado al cliente | Clave única + marca por fila + reconciliación (D11, D13) | escenario de respuesta perdida | T7 |

Ninguna tarea de esta fase agrega una fila propia distinta a las que `design.md` ya identificó.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3.450 líneas de autoría (estimación propia de `sdd-tasks`; cada tarea la corrige con su diff real al aplicarla) |
| 400-line budget risk | **Alto**: T3 (~500, webhook+inbox+wiring de `AppModule`+contrato), T5 (~480, dos puertos+cliente HTTP+adaptador+doble de Chatwoot), T6 (~560, outbox genérico completo+migración), T2 (~480, seis archivos de dominio puro con dos specs por archivo). Medio en T4, T7. Bajo en T1, T8, T9 |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → … → PR9 (9 tareas, ver abajo) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Alto

`Decision needed before apply: No` porque `auto-chain` ya trae la cadena `stacked-to-main` cacheada
desde el preflight de esta sesión y desde "Entrega" de `proposal.md`/`design.md`; `sdd-apply` procede
con T1 sin pedir confirmación adicional.

**Excepción automática vs. pregunta explícita, por tarea** (`openspec/config.yaml` §rules.tasks: "si
el exceso ya está anticipado y motivado en la tabla de Risks de `proposal.md`, `tasks.md` aplica
`size:exception` automáticamente ...; solo se pregunta cuando el exceso no estaba previsto"). La fila
4 de Risks de `proposal.md` anticipa explícitamente **"presupuesto de ~400 líneas por slice con
varios adaptadores e infraestructura nueva"**, y `design.md` §"Migration / Rollout" agrega que la
slice `(e)` es "la slice con más riesgo de superar ~400 líneas" y por eso la abre en `(e1)`/`(e2)`
por adelantado:

- **T3 (webhook+inbox, infraestructura nueva), T4 (BullMQ, infraestructura nueva), T5 (adaptador
  Chatwoot, infraestructura nueva), T6 (`plataforma/outbox`, infraestructura nueva)**: si el diff
  real confirma o supera el estimado, `size:exception` se aplica **automáticamente**, citando esa fila
  de Risks; `sdd-apply` no pregunta.
- **T2 (dominio puro), T7 (aplicación: `SalidaCanalOutbox`/`PublicarEfectoCanal`)**: no son
  "infraestructura" — **no** están anticipadas por esa fila. Si su diff real supera
  significativamente el presupuesto, `sdd-apply` **MUST pedir `size:exception` al usuario** antes de
  continuar con la siguiente tarea (mismo criterio que T2/T8/T9 de la Fase 03).
- **T1, T8, T9**: bajo presupuesto esperado; sin exención necesaria.

Ninguna tarea recorta tests, comentarios ni documentación para acercarse al presupuesto.

Estimación de líneas de autoría por tarea (propia de `sdd-tasks`, no medida — cada tarea la corrige
con su diff real al aplicarla):

| Tarea | Archivo(s) principal(es) | Estimado | Anticipado en Risks de `proposal.md` |
|---|---|---|---|
| T1 | fixtures JSON + README de procedencia + `test/soporte/chatwoot.ts` (+ script opcional de captura) | ~220 | No (bajo presupuesto) |
| T2 | 6 archivos de `dominio/` + `infraestructura/chatwoot/{verificar-firma,traducir-evento,canal-desde-chatwoot}.ts` + 6 specs | ~480 | **No** — pregunta si excede |
| T3 | `main.ts`, `configurar-aplicacion.ts`, guardia, controlador, repositorio, módulo, `AppModule`, catálogo de códigos, contrato OpenAPI, config, test de integración | ~500 | **Sí** — fila 4 de Risks (infraestructura nueva) |
| T4 | `plataforma/colas` (3 archivos) + procesador + puerto/registro/consumidor de eventos + test de integración | ~380 | **Sí** — fila 4 (BullMQ) |
| T5 | 2 puertos + `ClienteChatwoot` + `AdaptadorCanalChatwoot` + `chatwoot-falso.ts` + test de integración | ~480 | **Sí** — fila 4 (adaptador Chatwoot) |
| T6 | migración Prisma + `MODELO_DATOS.md` + `plataforma/outbox` completo (8 archivos + specs) + enmienda ADR-0004 + test de integración | ~560 | **Sí** — fila 4 (outbox) |
| T7 | `SalidaCanalOutbox`, `PublicarEfectoCanal` + specs + test de integración + e2e | ~430 | **No** — pregunta si excede |
| T8 | `infra/chatwoot/{docker-compose.yml,.env.example,init/*}`, `scripts/chatwoot-*.sh`, `.env.example` del repo | ~180 | No (bajo presupuesto) |
| T9 | doc 04 §3, skill `whatsapp-meta-conventions`, `.atl/skill-registry.md`, skill `luxeboreal-arquitectura` | ~110 | No — sin cambios de producción, sin riesgo de presupuesto (`openspec/config.yaml` §rules.tasks) |
| **Total** | | **~3.340** | |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | T1: fixtures reales anonimizados + verificación de `X-Chatwoot-Delivery`/`content_attributes` (Q3) | PR1 | `npm test -- test/soporte/chatwoot` | Chatwoot local v4.17.1 (manual, no automatizado) para grabar y verificar los payloads | Revertir `test/fixtures/chatwoot/**`, `test/soporte/chatwoot.ts`, `scripts/capturar-fixtures-chatwoot.ts` si se creó |
| 2 | T2: firma, traducción/redacción, perfil, claves (CAN2, CAN3, CAN5, CAN8) | PR2 | `npm test -- modulos/canales/dominio` `npm test -- modulos/canales/infraestructura/chatwoot` | N/A — funciones puras, sin I/O | Revertir `src/modulos/canales/dominio/**`, `src/modulos/canales/infraestructura/chatwoot/{verificar-firma,traducir-evento,canal-desde-chatwoot}.ts` (+specs) |
| 3 | T3: webhook + inbox + dedupe (R3, CAN1, CAN2, CAN3, CAN5, R4 esc. 1) | PR3 | `npm run test:integracion -- webhook` | Postgres + Redis reales (Testcontainers); app completa vía Supertest | Revertir `src/modulos/canales/{interfaz,puertos,aplicacion,infraestructura}/**` de esta tarea, `src/main.ts`, `src/configurar-aplicacion.ts`, `src/app.module.ts`, `src/plataforma/errores/catalogo-codigos.ts`, contrato OpenAPI regenerado |
| 4 | T4: BullMQ + procesador del inbox (CAN4) | PR4 | `npm run test:integracion -- procesador-inbox` | Redis real (Testcontainers) + Postgres real | Revertir `src/plataforma/colas/**`, `src/modulos/canales/{puertos/consumidor-eventos-canal,aplicacion/registro-consumidor-eventos-canal,aplicacion/consumidor-registrador,aplicacion/procesar-evento-entrante,infraestructura/procesador-inbox,infraestructura/cola-eventos-entrantes-bullmq}.ts`; `package.json` (`bullmq`, `@nestjs/bullmq`) |
| 5 | T5: puerto de salida + adaptador Chatwoot (CAN6) | PR5 | `npm run test:integracion -- adaptador-chatwoot` | `test/soporte/chatwoot-falso.ts` (servidor HTTP local) | Revertir `src/modulos/canales/puertos/{salida-canal,adaptador-canal}.ts`, `src/modulos/canales/infraestructura/chatwoot/{cliente-chatwoot,adaptador-canal-chatwoot}.ts` (+specs), `test/soporte/chatwoot-falso.ts` |
| 6 | T6: `plataforma/outbox` genérico + migración `clave_idempotencia` | PR6 | `npm run test:integracion -- publicador-outbox` | Postgres real (Testcontainers) | Revertir `src/plataforma/outbox/**`, `prisma/migrations/<ts>_outbox_clave_idempotencia/` (con migración inversa, nunca editando la aplicada), `prisma/schema.prisma`, `MODELO_DATOS.md` §7, `docs/adr/0004-inbox-outbox.md` |
| 7 | T7: `SalidaCanalOutbox` + reconciliación + e2e (CAN7, R4 esc. 2) | PR7 | `npm run test:e2e -- canal-chatwoot` | Postgres + Redis reales + `chatwoot-falso.ts` | Revertir `src/modulos/canales/aplicacion/{salida-canal-outbox,publicar-efecto-canal}.ts` (+specs), `test/integracion/canales/salida-outbox.spec.ts`, `test/e2e/canal-chatwoot.e2e-spec.ts` |
| 8 | T8: entorno local de Chatwoot portado | PR8 | Sin test automatizado — verificación manual: `scripts/chatwoot-up.sh` levanta Chatwoot local y el webhook del Agent Bot apunta a `/api/v1/webhooks/chatwoot` | Instancia local de Chatwoot v4.17.1 | Revertir `infra/chatwoot/**`, `scripts/chatwoot-*.sh`, líneas nuevas de `.env.example` |
| 9 | T9: cierre documental | PR9 | Sin test — revisión de contenido (doc-only, exención de la tabla completa) | N/A | Revertir `docs/analisis/04-chatwoot-delegar-vs-construir.md` §3, `.claude/skills/whatsapp-meta-conventions/`, `.atl/skill-registry.md`, `.claude/skills/luxeboreal-arquitectura/SKILL.md` |

Diagrama de dependencia (cadena lineal, `stacked-to-main`; cada PR se fusiona a `main` antes de abrir
el siguiente, siguiendo el Approach de `proposal.md`: fixtures → dominio → entrada → colas → salida →
outbox genérico → outbox de canales → infra → docs):

```
PR1 (fixtures) → PR2 (dominio puro) → PR3 (webhook+inbox) → PR4 (BullMQ+procesador)
  → PR5 (adaptador Chatwoot) → PR6 (outbox genérico+migración) → PR7 (SalidaCanalOutbox+e2e)
  → PR8 (infra local) → PR9 (cierre documental)
```

---

## T1 — Fixtures reales de Chatwoot anonimizados + verificación de campos

**Objetivo**: obtener los payloads reales de Chatwoot que usan todos los tests de firma/parseo/webhook
de esta fase (Scope 9 de la proposal; Q3 de "Preguntas abiertas") y, con la misma captura, verificar
contra Chatwoot v4.17.1 local dos hechos que condicionan D4 y D13 de `design.md`: si
`X-Chatwoot-Delivery` llega en `conversation_status_changed`, y si `content_attributes` enviado en un
mensaje `outgoing` de texto se persiste, vuelve en el `GET` y no se reenvía a WhatsApp.

**Dependencias**: ninguna (primera tarea de la fase).

**Archivos** (`design.md`, tabla "File Changes", filas 1 y "scripts/capturar-fixtures-chatwoot.ts"):
- `test/fixtures/chatwoot/*.json` (Create) — `message_created` incoming (texto y con adjunto),
  outgoing humano, outgoing bot, nota privada, `conversation_status_changed` (`open`, `pending`,
  `resolved`), un evento ignorado. Anonimizados (sin teléfono, nombre, correo real).
- `test/fixtures/chatwoot/README.md` (Create) — procedencia de cada fixture (grabado contra qué
  versión de Chatwoot, en qué fecha, qué campos se anonimizaron).
- `test/soporte/chatwoot.ts` (Create) — `firmarComoChatwoot`, carga de fixtures (solo test y script de
  captura; no es código de producción, D3).
- `scripts/capturar-fixtures-chatwoot.ts` (Create, solo si no existen capturas reutilizables del
  prototipo) — graba contra la instancia local y anonimiza antes de versionar.

**Escenarios cubiertos**: ninguno con id propio (tarea de insumos); habilita CAN2/CAN3/CAN5/CAN8 (T2)
y R3/CAN1/R4 esc. 1 (T3), y confirma o descarta la reconciliación de D13 (T7) antes de construirla.

**RED → GREEN → REFACTOR** (planificado; riesgo técnico no verificado — `design.md` D13 "Condicionado
a verificación"):
1. RED: `test/soporte/chatwoot.spec.ts` (o equivalente) que carga un fixture inexistente y falla.
2. GREEN: capturar los fixtures reales contra Chatwoot local (o reutilizar capturas anonimizadas del
   prototipo si existen, confirmando su procedencia), anonimizarlos, implementar `firmarComoChatwoot` y
   la carga de fixtures.
3. **Verificación real (no asumir)**: contra el Chatwoot local, enviar un mensaje `outgoing` con
   `content_attributes: { luxe_clave: '<clave-de-prueba>' }` y confirmar con un `GET
   .../conversations/{id}/messages` que (a) el atributo vuelve tal cual y (b) no se reenvía un segundo
   mensaje a WhatsApp. Anotar el resultado exacto (con o sin éxito) en este archivo antes de cerrar la
   tarea — T7 lo lee para decidir si construye la reconciliación de D13 o el escenario alternativo de
   "fallo con respuesta recibida".
4. REFACTOR: confirmar que ningún fixture contiene un teléfono, nombre o correo real; que
   `firmarComoChatwoot` vive solo en `test/soporte/`, nunca en `src/`.

**Hecho cuando**:
- Existen fixtures para los 8 tipos de evento listados (Scope 9), sin datos personales reales.
- `README.md` de fixtures documenta procedencia y anonimización de cada uno.
- Queda registrado (en este archivo, sección abajo) si `content_attributes`/`X-Chatwoot-Delivery` se
  comportan como D4/D13 asumen, o si hace falta ajustar T7.

**Comando de test**: `npm test -- test/soporte/chatwoot`

**Slice de PR**: S(a)

**Review requerida**: RDD

### Resultado de la verificación (`sdd-apply`, 2026-09-26, contra Chatwoot v4.17.1 local real)

- [x] `X-Chatwoot-Delivery` llega en `conversation_status_changed`: **Sí, siempre.** Confirmado
  empíricamente en las tres capturas reales (`open`, `pending`, `resolved`: cada una con un UUID de
  entrega distinto) y en el código fuente de Chatwoot v4.17.1
  (`app/listeners/agent_bot_listener.rb`: todo evento de `AgentBotListener` — incluido
  `conversation_status_changed` — se dispara con `delivery_id: SecureRandom.uuid`, sin condición).
  D4 puede usar `X-Chatwoot-Delivery` como primera opción de dedupe tal como asumía.
- [x] `content_attributes.luxe_clave` se persiste y vuelve en el `GET`: **Sí.** Se envió un mensaje
  `outgoing` con `content_attributes: { luxe_clave: "prueba-d13" }` vía el token del propio Agent
  Bot y se releyó con una petición `GET .../conversations/{id}/messages` nueva (no la respuesta de
  creación): volvió con `content_attributes.luxe_clave` idéntico.
- [x] `content_attributes.luxe_clave` no provoca un segundo envío a WhatsApp: **Matizado — ver
  detalle.** El inbox de prueba es `Channel::Api` ("WhatsApp (pruebas)"), no el canal real de
  WhatsApp Cloud, así que no hay un envío a WhatsApp que observar desde esta instancia local. Lo que
  sí se confirmó: repetir el mismo `POST` con el mismo `content_attributes.luxe_clave` **no fue
  rechazado ni deduplicado por Chatwoot** — creó un segundo mensaje con la misma marca. Es decir,
  **Chatwoot no deduplica por `content_attributes` de forma nativa**; la reconciliación de D13
  (`existeMensajeConMarca`, T7) depende enteramente de que el propio adaptador consulte el `GET`
  antes de decidir reenviar. Esto no descarta la reconciliación planeada — confirma por qué es
  necesaria. **Decisión para T7**: construir la reconciliación completa de D13 como estaba diseñada
  (no el escenario alternativo "fallo con respuesta recibida"), porque el punto anterior confirma que
  la marca persiste y es consultable vía `GET`.

Detalle completo del método de captura, la anonimización aplicada y la evidencia de cada punto:
`test/fixtures/chatwoot/README.md` (secciones "Verificación D13" y "Verificación de
`X-Chatwoot-Delivery`").

---

## T2 — Dominio puro de canales: firma, traducción/redacción, perfil, claves

**Objetivo**: portar y construir todas las funciones puras del dominio de `canales` (D3, D4, D11,
D14): verificación de firma HMAC, traducción/redacción por lista blanca a `EventoCanal`, mapeo de
`conversation.channel` a `CanalOrigen`, perfil de capacidades y construcción de claves de idempotencia.
Ninguna importa NestJS, Prisma ni Redis (`dominio-aislado`).

**Dependencias**: T1 (fixtures reales y el resultado de la verificación de `X-Chatwoot-Delivery`).

**Archivos** (`design.md`, tabla "File Changes", filas de la slice (a)):
- `src/modulos/canales/dominio/evento-canal.ts` (Create) — `EventoCanal`, `CanalOrigen`,
  `TipoContenido`, `EstadoConversacionCanal`, `ReferenciaConversacion` (D4).
- `src/modulos/canales/dominio/perfil-capacidades.ts` + `.spec.ts` (Create) — `perfilDeCapacidades`
  (D14, CAN8).
- `src/modulos/canales/dominio/claves-idempotencia.ts` + `.spec.ts` (Create) — `claveMensaje`,
  `claveEstado`, `claveEtiquetas`, `grupoConversacion`, `MAX_PASOS_SECUENCIA` (D11).
- `src/modulos/canales/infraestructura/chatwoot/verificar-firma.ts` + `.spec.ts` (Create) —
  `verificarFirmaChatwoot`, portado, con `ahoraSegundos` obligatorio desde `CLOCK` (D3).
- `src/modulos/canales/infraestructura/chatwoot/traducir-evento.ts` + `.spec.ts` (Create) —
  `traducirEvento`: esquema `zod` (`looseObject`), normalización y redacción por lista blanca (D4,
  CAN3, CAN5).
- `src/modulos/canales/infraestructura/chatwoot/canal-desde-chatwoot.ts` + `.spec.ts` (Create) —
  `canalDesdeChatwoot` (D14).

**Escenarios cubiertos** (título exacto, `specs/canales/spec.md`):
- `CAN2 — Una petición sin cabecera de firma se rechaza sin registrar nada` (unitario, sobre
  `verificarFirmaChatwoot`; ver también T3)
- `CAN3 — Un evento de un tipo distinto a los reconocidos se ignora sin registrarse` (unitario, sobre
  `traducirEvento`; ver también T3)
- `CAN5 — Un evento con texto y adjuntos se registra sin ese contenido` (unitario, aserción negativa
  sobre `traducirEvento`; ver también T3)
- `CAN5 — El teléfono completo del contacto nunca queda en el payload guardado` (unitario, aserción
  negativa; ver también T3)
- `CAN8 — El canal WhatsApp devuelve su perfil de capacidades real`
- `CAN8 — Un canal distinto de WhatsApp devuelve un perfil explícito de no soportado`
- Soporte: `R3 — Evento con firma inválida` (unitario, sobre `verificarFirmaChatwoot`; confirmado en
  T3 a nivel de integración)

**RED → GREEN → REFACTOR** (planificado):
1. RED: los seis `*.spec.ts` contra los módulos inexistentes. Correr
   `npm test -- modulos/canales/dominio` y `npm test -- modulos/canales/infraestructura/chatwoot` y
   observar fallo.
2. GREEN: implementar `verificarFirmaChatwoot` (comparación en tiempo constante con
   `crypto.timingSafeEqual`, secreto vacío ⇒ `false`, tolerancia de 300 s vía `CLOCK`), `traducirEvento`
   (lista blanca de D4, tabla de eventos reconocidos/ignorados, aserción negativa de PII sobre cada
   fixture de T1), `canalDesdeChatwoot`, `perfilDeCapacidades` y las funciones de
   `claves-idempotencia.ts` hasta que los seis specs pasen.
3. REFACTOR: confirmar que ningún archivo de `dominio/` importa `zod` ni `node:crypto` desde fuera de
   `infraestructura/chatwoot/` (D1: la firma y la traducción son puras pero hablan Chatwoot, viven en
   `infraestructura/`); que `traducirEvento` nunca guarda `content`, `attachments`, coordenadas,
   `phone_number`, `identifier`, `name`, `email` ni el `source_id` del mensaje o del `contact_inbox`
   (D4).

**Hecho cuando**:
- Los seis escenarios listados pasan, con el título exacto del escenario como nombre del test.
- El JSON serializado de `EventoCanal` para cada fixture de T1 no contiene texto, URL de adjunto,
  teléfono, nombre, correo ni `wamid` de ningún fixture (aserción negativa explícita en el spec).
- `verificarFirmaChatwoot` con secreto `''` devuelve `false` para cualquier firma (falla cerrada).
- Ningún archivo de esta tarea depende de NestJS, Prisma ni Redis.

**Comando de test**: `npm test -- modulos/canales/dominio` + `npm test -- modulos/canales/infraestructura/chatwoot`

**Slice de PR**: S(a)

**Review requerida**: RDD

---

## T3 — Webhook + inbox + dedupe

**Objetivo**: exponer `POST /api/v1/webhooks/chatwoot` con ACK rápido (D5): body crudo (D2), guardia
de firma (D3) antes de cualquier lógica, traducción del evento, inserción en `evento_entrante` con
dedupe por `(origen, id_externo)`, respuesta 2xx en menos de 500 ms. Registra `CanalesModule` en
`AppModule` por primera vez (D16) con una cola doble que todavía no encola de verdad.

**Dependencias**: T2 (`verificarFirmaChatwoot`, `traducirEvento`).

**Riesgos técnicos no verificados de `design.md` a confirmar con un test real, no asumir**:
- **D2**: si el `FiltroProblemJson` global ya traduce los errores del parser (`entity.too.large` →
  413, `entity.parse.failed` → 400) a `application/problem+json` con los códigos nuevos. El RED test
  de esta tarea lo demuestra; si el filtro **no** los recibe en la forma esperada, se implementa el
  middleware `traducirErrorDeCuerpo` que describe D2 y se anota aquí cuál de las dos rutas se tomó.

**Archivos** (`design.md`, tabla "File Changes", slice (b)):
- `src/configurar-aplicacion.ts`, `src/main.ts` (Modify) — `OPCIONES_APLICACION = { rawBody: true }`,
  límite JSON de 1 MB (`app.useBodyParser('json', { limit: '1mb' })`), middleware
  `traducirErrorDeCuerpo` solo si el RED test demuestra que hace falta (D2).
- `src/plataforma/errores/catalogo-codigos.ts` (Modify) — `firma-invalida` (401),
  `carga-demasiado-grande` (413), `validacion-fallida` (400).
- `src/plataforma/config/esquema.ts` + spec (Modify) — `CHATWOOT_URL`, `CHATWOOT_ACCOUNT_ID`,
  `CHATWOOT_BOT_TOKEN`, `CHATWOOT_WEBHOOK_SECRETO`, `CHATWOOT_WEBHOOK_TOLERANCIA_S`,
  `CHATWOOT_HTTP_TIMEOUT_MS`.
- `src/modulos/canales/puertos/{repositorio-evento-entrante,cola-eventos-entrantes}.ts` (Create) —
  tokens + interfaces (D5, D7); la implementación real de `COLA_EVENTOS_ENTRANTES` llega en T4, aquí
  se registra un doble que no encola.
- `src/modulos/canales/infraestructura/repositorio-evento-entrante-prisma.ts` (Create) — `registrar`
  (traduce `P2002` a `{ resultado: 'duplicado' }`) y el resto de métodos de D7.
- `src/modulos/canales/aplicacion/registrar-evento-entrante.ts` + spec (Create) — D5: registra, encola
  con tope de 200 ms, responde `{ estado: 'registrado' | 'duplicado' | 'ignorado' }`.
- `src/modulos/canales/interfaz/{guardia-firma-chatwoot,webhook-chatwoot.controller,esquemas}.ts`
  (Create) — D3, D5; `@ApiTags('internal')` (API8).
- `src/modulos/canales/canales.module.ts`, `index.ts`; `src/app.module.ts` (Create/Modify) — D16.
- `openapi/openapi.interno.json`, `openapi/openapi.json` (Modify) — regenerados en el mismo commit.
- `scripts/generar-contrato.ts`, `test/contrato/soporte.ts`, `test/contrato/docs.spec.ts`,
  `test/e2e/aplicacion.e2e-spec.ts` (Modify) — campos nuevos de `Configuracion`, `OPCIONES_APLICACION`.
- `.env.example` (Modify) — variables `CHATWOOT_*`.
- `test/integracion/canales/webhook.spec.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `R3 — Evento con firma válida` (`openspec/specs/canales/spec.md`)
- `R3 — Evento con firma inválida` (`openspec/specs/canales/spec.md`)
- `CAN1 — El webhook responde antes de 500 ms tras registrar el evento`
- `R4 — Reintento del proveedor sobre un evento entrante` (`openspec/specs/canales/spec.md`, dedupe
  por `INSERT`; la confirmación de "se ejecuta una sola vez" la cierra T4)
- Confirmación de integración (mismo título que T2): `CAN2 — Una petición sin cabecera de firma se
  rechaza sin registrar nada`, `CAN3 — Un evento de un tipo distinto a los reconocidos se ignora sin
  registrarse`, `CAN5 — Un evento con texto y adjuntos se registra sin ese contenido`, `CAN5 — El
  teléfono completo del contacto nunca queda en el payload guardado`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `webhook.spec.ts` con la app real (Postgres + Redis de Testcontainers) contra el controlador
   inexistente: firma válida → fila + 2xx; inválida/ausente → 401 sin fila; tipo desconocido → 2xx sin
   fila; duplicado → una fila; > 1 MB → 413; body no-JSON → 400. Correr
   `npm run test:integracion -- webhook` y observar fallo.
2. GREEN: implementar `OPCIONES_APLICACION`, la guardia, el controlador, el repositorio y
   `RegistrarEventoEntrante` hasta que todos los casos pasen; medir el tiempo de respuesta en el mismo
   test (CAN1, < 500 ms).
3. REFACTOR: confirmar que la guardia de firma corre antes que cualquier pipe/interceptor (orden de
   NestJS); que `req.body`/`req.rawBody` nunca se loguean (matriz de amenazas); regenerar
   `openapi/openapi.interno.json`/`openapi/openapi.json` y confirmar `npm run contrato:deriva` sin
   diferencia.

**Nota de tamaño**: agrupa `main.ts`, guardia, controlador, repositorio, módulo, wiring de
`AppModule` y contrato — está **anticipada** por la fila 4 de Risks de `proposal.md`
("infraestructura nueva"); si el diff real confirma o supera el estimado, `size:exception` se aplica
automáticamente, citando esa fila; `sdd-apply` no pregunta.

**Hecho cuando**:
- Los escenarios listados pasan, con el título exacto del escenario como nombre del test, contra
  Postgres/Redis reales.
- El ACK del webhook mide menos de 500 ms en el test de integración.
- `npm run contrato:deriva` sin diferencia tras regenerar el contrato en el mismo commit.
- Queda anotado en esta tarea si se necesitó `traducirErrorDeCuerpo` (D2) o si el filtro global ya
  bastaba.

**Comando de test**: `npm run test:integracion -- webhook`

**Slice de PR**: S(b)

**Review requerida**: RDD

### Resultado de la verificación de los dos riesgos técnicos (`sdd-apply`, 2026-09-27, evidencia real)

1. **Body crudo global (`rawBody: true`)**: **confirmado con un test de integración real**
   (`test/integracion/canales/webhook.spec.ts`, escenario "R3 — Evento con firma válida"). La firma
   se verifica correctamente sobre el body crudo cuando la app se crea con
   `NestFactory.create<NestExpressApplication>(AppModule, { ...OPCIONES_APLICACION })` +
   `app.useBodyParser('json', { limit: '1mb' })` (`configurarAplicacion`); los demás endpoints
   (`GET /health`, `/docs`) siguen respondiendo sin cambios (e2e completo en verde). **Hallazgo real
   de RED no anticipado por `design.md`**: en el harness de prueba, `supertest`/`superagent`
   serializa un `Buffer` pasado a `.send()` como JSON (`{"type":"Buffer","data":[...]}`) en vez de
   escribir sus bytes crudos cuando `Content-Type` es `application/json` — el body que llegaba al
   servidor no era el fixture firmado, sino su representación JSON inflada. Corregido enviando
   `fixture.rawBody.toString('utf8')` (los fixtures son JSON UTF-8 sin BOM, viaje de ida y vuelta
   idéntico byte a byte); el mecanismo de `rawBody: true` de NestJS en sí mismo funciona
   correctamente una vez que el test le entrega los bytes reales.
2. **413/400 del parser de body llegando al filtro global**: **no llegaban** — confirmado con un
   test de integración real. Un cuerpo > 1 MB (`entity.too.large`) respondía **500** genérico
   (`error-interno`), y un cuerpo JSON malformado (`entity.parse.failed`) respondía 400 pero con
   `Content-Type: application/json` (el manejador de errores por defecto de Express, no
   `FiltroProblemJson`). Motivo: estos errores los lanza el parser de `body-parser`, middleware de
   Express que corre **antes** de que el router de NestJS despache la petición — la zona de
   excepciones de Nest (y por tanto `FiltroProblemJson`, que solo ve esa zona) nunca los recibe.
   Se implementó el middleware `traducirErrorDeCuerpo` (D2, respaldo que `design.md` ya anticipaba)
   en `src/configurar-aplicacion.ts`, registrado con `app.use(...)` justo después de
   `app.useBodyParser(...)`: detecta `error.type === 'entity.too.large'` → 413
   `carga-demasiado-grande`, `error.type === 'entity.parse.failed'` → 400 `validacion-fallida`,
   ambos como `application/problem+json` real (vía `construirProblema`); cualquier otro error se
   reenvía sin tocar (`next(error)`). Confirmado en verde con los dos escenarios D2 del test de
   integración.

**Hallazgo real adicional, no anticipado por `design.md` (documentado, no silencioso)**: bajo
`@nestjs/testing` (`TestingInjector`), un provider de `CanalesModule` que inyecta `PinoLogger` de
`nestjs-pino` con `@InjectPinoLogger` no siempre resuelve cuando `AppModule` compone
`CanalesModule` junto a otros módulos que también dependen del `LoggerModule` global (`ErroresModule`
vía `ObservabilidadModule`) — reproducido de forma aislada (`Test.createTestingModule`) y confirmado
que **`NestFactory.create` real (producción) nunca lo sufre** (probado con un script de arranque
real). Se evitó el problema por completo: `RegistrarEventoEntrante` usa `Logger` de `@nestjs/common`
(`new Logger(...)`, sin `@Inject`) en vez de `@InjectPinoLogger` — `configurarAplicacion` ya llama
`app.useLogger(app.get(Logger))` (D14), que sobrescribe el logger estático de Nest para todo el
proceso, así que `new Logger(...)` sigue saliendo por el transporte de `nestjs-pino` con la misma
redacción, sin depender de su DI. `CanalesModule` no importa `plataforma/observabilidad`.

---

## T4 — `plataforma/colas` + procesador del inbox

**Objetivo**: registrar BullMQ sobre el Redis existente (D6) con conexiones propias y cierre ordenado
(PLT5), y construir el procesador real del inbox (D7): reintentos con backoff, marca de `error`
visible al agotar intentos, barrido de pendientes.

**Dependencias**: T3 (puertos `RepositorioEventoEntrante`/`ColaEventosEntrantes` ya definidos; el
doble de cola de T3 se sustituye por la implementación real de esta tarea).

**Riesgo técnico no verificado de `design.md` D6 — confirmar antes de implementar, no asumir**:
correr `npm view @nestjs/bullmq peerDependencies` y un RED test que registre `ColasModule` dentro de
un `TestingModule` de `@nestjs/common@^12` real. Si no existe versión compatible, aplicar el plan B de
D6: un `ColasModule` propio que instancia `Queue`/`Worker` de `bullmq` directamente, con los mismos
puntos de arranque/cierre (misma interfaz para `canales` y `outbox`; solo cambia
`plataforma/colas`). Anotar en esta tarea cuál de las dos rutas se tomó y por qué.

**Archivos** (`design.md`, tabla "File Changes", slice (c)):
- `package.json` (Modify) — `bullmq`, `@nestjs/bullmq`.
- `src/plataforma/colas/{colas.module.ts,opciones-conexion.ts,index.ts}` + spec (Create) — D6.
- `src/modulos/canales/puertos/consumidor-eventos-canal.ts` (Create) — token + interfaz (D8).
- `src/modulos/canales/aplicacion/{registro-consumidor-eventos-canal,consumidor-registrador,procesar-evento-entrante}.ts`
  + specs (Create) — D7, D8.
- `src/modulos/canales/infraestructura/{procesador-inbox,cola-eventos-entrantes-bullmq}.ts` (Create) —
  D6, D7; sustituye el doble de T3.
- `test/integracion/canales/procesador-inbox.spec.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `CAN4 — Un consumidor que falla siempre agota los reintentos con error e intentos visibles`
- Confirmación de R4 (mismo escenario que T3, cierra la parte de "se ejecuta una sola vez"): `R4 —
  Reintento del proveedor sobre un evento entrante`

**RED → GREEN → REFACTOR** (planificado):
1. RED: primero, el test de compatibilidad de `@nestjs/bullmq` con Nest 12 (ver riesgo arriba). Luego
   `procesador-inbox.spec.ts` con los 2 escenarios contra el procesador inexistente. Correr
   `npm run test:integracion -- procesador-inbox` y observar fallo.
2. GREEN: implementar `ColasModule` (o el plan B), `ProcesadorInbox` (`iniciarIntento`, éxito →
   `procesado_en`, fallo → BullMQ reintenta con `attempts: INBOX_MAX_INTENTOS = 5`,
   `backoff: { type: 'exponential', delay: 2000 }`; último intento marca `error` antes de relanzar),
   `ConsumidorRegistrador` (log `info` sin contenido) y el barrido cada `INBOX_BARRIDO_MS = 30 s`.
3. REFACTOR: confirmar que `error` guarda solo `<Clase>[: código]`, nunca el `message` libre (R14);
   que toda `Queue`/`Worker` tiene un listener de `'error'` (D6); que el cierre en
   `beforeApplicationShutdown` espera el job activo antes de que Prisma se desconecte (PLT5).

**Hecho cuando**:
- Los escenarios listados pasan, con el título exacto del escenario como nombre del test.
- El mismo evento enviado dos veces produce una sola ejecución del consumidor (mismo doble contador).
- Un consumidor que falla siempre deja la fila con `error` e `intentos = 5`, sin borrarla.
- `error` nunca contiene el `message` libre de la excepción original.
- Queda anotado si se usó `@nestjs/bullmq` directo o el plan B de `ColasModule` propio.

**Comando de test**: `npm run test:integracion -- procesador-inbox`

**Slice de PR**: S(c)

**Review requerida**: RDD

### Resultado de la verificación del riesgo técnico (`sdd-apply`, 2026-09-27, evidencia real)

**Compatibilidad de `@nestjs/bullmq` con NestJS 12 — confirmada, sin plan B**:

1. `npm view @nestjs/bullmq peerDependencies` (real, no supuesto):
   `{ bullmq: '^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0', '@nestjs/core': '^10.0.0 || ^11.0.0 || ^12.0.0', '@nestjs/common': '^10.0.0 || ^11.0.0 || ^12.0.0' }`
   — cubre `@nestjs/common@^12.1.0` (`package.json` de este repo) y `bullmq@^6.3.9` (última versión).
2. `npm install bullmq@^6.3.9 @nestjs/bullmq@^12.0.0 --save`: instaló sin conflictos de peer
   dependencies (`npm ls` sin advertencias de `ERESOLVE`).
3. RED→GREEN real (no un `TestingModule` de sanidad aparte, D6 lo permite: "un RED test que
   registre `ColasModule`"): `test/integracion/canales/procesador-inbox.spec.ts` construye un
   `Test.createTestingModule` real con `ColasModule` + `BullModule.registerQueue('canales-inbox')`
   contra Redis real de Testcontainers, con `NestFactory`/`app.init()` real (para que
   `onApplicationBootstrap`/`beforeApplicationShutdown` corran). Los dos escenarios (CAN4, R4 esc.
   1) pasan: BullMQ arranca el *worker*, reintenta con backoff exponencial, deduplica por `jobId`, y
   `beforeApplicationShutdown` cierra el *worker* sin colgar el proceso. **Conclusión: no hace
   falta el plan B de `design.md` (un `ColasModule` propio sobre `bullmq` crudo) — se construyó
   sobre `@nestjs/bullmq` tal como D6 prefería.**

**Hallazgo real no anticipado por `design.md` (documentado, no silencioso)**: BullMQ tipa
`connection` de `QueueOptions` contra su **propio** `RedisOptions`/`ConnectionOptions`
(`bullmq/dist/.../redis-options.d.ts`, estructuralmente similar pero no idéntico al `RedisOptions`
de `ioredis`, que además es más estricto). `opcionesConexionColas` devolvía inicialmente el
`RedisOptions` de `ioredis` y `tsc` lo rechazaba (`Type 'RedisOptions' is not assignable to type
'ConnectionOptions'`); corregido importando el `RedisOptions` de `bullmq` en vez de `ioredis`.

**Hallazgo real adicional**: `@nestjs/bullmq`'s `BullExplorer` (interno del paquete) ya cierra
**todos** los *workers* registrados en su propio `onApplicationShutdown` — una fase posterior a
`beforeApplicationShutdown` en el ciclo de Nest. Esto no contradice D6/PLT5: como
`ProcesadorInbox.beforeApplicationShutdown` cierra el *worker* primero (fase anterior), el cierre
del explorador llega después sobre un *worker* ya cerrado — `Worker.close()` de BullMQ es
idempotente (confirmado por el paso a verde de `beforeApplicationShutdown` en los tests), así que
el orden de PLT5 (ningún job en curso pierde Prisma/Redis a mitad de camino) queda garantizado por
nuestro propio hook, sin depender del cierre automático del paquete.

**Barrido del inbox (D7)**: implementado dentro de `procesador-inbox.ts` (sin archivo de
aplicación aparte, `design.md` no lo listaba como archivo propio de T4): un `JobScheduler` de
BullMQ (`upsertJobScheduler`, cada `INBOX_BARRIDO_MS`) dispara un job `barrido-inbox` que el mismo
`process()` distingue por `job.name` y reencola (vía el puerto `ColaEventosEntrantes`, mismo
`jobId`) las filas con `recibido_en` anterior a la ventana. No tiene un escenario propio en la
spec de esta tarea (el intervalo por defecto, 30 s, excede la duración de un test), así que su
cobertura queda para cuando la Fase 05/09 lo necesite medir bajo carga real; su lógica de
reclamo/reencolado reutiliza exactamente el mismo puerto que ya prueban CAN4/R4.

**`COLAS_TRABAJADORES` en archivos existentes**: se fijó explícitamente en `false` (con comentario)
en los tres contextos "de contrato" (`scripts/generar-contrato.ts`, `test/contrato/soporte.ts`,
`test/contrato/docs.spec.ts`, sin Redis real, D6) y también en `test/e2e/aplicacion.e2e-spec.ts`
(un escenario de ese archivo apunta a un `REDIS_URL` deliberadamente inalcanzable para probar el
health check degradado; un *worker* de BullMQ reintentando esa conexión indefinidamente no aporta
nada a ese escenario) y en `test/integracion/canales/webhook.spec.ts` (ese archivo prueba la capa
HTTP del webhook, no el procesamiento en segundo plano — D5 ya separa ambas responsabilidades).
Los demás 20 archivos que construyen un `Configuracion` literal (`geografia`, `horario`,
`catalogo`, `medios`, `persistencia`, `salud`, `infraestructura`) no registran `CanalesModule` ni
`ColasModule` en su árbol de módulos de prueba: los cuatro campos nuevos son datos inertes ahí,
fijados a los valores por defecto del esquema por consistencia con el resto del archivo.

---

## T5 — Puerto de salida + adaptador Chatwoot

**Objetivo**: construir el puerto de canal de salida `SALIDA_CANAL`/`ADAPTADOR_CANAL` (D9, CAN6) y el
adaptador Chatwoot con su cliente HTTP sin reintentos propios (D12), clasificación de fallos por
código HTTP, y unión de etiquetas en vez de reemplazo (D15).

**Dependencias**: T2 (`EstadoConversacionCanal` de `dominio/evento-canal.ts`).

**Archivos** (`design.md`, tabla "File Changes", slice (d)):
- `src/modulos/canales/puertos/{salida-canal,adaptador-canal}.ts` (Create) — D9, CAN6; `FalloCanal`
  (D12). `SALIDA_CANAL` se exporta desde el barril de `canales`; `ADAPTADOR_CANAL` no.
- `src/modulos/canales/infraestructura/chatwoot/{cliente-chatwoot,adaptador-canal-chatwoot}.ts` +
  specs (Create) — D12 (`ClienteChatwoot`, cero reintentos, clasificación 429/5xx/timeout/otro 4xx),
  D13 (marca `content_attributes.luxe_clave`, `existeMensajeConMarca`, solo si T1 confirmó que
  funciona; si no, se documenta aquí el riesgo residual aceptado), D15 (`agregarEtiquetas` con
  `GET`+unión+`POST`).
- `test/soporte/chatwoot-falso.ts` (Create) — servidor HTTP local que imita la API de Chatwoot
  (respuestas programables, registro de llamadas, `content_attributes`).
- `test/integracion/canales/adaptador-chatwoot.spec.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `CAN6 — Enviar un mensaje a través del puerto se traduce a la llamada de mensajes de Chatwoot`
- `CAN6 — Cambiar el estado de una conversación se traduce a la llamada de toggle_status`
- `CAN6 — Etiquetar una conversación se traduce a la llamada de labels`
- Soporte de `CAN7` (clasificación a nivel de cliente HTTP; el escenario completo con backoff del
  publicador lo cierra T7): `429/5xx → transitorio`, `4xx distinto de 429 → permanente`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `adaptador-chatwoot.spec.ts` con los 3 escenarios de CAN6 más la clasificación 429 (con
   `Retry-After`), 500, timeout y 404, contra el puerto/adaptador inexistentes. Correr
   `npm run test:integracion -- adaptador-chatwoot` y observar fallo.
2. GREEN: implementar `ClienteChatwoot` (`fetch` nativo, `AbortSignal.timeout(CHATWOOT_HTTP_TIMEOUT_MS)`,
   header `api_access_token`, cero reintentos, `FalloCanal` con `naturaleza`), `AdaptadorCanalChatwoot`
   (las tres operaciones + `existeMensajeConMarca` + unión de etiquetas) y `chatwoot-falso.ts` hasta
   que todos los casos pasen.
3. REFACTOR: confirmar que el mensaje de `FalloCanal` nunca lleva cuerpo ni token (matriz de amenazas);
   que `ADAPTADOR_CANAL` no se exporta del barril de `canales` (D9: solo lo invoca el manejador del
   outbox).

**Nota de tamaño**: dos puertos + cliente HTTP + adaptador + doble de Chatwoot — está **anticipada**
por la fila 4 de Risks de `proposal.md` (infraestructura/adaptador nuevo); `size:exception` automática
si el diff real la confirma.

**Hecho cuando**:
- Los tres escenarios de CAN6 pasan, con el título exacto del escenario como nombre del test.
- 429/5xx/timeout clasifican como `transitorio`; cualquier otro 4xx clasifica como `permanente`.
- Ningún mensaje de `FalloCanal` contiene el token `api_access_token` ni el cuerpo de la respuesta.
- `agregarEtiquetas` nunca reemplaza el conjunto existente (D15).

**Comando de test**: `npm run test:integracion -- adaptador-chatwoot`

**Slice de PR**: S(d)

**Review requerida**: RDD

### Resultado de la implementación (`sdd-apply`, 2026-09-27)

Los dos puertos (`salida-canal.ts`, `adaptador-canal.ts`) ya existían de un intento anterior
interrumpido por un límite de sesión de la API (sin commit); se verificaron línea por línea contra
`design.md` D9/D12/D13/D15 antes de continuar — coincidían exactamente, sin necesidad de corrección.
Se construyó sobre ellos `ClienteChatwoot` (fetch nativo, cero reintentos, clasificación 429/5xx/timeout
→ transitorio, otro 4xx → permanente, `Retry-After` traducido a `esperaSugeridaS` sin acotar — el
publicador del outbox de T6/T7 decide cómo acotarlo, tal como ya documentaba el TSDoc de `FalloCanal`)
y `AdaptadorCanalChatwoot` (las tres operaciones de CAN6, `existeMensajeConMarca` de D13 implementada
completa —**no** el riesgo residual: T1 confirmó que `content_attributes` se persiste y es consultable
por `GET`— y `agregarEtiquetas` con unión `GET`+`POST`, D15). `test/soporte/chatwoot-falso.ts` es un
servidor HTTP local real (`node:http`, sin librerías externas) que registra cada llamada y permite
programar respuestas (incluida una demora para simular el timeout del cliente); no es un doble en
memoria del puerto, sigue el mismo criterio que los demás tests de integración de la fase (Postgres/
Redis reales en vez de dobles).

**Cobertura de tests** (RED→GREEN observado en cada archivo, `npm test`/`npm run test:integracion`
reales antes de implementar): `cliente-chatwoot.spec.ts` (unitario, `fetch` global reemplazado con
`vi.stubGlobal`, 7 casos: URL/header, clasificación 429/500/404/red, matriz de amenazas, timeout);
`adaptador-canal-chatwoot.spec.ts` (unitario, doble de `ClienteChatwoot` con el mismo patrón que
`RepositorioEventoEntranteFalso` de T4 — sin `vi.fn()` para evitar `@typescript-eslint/unbound-method`
al leer `cliente.post`/`cliente.get` como referencia, 7 casos); `test/integracion/canales/
adaptador-chatwoot.spec.ts` (11 casos contra `ChatwootFalso` real: los 3 escenarios de CAN6, D15,
D13 (encuentra/no encuentra), CAN7 (429 con `Retry-After`, 500, timeout real medido con
`CHATWOOT_HTTP_TIMEOUT_MS=300`, 404), y la matriz de amenazas).

**Tamaño**: el diff real de esta tarea es de **847 líneas de autoría** (todas nuevas: dos puertos ya
existentes del intento anterior + `cliente-chatwoot.ts`/`.spec.ts` + `adaptador-canal-chatwoot.ts`/
`.spec.ts` + `chatwoot-falso.ts` + `adaptador-chatwoot.spec.ts` de integración), por encima del
estimado de ~480 y del presupuesto de 400. **`size:exception` se aplica automáticamente**, citando la
fila 4 de Risks de `proposal.md` ("presupuesto de ~400 líneas por slice con varios adaptadores e
infraestructura nueva") y la nota de tamaño de esta misma tarea ("dos puertos + cliente HTTP +
adaptador + doble de Chatwoot"), tal como anticipa la sección "Review Workload Forecast" de este
archivo — sin pedir confirmación adicional. No se recortó ningún test, comentario ni documentación
para acercarse al presupuesto.

**Hallazgo real, no silencioso**: mockear `cliente.post`/`cliente.get` con `vi.fn()` sobre un objeto
`as unknown as ClienteChatwoot` dispara `@typescript-eslint/unbound-method` al leer la referencia del
método en `expect(cliente.post).toHaveBeenCalledWith(...)`. Se resolvió con el mismo patrón ya
establecido en `procesar-evento-entrante.spec.ts` (T4): una clase doble que implementa la forma
pública del colaborador y registra cada llamada en un array propio, sin `vi.fn()`.

---

## T6 — `plataforma/outbox` genérico + migración `clave_idempotencia`

**Objetivo**: construir el outbox genérico de plataforma (D10): reclamo con *lease* y
`FOR UPDATE SKIP LOCKED`, orden estricto por grupo, backoff (Q1: `OUTBOX_MAX_INTENTOS = 5`,
`OUTBOX_BACKOFF_BASE_S = 15`, `OUTBOX_BACKOFF_MAX_S = 300`), registro de manejadores por `tipo`,
contenido efímero que se borra al cerrar la fila; y la migración aditiva `clave_idempotencia`
(D11, Q4 aprobada por el usuario). `plataforma/outbox` no importa ningún módulo de negocio (regla 7).

**Dependencias**: ninguna de `canales` (mecanismo genérico de plataforma); usa `plataforma/colas` (T4)
para su propia cola.

**Archivos** (`design.md`, tabla "File Changes", slice (e), parte genérica de plataforma):
- `prisma/schema.prisma` (Modify) — `claveIdempotencia String @unique @map("clave_idempotencia")`,
  `NOT NULL` (D11).
- `prisma/migrations/<ts>_outbox_clave_idempotencia/migration.sql` (Create) —
  `ALTER TABLE "outbox" ADD COLUMN "clave_idempotencia" TEXT NOT NULL;` +
  `CREATE UNIQUE INDEX "outbox_clave_idempotencia_key" ON "outbox"("clave_idempotencia");`.
- `MODELO_DATOS.md` §7 (Modify) — documenta la columna nueva y su único.
- `src/plataforma/outbox/{outbox.module.ts,registro-outbox-prisma.ts,registro-manejadores.ts,publicador-outbox.ts,procesador-outbox.ts,backoff.ts,tipos.ts,index.ts}`
  + specs (Create) — D10, D12; `retrasoSegundos(intentos, baseS, maxS)` con su spec propia.
- `test/integracion/outbox/publicador-outbox.spec.ts` (Create) — reclamo, orden por grupo, lease,
  invariante `error IS NOT NULL ⇔ fila muerta`, `efimero` eliminado al cerrar la fila, dos publicadores
  concurrentes no duplican (`SKIP LOCKED`).
- `docs/adr/0004-inbox-outbox.md` (Modify) — enmienda propuesta (estado `propuesta`): contenido
  saliente efímero, `clave_idempotencia NOT NULL UNIQUE`, un solo mecanismo de reintento.
- `src/plataforma/config/esquema.ts` + spec (Modify) — `OUTBOX_MAX_INTENTOS`,
  `OUTBOX_BACKOFF_BASE_S`, `OUTBOX_BACKOFF_MAX_S`, `OUTBOX_BARRIDO_MS`, `OUTBOX_LEASE_S`,
  `INBOX_MAX_INTENTOS`, `INBOX_BARRIDO_MS`, `COLAS_PREFIJO`, `COLAS_TRABAJADORES` (si no quedaron ya en
  T3/T4).
- `.env.example` (Modify) — variables nuevas de outbox.

**Escenarios cubiertos**: ninguno con id propio de `canales` en esta tarea — el manejador de prueba que
ejercita el mecanismo genérico no corresponde a ningún escenario de la spec de `canales` (esos llegan
en T7, que conecta el outbox genérico con `canal.mensaje`/`canal.estado`/`canal.etiquetas`).

**RED → GREEN → REFACTOR** (planificado):
1. RED: `publicador-outbox.spec.ts` con un manejador de prueba registrado en
   `RegistroManejadoresOutbox` (sin ningún tipo de `canales`), contra Postgres real, probando reclamo,
   orden por grupo, lease vencido, invariante de `error`, eliminación de `efimero`. Correr
   `npm run test:integracion -- publicador-outbox` y observar fallo.
2. GREEN: aplicar la migración, implementar `RegistroOutboxPrisma.agregar` (`createMany({
   skipDuplicates: true })`), la consulta de reclamo con `$queryRaw` (D10), `PublicadorOutbox`
   (bucle ≤ 50 vueltas), `backoff.ts`, el procesador de la cola `outbox` y el barrido cada
   `OUTBOX_BARRIDO_MS = 5 s`, hasta que el spec pase.
3. REFACTOR: confirmar que `plataforma/outbox` no importa nada de `modulos/` (regla 7); que
   `RegistroOutboxPrisma` usa `$queryRaw` solo para el reclamo (regla 4, sin importar el cliente
   generado más allá de eso); que ninguna fila pendiente tiene `error` (invariante).

**Nota de tamaño**: migración + outbox genérico completo (8 archivos + specs) — `design.md` la marca
como "la slice con más riesgo de superar ~400 líneas" y por eso la abre en `(e1)`/`(e2)` por
adelantado. **Anticipada** por la fila 4 de Risks de `proposal.md`; `size:exception` automática si el
diff real la confirma.

**Hecho cuando**:
- El test de integración pasa contra Postgres real: orden estricto por grupo, un predecesor pendiente
  bloquea a su sucesor, dos publicadores concurrentes no duplican, un lease vencido vuelve a estar
  disponible, `efimero` desaparece al cerrar la fila (enviada o muerta).
- La migración es aditiva y reversible con una migración inversa nueva (nunca editando la aplicada).
- `MODELO_DATOS.md` §7 documenta la columna y el único antes de aplicar la migración a Prisma.
- `docs/adr/0004-inbox-outbox.md` queda con la enmienda en estado `propuesta`.

**Comando de test**: `npm run test:integracion -- publicador-outbox`

**Slice de PR**: S(e1)

**Review requerida**: RDD

### Resultado de la implementación (`sdd-apply`, 2026-09-27)

Construido en `src/plataforma/outbox/` (D10): `tipos.ts` (`REGISTRO_OUTBOX`, `NuevaEntradaOutbox`,
`EntradaOutbox`, `FalloPublicacion`, `ManejadorOutbox`, `PayloadOutbox`, constantes de cola/job),
`backoff.ts` (`retrasoSegundos`, D12), `registro-manejadores.ts` (mismo patrón de inversión de
dependencia que `RegistroConsumidorEventosCanal` de `canales`, D8, aplicado por `tipo`),
`registro-outbox-prisma.ts` (`createMany({ skipDuplicates: true })` + disparo con el mismo "tope de
200 ms" de `RegistrarEventoEntrante`, D5), `publicador-outbox.ts` (reclamo `$queryRaw` con
`FOR UPDATE SKIP LOCKED` exactamente como D10, bucle ≤ 50 vueltas, clasificación
transitorio/permanente/agotado/sin-manejador, cascada `'secuencia abortada'` sobre `datos.secuencia`)
y `procesador-outbox.ts` (`WorkerHost` de BullMQ, mismo patrón de `ProcesadorInbox` de T4: job
normal `'publicar'` + barrido repetible `'barrido-outbox'`, ambos llaman a
`publicarPendientes()` — a diferencia del inbox, el barrido del outbox no necesita listar filas
primero). Migración aditiva `prisma/migrations/20260927120000_outbox_clave_idempotencia/` (`ALTER
TABLE ... ADD COLUMN clave_idempotencia TEXT NOT NULL` + `CREATE UNIQUE INDEX`, sin `[manual]`: sin
escritor todavía, P7) y `prisma/schema.prisma`/`MODELO_DATOS.md` §7 actualizados en el mismo commit.
`plataforma/outbox` no importa `canales` ni ningún otro módulo de negocio (regla de fronteras 7,
confirmado por `npm run fronteras`); no se tocó `AppModule` ni `CanalesModule` (el `OutboxModule`
queda sin registrar hasta que T7 lo importe desde `canales.module.ts`, tal como anticipa D16).

**Cobertura de tests** (RED→GREEN observado en cada archivo antes de implementar): unitarios
`backoff.spec.ts` (3 casos) y `registro-manejadores.spec.ts` (4 casos, sin infraestructura, mismo
criterio que `registro-consumidor-eventos-canal.spec.ts` de T4); `cargar-configuracion.spec.ts`
ganó una sección `OUTBOX_*` (4 casos: defaults, coerción, rechazo por debajo del mínimo);
`test/integracion/outbox/publicador-outbox.spec.ts` (8 casos contra Postgres + Redis reales de
Testcontainers, con un `ClockFalso` inyectado para controlar *lease* y backoff sin depender del
reloj de pared): predecesor pendiente bloquea a su sucesor del mismo grupo (con backoff real de
15 s), dos publicadores concurrentes no duplican una fila (`FOR UPDATE SKIP LOCKED`, ventana de
carrera real de 100 ms), lease vencido vuelve a estar disponible, `efimero` desaparece al cerrar la
fila (enviada y muerta), agota `OUTBOX_MAX_INTENTOS` y marca `'agotado: <causa>'`, un fallo
permanente aborta el resto de la secuencia (`'secuencia abortada'`, D10 — sin escenario propio de
`canales`, probado con un manejador y un `tipo` genéricos de prueba), sin manejador registrado
muere con `'sin-manejador'`, `agregar` con la misma `clave_idempotencia` dos veces no duplica la
fila (D11, `ON CONFLICT DO NOTHING`). Ninguno de estos títulos usa `R#`/`CAN#`: T6 no tiene
escenario propio de `canales` (ver "Mapeo de escenarios por tarea" al inicio de este archivo), igual
que `opciones-conexion.spec.ts` de `plataforma/colas` (T4).

**Hallazgo real, no anticipado por `design.md` (documentado, no silencioso)**: el reclamo (`WITH
candidatos AS (...) UPDATE ... FROM candidatos RETURNING ...`) no garantiza que Postgres devuelva
las filas en el mismo orden en que la CTE las seleccionó (`ORDER BY o.creado, ...`) — el estándar
SQL no ata el orden de un `UPDATE ... RETURNING` al de su CTE de origen. `PublicadorOutbox` reordena
las filas reclamadas en la aplicación (`creado`, `orden`, `id`) antes de publicarlas, en vez de
confiar en el orden físico de retorno de Postgres.

**Hallazgo real adicional (de la propia suite de integración, no de `design.md`)**: el `ClockFalso`
inyectado en la app de prueba MUST fijarse por delante del reloj de pared real (`new
Date('2030-01-01T00:00:00.000Z')`, no una fecha de "hoy"): el default `proximo_intento =
now()` de la columna lo pone Postgres con su propio reloj real al insertar la fila, y la condición
de reclamo (`proximo_intento <= $ahora`) compara ese valor contra el `ClockFalso` inyectado — si el
`ClockFalso` arranca en una fecha anterior o igual a la hora real de inserción, el primer reclamo
nunca ve la fila como lista.

**Tamaño**: el diff real de esta tarea es de **~1.198 líneas de autoría** (1.188 adiciones, 10
eliminaciones — `git diff --cached --stat`), sobre el estimado de ~560 y muy por encima del
presupuesto de 400. La mayor parte no es el mecanismo del outbox en sí (~596 líneas en
`src/plataforma/outbox/` incluidos specs) sino la propagación mecánica de los cinco campos
`OUTBOX_*` nuevos del esquema de configuración a los ~28 archivos que construyen un `Configuracion`
literal para pruebas (mismo patrón ya visto en T3/T4 con `CHATWOOT_*`/`INBOX_*`), más el test de
integración nuevo (342 líneas, 8 escenarios reales). **`size:exception` se aplica automáticamente**,
citando la fila 4 de Risks de `proposal.md` ("presupuesto de ~400 líneas por slice con varios
adaptadores e infraestructura nueva") y la "Nota de tamaño" de esta misma tarea ("migración + outbox
genérico completo"), tal como anticipa la sección "Review Workload Forecast" de este archivo — sin
pedir confirmación adicional. No se recortó ningún test, comentario ni documentación para acercarse
al presupuesto.

**Verificación completa** (`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integracion`,
`npm run fronteras`, `npm run contrato:deriva`): todas en verde — ver el commit de esta tarea para la
salida real.

---

## T7 — `SalidaCanalOutbox` + reconciliación + e2e de cero duplicados

**Objetivo**: conectar `canales` con el outbox genérico (D9, D10): `SalidaCanalOutbox` construye las
claves de idempotencia y encola las secuencias; `PublicarEfectoCanal` es el manejador que traduce cada
fila a una llamada del adaptador Chatwoot, con la reconciliación de D13 para mensajes reintentados; el
e2e prueba el criterio de salida completo de la fase.

**Dependencias**: T5 (`ADAPTADOR_CANAL`, `ClienteChatwoot`), T6 (`plataforma/outbox` completo,
`REGISTRO_OUTBOX`, `RegistroManejadoresOutbox`, `PublicadorOutbox`).

**Archivos** (`design.md`, tabla "File Changes", slice (e), parte de `canales`):
- `src/modulos/canales/aplicacion/{salida-canal-outbox,publicar-efecto-canal}.ts` + specs (Create) —
  D9 (`SalidaCanalOutbox` implementa `SalidaCanal`, construye claves con `claves-idempotencia.ts` de
  T2), D10 (mapea `canal.mensaje`/`canal.estado`/`canal.etiquetas` a `datos`/`efimero`), D13
  (reconciliación condicionada al resultado de T1: si `intento > 1`, llama
  `existeMensajeConMarca` antes de reenviar; si T1 no pudo confirmarlo, implementa en su lugar el
  escenario alternativo "fallo con respuesta recibida" documentado en `design.md` D13).
- `test/integracion/canales/salida-outbox.spec.ts` (Create) — R4 esc. 2, CAN7, cero duplicados
  (incluida la respuesta perdida, D13).
- `test/e2e/canal-chatwoot.e2e-spec.ts` (Create) — evento firmado → inbox → consumidor una vez;
  `SALIDA_CANAL` con reintento → cero duplicados en Chatwoot falso (criterio de salida de la fila 04).

**Escenarios cubiertos** (título exacto):
- `CAN7 — Un 429 o 5xx de Chatwoot se reintenta con backoff`
- `CAN7 — Un 4xx de Chatwoot falla de inmediato sin reintentar`
- `R4 — Reintento de un job de envío tras un fallo` (`openspec/specs/canales/spec.md`)

**RED → GREEN → REFACTOR** (planificado):
1. RED: `salida-outbox.spec.ts` con los 3 escenarios (secuencia de 3 mensajes, el 2.º responde 500 una
   vez → cada mensaje llega exactamente una vez y en orden; el 2.º responde tras el timeout → sin
   segundo `POST` si T1 confirmó D13, o el escenario alternativo si no) contra `SalidaCanalOutbox`/
   `PublicarEfectoCanal` inexistentes. Correr `npm run test:integracion -- salida-outbox` y observar
   fallo.
2. GREEN: implementar `SalidaCanalOutbox.{enviarMensajes,cambiarEstado,agregarEtiquetas}` (una
   transacción por llamada, `REGISTRO_OUTBOX.agregar`) y `PublicarEfectoCanal.publicar` (por `tipo`,
   clasifica el resultado del adaptador en éxito/`FalloPublicacion('transitorio'|'permanente')`) hasta
   que el spec pase.
3. RED→GREEN del e2e: `canal-chatwoot.e2e-spec.ts` de punta a punta contra Chatwoot falso, cubriendo el
   criterio de salida completo de la fase.
4. REFACTOR: confirmar que una fila muerta por fallo permanente marca `error = 'secuencia abortada'`
   en las filas pendientes de la misma secuencia (D10); que el texto del mensaje nunca queda en
   `datos`, solo en `efimero`.

**Nota de tamaño**: aplicación (no "infraestructura" por nombre) — **no** anticipada por la fila 4 de
Risks; si el diff real supera significativamente el presupuesto, `sdd-apply` **MUST pedir
`size:exception` al usuario** antes de continuar con T8.

**Hecho cuando**:
- Los tres escenarios listados pasan, con el título exacto del escenario como nombre del test.
- Una secuencia de varios mensajes que falla a mitad y se reintenta no duplica ningún mensaje ya
  enviado (cero duplicados, contra Chatwoot falso).
- Un 4xx distinto de 429 no se reintenta; un 429/5xx sí, con el backoff de Q1.
- El e2e `canal-chatwoot.e2e-spec.ts` pasa de punta a punta.

**Comando de test**: `npm run test:integracion -- salida-outbox` + `npm run test:e2e -- canal-chatwoot`

**Slice de PR**: S(e2)

**Review requerida**: RDD

### Resultado de la implementación (`sdd-apply`, 2026-09-27)

Construido `SalidaCanalOutbox` (`aplicacion/salida-canal-outbox.ts`, D9): traduce cada método del
puerto a una o más `NuevaEntradaOutbox` con `grupoConversacion`/`claveMensaje`/`claveEstado`/
`claveEtiquetas` de `dominio/claves-idempotencia.ts` (T2) y llama `REGISTRO_OUTBOX.agregar` (T6). El
texto de cada mensaje va solo en `efimero.texto` (D10); `datos` de `canal.mensaje` lleva
`idConversacion`, `secuencia` (= `idRespuesta`, para la cascada de "secuencia abortada" de
`PublicadorOutbox`), `paso` y `total`. Valida `1..MAX_PASOS_SECUENCIA` mensajes por secuencia antes
de encolar. `PublicarEfectoCanal` (`aplicacion/publicar-efecto-canal.ts`, D10, D13) es el
`ManejadorOutbox` que traduce cada fila a la llamada correspondiente de `ADAPTADOR_CANAL` (T5),
traduciendo `FalloCanal` a `FalloPublicacion` (misma `naturaleza`/`causa`/`esperaSugeridaS`) para que
`PublicadorOutbox` clasifique el reintento. **D13 (bifurcación de T1 confirmada)**: como T1 confirmó
que `content_attributes` se persiste y es consultable por `GET`, se construyó la reconciliación
completa — si `entrada.intento > 1`, primero `existeMensajeConMarca` y, si ya existe, la fila se
marca entregada sin un segundo `POST`; si no, se reenvía. `canales.module.ts` importa `OutboxModule`
y en `onModuleInit` registra la única instancia de `PublicarEfectoCanal` para los tres `tipo`
(`canal.mensaje`, `canal.estado`, `canal.etiquetas`) en `RegistroManejadoresOutbox`; provee
`SALIDA_CANAL` (`SalidaCanalOutbox`, exportado del barril, D9) y `ADAPTADOR_CANAL`
(`AdaptadorCanalChatwoot`/`ClienteChatwoot` de T5, interno, no exportado).

**Cobertura de tests** (RED→GREEN observado antes de implementar cada capa):
- Unitarios (`salida-canal-outbox.spec.ts`, 5 casos; `publicar-efecto-canal.spec.ts`, 9 casos): sin
  infraestructura, con dobles de `RegistroOutbox`/`AdaptadorCanal` (mismo patrón de clase doble sin
  `vi.fn()` que `RepositorioEventoEntranteFalso`/`ClienteChatwootFalso`, evita
  `@typescript-eslint/unbound-method`). RED confirmado de verdad: se deshabilitó momentáneamente la
  rama `entrada.intento > 1` de `publicarMensaje` (D13) y los dos tests de reconciliación fallaron
  exactamente como se esperaba (`existeMensajeConMarca` nunca se llamó, el mensaje se reenvió sin
  consultar), antes de restaurar la implementación real y confirmar GREEN.
- Integración (`test/integracion/canales/salida-outbox.spec.ts`, 3 casos: CAN7(2), R4 esc. 2) contra
  `ChatwootFalso` real (T5) y Postgres real, con `ClockFalso` para el backoff (mismo patrón que
  `publicador-outbox.spec.ts` de T6). **RED real encontrado y corregido**: la primera versión del
  test asumía que una sola llamada a `publicarPendientes()` solo procesaba el primer mensaje de la
  secuencia; en realidad el bucle de "vueltas" de `PublicadorOutbox` (D10) ya avanza al segundo
  mensaje en la misma llamada (tras el éxito del primero) y lo intenta de inmediato — el test fallaba
  porque esperaba una sola llamada HTTP cuando ya había dos. Corregido ajustando las aserciones a la
  secuencia real de llamadas (uno → dos (falla) → [avanzar reloj] → dos (reintento, éxito) → tres),
  con la aserción central de "cero duplicados": `mensaje uno` aparece exactamente una vez en todas
  las llamadas HTTP registradas, sin importar cuántas veces se reintente `mensaje dos`.
- E2E (`test/e2e/canal-chatwoot.e2e-spec.ts`, 1 caso, `COLAS_TRABAJADORES: true`, BullMQ real):
  evento firmado real → webhook → inbox → un consumidor de prueba registrado vía
  `RegistroConsumidorEventosCanal` dispara `SALIDA_CANAL.enviarMensajes` con una secuencia de dos
  mensajes; el segundo falla una vez (500) y se reintenta solo, vía el barrido del outbox
  (`OUTBOX_BARRIDO_MS` reducido a 500 ms y `OUTBOX_BACKOFF_BASE_S` a 1 s para no alargar el test con
  el reloj de pared real, sin `ClockFalso` en un e2e con *workers* de verdad). Confirma de punta a
  punta: el consumidor se llama exactamente una vez (R4/CAN4), las dos filas del outbox terminan
  `enviado_en` sin `error`, y `mensaje uno` nunca se duplica pese al reintento de `mensaje dos` —
  criterio de salida de la fila 04 de `docs/fases/README.md` ("envío con reintento → cero
  duplicados").

**Tamaño**: el diff real de esta tarea es de **932 líneas de autoría** (925 adiciones, 7
eliminaciones — `git diff --cached --stat`), muy por encima del estimado de ~430 y del presupuesto
de 400. Esta tarea es aplicación (`SalidaCanalOutbox`/`PublicarEfectoCanal`), no "infraestructura
nueva" por nombre, así que la fila 4 de Risks de `proposal.md` no la anticipa automáticamente (ver
"Nota de tamaño" de esta misma tarea, arriba). El usuario autorizó explícitamente, para toda la fase
y por adelantado, aplicar cualquier exceso de las tareas T2/T7 sin detenerse a preguntar,
documentándolo en el commit — instrucción recibida junto con el encargo de esta tarea. La mayor parte
del exceso son los tres archivos de test nuevos (integración + e2e + specs unitarios: ~680 de las 932
líneas) que cubren los tres niveles exigidos por `design.md` §"Testing Strategy" para esta tarea, no
el mecanismo de aplicación en sí (~200 líneas en `salida-canal-outbox.ts`/`publicar-efecto-canal.ts`
combinados). No se recortó ningún test, comentario ni documentación para acercarse al presupuesto.

**Verificación completa** (`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integracion`,
`npm run test:e2e -- canal-chatwoot`, `npm run fronteras`): todas en verde — ver el commit de esta
tarea para la salida real.

---

## T8 — Entorno local de Chatwoot portado

**Objetivo**: mover `scripts/chatwoot-*.sh` e `infra/chatwoot/` del prototipo a este repo (inventario
línea 56), apuntando el webhook del Agent Bot a `/api/v1/webhooks/chatwoot`.

**Dependencias**: ninguna de código (independiente); se ubica al final del Approach porque solo tiene
sentido probarla con el webhook ya construido (T3-T7).

**Archivos** (`design.md`, tabla "File Changes", slice (f), parte de infraestructura):
- `infra/chatwoot/{docker-compose.yml,.env.example,init/*}` (Create) — portados del prototipo.
- `scripts/chatwoot-*.sh` (Create) — portados del prototipo; apuntan el webhook a
  `/api/v1/webhooks/chatwoot`.
- `.env.example` (Modify) — variables restantes que dependa el entorno local, si alguna no quedó en
  T3/T6.

**Escenarios cubiertos**: ninguno con id propio (infraestructura de desarrollo, no comportamiento del
sistema).

**RED → GREEN → REFACTOR**: no aplica ciclo TDD (sin lógica de producción); verificación manual en su
lugar.

**Hecho cuando**:
- `scripts/chatwoot-up.sh` (o el nombre que traiga el prototipo) levanta una instancia local de
  Chatwoot v4.17.1 con Docker Compose.
- El Agent Bot de esa instancia tiene su webhook configurado hacia
  `http://<host>/api/v1/webhooks/chatwoot`.
- Un evento real disparado desde esa instancia local llega al inbox (`evento_entrante`) — prueba
  manual, registrada en la propia tarea al cerrarla.

**Comando de verificación**: `scripts/chatwoot-up.sh` (manual; sin test automatizado — infraestructura
de desarrollo, no comportamiento de producción).

**Slice de PR**: S(f)

**Review requerida**: RDD

### Resultado de la implementación (`sdd-apply`, 2026-09-27)

Portados de `../ChatLuxeCRM` (`docs/migracion/inventario.md` línea 56), sin modificar el prototipo
(solo lectura):
- `infra/chatwoot/docker-compose.yml`, `infra/chatwoot/.env.example`,
  `infra/chatwoot/init/01-luxeboreal.sh` (renombrado de `01-chatluxecrm.sh`).
- `scripts/chatwoot-up.sh`, `scripts/chatwoot-bootstrap.sh`, `scripts/chatwoot-crear-admin.sh`.
- `scripts/postgres-crear-bases.sh` — no está en el glob `scripts/chatwoot-*.sh` de la lista de
  archivos de esta tarea, pero es una dependencia directa de `chatwoot-up.sh` (lo invoca) en el
  prototipo; se portó igual porque sin él `chatwoot-up.sh` fallaría.
- `.env.example` (raíz) — solo se ajustó el comentario de las variables `CHATWOOT_BOT_TOKEN`/
  `CHATWOOT_WEBHOOK_SECRETO` para referenciar los scripts ya portados en vez de "del prototipo (o
  su equivalente)"; las variables `CHATWOOT_*` en sí ya existían desde T3/T6, sin cambios.

**Renombrado `chatluxecrm` → `luxeboreal`**: rol/bases (`chatluxecrm`/`chatluxecrm_test` →
`luxeboreal`/`luxeboreal_test`), variable `CHATLUXECRM_DB_PASSWORD` → `LUXEBOREAL_DB_PASSWORD`,
cuenta de Chatwoot (`ChatLuxeCRM` → `LuxeBorealCRM`) y nombre del Agent Bot (`ChatLuxeCRM bot` →
`LuxeBorealCRM bot`). Webhook del Agent Bot apuntando a `/api/v1/webhooks/chatwoot` (ruta real del
controlador de T3, `webhook-chatwoot.controller.ts`), no a `/webhook/chatwoot` como en el prototipo.

**Decisión documentada, no silenciosa — `scripts/chatwoot-devolver-bot.sh` NO se portó**: ese script
del prototipo depende de infraestructura que esta fase no construye — una clave Redis
`conv:<numero>:chatwoot` que mapea número de teléfono a conversación de Chatwoot, la variable
`CHATWOOT_ADMIN_TOKEN` y un contenedor llamado `redis-dev` — todo eso pertenece a la máquina de
estados bot/humano (R6) que construye una fase posterior (`docs/fases/README.md`), no la Fase 04
(solo webhook, inbox, puerto de salida y outbox de `canales`). Portarlo ahora habría significado
inventar convenciones de Redis/env que la fase de la máquina de estados todavía no decide — viola la
regla de CLAUDE.md "no se adelanta trabajo de fases futuras". Queda pendiente para la fase que
implemente R6.

**Nombre del proyecto Docker**: `luxeborealcrm-chatwoot` (distinto del ya corriendo `chatwoot-local`,
que se levantó esta sesión directo desde el compose del prototipo como solución temporal para T1).
Migración de `chatwoot-local` a `luxeborealcrm-chatwoot` sin perder la cuenta/inbox/bot ya
configurados: documentada en el reporte de `sdd-apply` a la orquestación, no ejecutada aquí (decisión
operativa del usuario). Resumen: como los volúmenes de Compose se nombran
`<proyecto>_<volumen>`, cambiar de proyecto crea volúmenes nuevos vacíos; para conservar los datos
hay que copiarlos a los volúmenes con el nuevo prefijo (`docker volume create` + un contenedor
`alpine` que copie `chatwoot-local_chatwoot_pg` → `luxeborealcrm-chatwoot_chatwoot_pg`, y lo mismo
para `chatwoot_storage`/`chatwoot_redis`) y copiar el `.env` real ya generado
(`../ChatLuxeCRM/infra/chatwoot/.env`) a `infra/chatwoot/.env` de este repo antes de correr
`scripts/chatwoot-up.sh`, para que las contraseñas coincidan con los datos ya cifrados en esos
volúmenes.

**Verificación real ejecutada** (sin tocar la instancia `chatwoot-local` en marcha):
- `docker compose -f infra/chatwoot/docker-compose.yml --project-name luxeborealcrm-chatwoot config`:
  YAML válido, anclas `x-base` resueltas, los cuatro servicios y los tres volúmenes se parsean
  correctamente; solo falla (como se espera, mismo comportamiento que el compose del prototipo) en
  la línea `env_file: .env` porque `infra/chatwoot/.env` no existe todavía — se genera la primera vez
  que corre `scripts/chatwoot-up.sh`, nunca se commitea.
- `bash -n` sobre los cinco scripts portados (`chatwoot-up.sh`, `chatwoot-bootstrap.sh`,
  `chatwoot-crear-admin.sh`, `postgres-crear-bases.sh`, `init/01-luxeboreal.sh`): sin errores de
  sintaxis.
- No se ejecutó `scripts/chatwoot-up.sh` de verdad (levantaría un segundo Chatwoot en los mismos
  puertos 3001/5433 que ya usa `chatwoot-local`, chocando con la instancia real en marcha) — queda
  para cuando el usuario decida la migración de arriba.

---

## T9 — Cierre documental: doc 04 §3, skill de Meta, skill de arquitectura

**Objetivo**: cerrar los pendientes documentales de la fase (Scope 11-12 de la proposal) y el
checklist de cierre de la skill `luxeboreal-arquitectura` §1.

Esta tarea no toca `src/`, `prisma/` ni `test/` (solo documentación): por `openspec/config.yaml`
§rules.tasks se omite la tabla completa de "Review Workload Forecast" para su propia sección — **sin
cambios de producción, sin riesgo de presupuesto**.

**Dependencias**: T8 (documenta el entorno local ya portado); conceptualmente cierra sobre todas las
anteriores (documenta el módulo `canales` completo).

**Archivos** (`design.md`, tabla "File Changes", slice (f), parte documental):
- `docs/analisis/04-chatwoot-delegar-vs-construir.md` §3 (Modify) — cierre de los "?": P13 (tabla
  propia de horario, no se delega) y el auto-resolver de Chatwoot (apagado, sin política en esta
  fase).
- `.claude/skills/whatsapp-meta-conventions/` (Create) — copiada del prototipo (inventario línea 85).
- `.atl/skill-registry.md` (Modify) — regenerado tras la copia.
- `.claude/skills/luxeboreal-arquitectura/SKILL.md` (Modify) — §1: agrega `canales`,
  `plataforma/colas`, `plataforma/outbox`; documenta la convención de body crudo (D2), el patrón de
  registro de consumidor/manejador (D8/D10) y el flag `COLAS_TRABAJADORES` (D6).

**Escenarios cubiertos**: ninguno con id propio (documentación de cierre).

**RED → GREEN → REFACTOR**: no aplica (documentación, sin lógica).

**Checklist de cierre de la skill `luxeboreal-arquitectura` §1** (a confirmar aquí, no solo en el
chat):
- [ ] Módulo `canales` registrado en la lista de módulos de la skill.
- [ ] `plataforma/colas` y `plataforma/outbox` registrados como paquetes nuevos de plataforma.
- [ ] Convención de body crudo (D2) documentada.
- [ ] Patrón de registro de consumidor/manejador (D8/D10) documentado.
- [ ] Flag `COLAS_TRABAJADORES` documentado.

**Hecho cuando**:
- `docs/analisis/04-chatwoot-delegar-vs-construir.md` §3 no tiene ningún "?" pendiente de esta fase.
- La skill `whatsapp-meta-conventions` existe en `.claude/skills/` y `.atl/skill-registry.md` la lista.
- El checklist de cierre de arriba está completo.

**Comando de verificación**: revisión de contenido (doc-only; sin comando de test).

**Slice de PR**: S(f)

**Review requerida**: RDD

---

## Review de la fase

Esta fase está en la lista 04/05/06/10 de `docs/fases/README.md` regla 6: **`judgment-day`
(revisión ciega doble) es obligatorio antes de `sdd-verify`**, además de RDD por cada commit de
unidad de trabajo (T1-T9). No se corre por tarea individual — se corre **una vez**, sobre el rango de
commits completo de la rama `fase-04-canal-chatwoot`, después de T9 y antes de `sdd-verify`.

Focos sugeridos para los jueces (`design.md` §"Migration / Rollout"):
- **D10** (reclamo y orden del outbox genérico, T6).
- **D11/D13** (cero duplicados: clave de idempotencia + reconciliación, T6/T7).
- **D4** (lista blanca de la traducción y exclusión del `wamid`, T2).
- **D2** (body crudo, T3).

El resultado (veredicto, hallazgos, correcciones aplicadas) va en `verify-report.md` (skill
`luxeboreal-fases` §6, `openspec/config.yaml` §rules.verify).

## Preguntas para el usuario

Ninguna pregunta bloquea `sdd-apply`. Las siguientes son ambigüedades reales encontradas al desglosar
esta fase, ya resueltas dentro de este documento sin reabrir ninguna decisión de Q1-Q4 ni de D1-D16:

1. **Reconciliación de D13 condicionada a un resultado que T1 todavía no tiene** (`design.md`: "hay
   que confirmar contra Chatwoot v4.17.1 local"). Se resolvió asignando la verificación real a T1
   (antes de que exista ningún código de producción que dependa de ella) y dejando T7 con una
   bifurcación explícita: si T1 confirma que `content_attributes` se persiste y no reenvía a WhatsApp,
   T7 construye la reconciliación completa; si no, construye el escenario alternativo "fallo con
   respuesta recibida" que el propio `design.md` ya anticipa como plan de respaldo. No bloquea
   `sdd-apply`: la decisión la toma el resultado real de T1, no el usuario.
2. **Ubicación de la migración `clave_idempotencia`** (Q4 ya aprobada, pero `design.md` no fija en
   qué tarea de `sdd-tasks` va): se asignó a T6 (inicio de la slice `(e1)`, junto con el resto del
   outbox genérico) en vez de a una tarea aparte, porque `MODELO_DATOS.md` §7 y el esquema Prisma
   deben quedar coherentes con el resto de `plataforma/outbox` en el mismo commit.
3. Las siete preguntas ya listadas en `design.md` §"Open Questions" (Q1-Q3 de la proposal, y D6, D9,
   D10, D11, D13, D15 de `design.md`) siguen pendientes de que el usuario las vete o las acepte al
   aprobar — no se repiten aquí porque ya están completas en ese documento; este `tasks.md` las da por
   vigentes tal como quedaron fijadas (valores de backoff, límite de 1 MB global, `NOT NULL` en
   `clave_idempotencia`, contenido efímero en el outbox, unión de etiquetas, flag
   `COLAS_TRABAJADORES`, ubicación del puerto de salida en `canales`).
