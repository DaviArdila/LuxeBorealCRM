# Design: Fase 08 — Leads y handoff

- Change: `fase-08-leads-handoff` · Fecha: 2026-09-30 · Estado: diseño propuesto
- Proposal: `proposal.md` · Specs: `leads` (LDS1-LDS5), `notificaciones` (NTF1-NTF4), `agente`
  (AGT11 modificado, AGT14), `conversaciones` (CNV11)
- ADRs: [0004](../../../docs/adr/0004-inbox-outbox.md), [0016](../../../docs/adr/0016-composicion-agente-conversaciones.md)

## Technical Approach

Dos módulos nuevos, `leads` (dueño de la tabla `lead`, la escala y el ciclo del aviso) y
`notificaciones` (entrega por Telegram con el outbox), y tres cambios chicos en `agente` y
`conversaciones`. El agente sigue siendo quien habla con el LLM; `leads` decide; `conversaciones`
transiciona; `notificaciones` avisa. Ninguno importa a otro salvo por barril, y ninguna dependencia
apunta hacia arriba.

```
agente ──▶ leads ──▶ notificaciones ──▶ plataforma/outbox
  │          ▲              ▲
  └▶ conversaciones ────────┘  (observador de handoff confirmado, registrado por leads)
```

## Architecture Decisions

### D1: la escala es una función pura con vocabulario cerrado

**Choice**: `leads/dominio/escala-lead.ts` exporta `SENALES` (mapa señal → `fuerte`/`debil`) y
`confirmaLead(senales)`; señales fuera del vocabulario se descartan; las débiles cuentan una vez cada
una; el umbral es ≥1 fuerte o ≥2 débiles. La herramienta `marcar_lead_caliente` cambia `senales` de
`string[]` a `enum[]` del mismo vocabulario, para que el modelo solo pueda proponer señales conocidas.
**Alternatives**: texto libre + coincidencia por palabras (frágil, no determinista). **Rationale**: R9
pide una escala *determinista*; los nombres los aprueba el usuario (Q1).

### D2: `leads` implementa la decisión; el agente solo adapta

**Choice**: `leads` exporta `EvaluarPropuestaLead` (recibe conversación, contacto, propuesta, ¿sin
cobertura?; devuelve `{ derivado, accion: 'derivar'|'capturar'|'ninguna', motivo? }`). `AgenteModule`
enchufa un adaptador `EvaluadorLeadDeLeads implements EvaluadorLead` que reemplaza a
`EvaluadorLeadSinEscala`. **Rationale**: el puerto `EVALUADOR_LEAD` es del agente (ADR-0016); la regla
de negocio vive en `leads`.

### D3: un lead abierto por conversación, con `UPSERT` por `conversacion_id`

**Choice**: la búsqueda del lead abierto (`estado = nuevo`) y su actualización son una operación en
Postgres; las señales se unen sin repetir; `derivado` nunca pasa de `true` a `false`. El resumen se pasa
por un redactor que reemplaza teléfonos, correos y cédulas (R14, P15).

### D4: dentro de horario, `ContenidoLlm` traduce `accion: 'derivar'` a handoff

**Choice**: la herramienta deja el efecto `lead-derivado { leadId }`; `ContenidoLlm` lo ve y responde
con el texto de `TextoHandoff` y `handoff: { motivo: 'lead-caliente' }` (no con lo que escribió el
modelo, que no sabe el estado). `conversaciones` ejecuta la transición como cualquier handoff (CNV8) y
agrega la etiqueta `lead-caliente` por `SALIDA_CANAL.agregarEtiquetas`.

### D5: fuera de horario, la captura es un estado del lead, no de la conversación

**Choice**: `accion: 'capturar'` deja el lead con `derivado = false` y `capturado_fuera_horario = false`
(pendiente). `ArmarContextoInicial` consulta `leads.ObtenerCapturaPendiente(conversacionId)` y agrega las
instrucciones de captura (pedir nombre, teléfono, dirección, localidad y decir el texto de cierre
`mensaje_captura_completa`). Cuando `guardar_datos_contacto` guarda, llama a un puerto
`CAPTURA_LEAD.completar(conversacionId)` (adaptador sobre `leads`): marca el lead como capturado y
derivado y dispara el aviso. La conversación nunca sale de `bot`. **Alternativa descartada**: un estado
nuevo de la FSM (cambia la máquina de estados de la Fase 05 para algo que es un dato del lead).

### D6: "pide persona" es una política determinista del pipeline

**Choice**: `PoliticaPidePersona` (agente/aplicacion/politicas) usa `detectarPidePersona(texto)`
(dominio de `leads`, regex sobre texto normalizado con `normalizarTexto`). Va después de
`PoliticaNoTextuales` y `PoliticaTopeTurnos`, antes de `ContenidoLlm`. Registra el lead derivado con la
señal `pide_persona` (`leads.RegistrarPidePersona`) y responde con `TextoHandoff` + `pide-persona`. Fuera
de horario aplica la captura (D5) en vez de derivar.

### D7: el aviso se dispara desde un observador de handoff confirmado

**Choice**: `conversaciones` expone `RegistroObservadoresHandoff` (mismo patrón que
`RegistroConsumidorEventosCanal`, Fase 04 D8); `ProcesarTurno` llama a los observadores **después** de
que `TransicionarConversacion` confirmó el cambio. `leads` registra el suyo en `onModuleInit`: si el
motivo es `lead-caliente` o `pide-persona`, llama a `AvisarLead`. **Rationale**: NTF3 pide "después de
confirmar", y `conversaciones` no puede importar `leads` (dependencia hacia arriba). Un observador que
lanza se registra y no revierte el handoff.

### D8: ventana de 24 h con un `UPDATE ... RETURNING` atómico

**Choice**: `AvisarLead` ejecuta una sola sentencia que fija `lead.notificado_en = ahora` solo si
ningún lead del mismo contacto tiene `notificado_en > ahora − LEADS_VENTANA_NOTIFICACION_H`; si devuelve
la fila, encola el aviso en el outbox con `claveIdempotencia = aviso:<leadId>`; si el encolado lanza,
deshace la marca (mejor perder la marca que perder el aviso). **Rationale**: NTF2 (concurrencia) sin
locks; el reloj sale del `Clock` inyectado, nunca de `now()` de SQL.

### D9: Telegram detrás de `Notificador`, entrega por un manejador de outbox

**Choice**: `notificaciones` exporta `EncolarAviso` (arma la fila `notificacion.telegram`) y registra un
`ManejadorOutbox` que llama a `Notificador.enviar`; `NotificadorTelegram` usa `fetch` contra
`TELEGRAM_API_URL/bot<token>/sendMessage` con timeout. 429 y 5xx/red → `FalloPublicacion('transitorio')`
con `retry_after`; 400/401/403 → `permanente`. El texto del aviso lo arma una función pura
(`armarAviso`) sin datos personales completos y con un enlace a la conversación de Chatwoot. Sin token,
el manejador registra un `warn` y descarta (desarrollo). En `production` el token y el chat son
obligatorios (`superRefine`).

### D10: recordatorios con un job repetible

**Choice**: `leads` registra un job repetible BullMQ (`barrido-leads`, cada `LEADS_BARRIDO_MS`) con el
mismo patrón que `barrido-vencimientos`; `RecordarLeads` marca `recordatorio_en` con un `UPDATE ...
RETURNING` y encola el recordatorio (`claveIdempotencia = recordatorio:<leadId>`), que ignora la ventana
de 24 h porque es otro tipo de aviso.

### D11: configuración nueva

| Variable | Default | Regla |
|---|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | vacías | obligatorias en `production` |
| `TELEGRAM_API_URL` | `https://api.telegram.org` | permite el Telegram falso en tests |
| `TELEGRAM_HTTP_TIMEOUT_MS` | `5000` | entero ≥ 1 |
| `LEADS_VENTANA_NOTIFICACION_H` | `24` | 1-168 (R11) |
| `LEADS_RECORDATORIO_MIN` | `30` | 1-1440 (Q3) |
| `LEADS_BARRIDO_MS` | `60000` | ≥ 1000 |

`parametro.mensaje_captura_completa` (texto del negocio, R15) con respaldo en el repositorio de
parámetros del agente.

## Data Flow

```
Turno ─▶ MotorTurno ─▶ PoliticaNoTextuales ─▶ PoliticaTopeTurnos ─▶ PoliticaPidePersona ─▶ ContenidoLlm
   pide persona ──▶ leads.RegistrarPidePersona ─▶ handoff 'pide-persona' (dentro) | captura (fuera)
   LLM: marcar_lead_caliente ─▶ EvaluadorLeadDeLeads ─▶ leads.EvaluarPropuestaLead
        └─ escala ✓ + dentro ─▶ efecto lead-derivado ─▶ handoff 'lead-caliente'
        └─ escala ✓ + fuera  ─▶ captura pendiente ─▶ instrucciones ─▶ guardar_datos_contacto ─▶ completar
conversaciones: transición confirmada ─▶ observadores ─▶ leads.AvisarLead (ventana 24 h)
   ─▶ notificaciones.EncolarAviso ─▶ outbox 'notificacion.telegram' ─▶ ManejadorTelegram ─▶ Telegram
barrido-leads ─▶ leads.RecordarLeads ─▶ EncolarAviso (recordatorio)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/modulos/leads/{leads.module,index}.ts` | Create | Módulo y barril |
| `src/modulos/leads/dominio/{escala-lead,detectar-pide-persona,redactar-resumen}.ts` | Create | D1, D6, D3 |
| `src/modulos/leads/puertos/repositorio-lead.ts`, `infraestructura/prisma/repositorio-lead-prisma.ts` | Create | D3, D8 |
| `src/modulos/leads/aplicacion/{evaluar-propuesta-lead,registrar-pide-persona,obtener-captura-pendiente,completar-captura,avisar-lead,recordar-leads}.ts` | Create | D2-D10 |
| `src/modulos/leads/infraestructura/colas/barrido-leads.ts` | Create | D10 |
| `src/modulos/notificaciones/**` | Create | D9 |
| `src/modulos/agente/aplicacion/politicas/politica-pide-persona.ts` | Create | D6 |
| `src/modulos/agente/infraestructura/leads/{evaluador-lead-de-leads,captura-lead-de-leads}.ts` | Create | D2, D5 |
| `src/modulos/agente/aplicacion/{armar-contexto-inicial,politicas/contenido-llm,herramientas/*}.ts`, `agente.module.ts` | Modify | D4, D5, D1 |
| `src/modulos/conversaciones/**` | Modify | `pide-persona`, `RegistroObservadoresHandoff`, etiqueta |
| `src/plataforma/config/esquema.ts`, `.env.example`, `scripts/generar-contrato.ts`, `test/soporte/*` | Modify | D11 |
| `test/e2e/leads.e2e-spec.ts`, `test/evals/casos/sinteticos/*` | Create | T8 |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Escala, detector, redactor, `armarAviso`, casos de uso con repositorios en memoria | Funciones puras y dobles |
| Integration | `RepositorioLeadPrisma` (upsert, ventana atómica con concurrencia), manejador de Telegram contra un servidor falso | Postgres real, `TelegramFalso` HTTP |
| E2E | Webhook → lead confirmado dentro de horario (handoff + etiqueta + aviso), fuera de horario (captura + aviso, sigue en `bot`), "pide persona" | App completa con `FakePuertoLlm` y `TelegramFalso` |
| Evals | Casos guionados de escala, "pide persona" y captura | Arnés de la 07c |
| `[manual]` | Aviso real en el grupo de Telegram | Q4 |

## Threat Matrix

| Amenaza | Aplica | Control |
|---|---|---|
| Datos personales en el aviso o en logs | Sí | `armarAviso` sin teléfono/dirección; logs solo con ids y conteos (R14) |
| Token de Telegram en el repo o los logs | Sí | Solo por entorno; `npm run secretos`; nunca en mensajes de error |
| Inyección vía el texto del cliente en el aviso | Sí | El texto del aviso se escapa para el `parse_mode` usado (texto plano por defecto) |
| Doble aviso por concurrencia | Sí | D8 |
| Shell, subprocesos, VCS | No | — |

## Migration / Rollout

Sin esquema. Revertir = volver a enchufar `EvaluadorLeadSinEscala` y quitar la política; el observador
y el módulo `notificaciones` quedan inertes sin token. Review: **RDD** por commit; `judgment-day` no es
obligatorio (regla 6).

## Open Questions

- [ ] Q1 vocabulario de señales · [ ] Q2 guion de captura · [ ] Q3 recordatorio · [ ] Q4 bot de Telegram
