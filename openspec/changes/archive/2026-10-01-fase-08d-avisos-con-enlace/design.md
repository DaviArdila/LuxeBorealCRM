# Design: Fase 08d — Avisos al asesor con enlace a la conversación

- Change: `fase-08d-avisos-con-enlace` · Fecha: 2026-10-01 · Estado: **implementado (2026-10-01)**
- Proposal: `proposal.md` · Specs: `notificaciones` (NTF1 y NTF2 modificados; NTF5-NTF7), `conversaciones` (CNV12)
- ADRs: ninguno nuevo (ver D4: solo habría ADR si el dueño elige la columna de la Q3)

## Technical Approach

Hoy hay un solo camino de aviso: `leads` observa el handoff, y si el motivo es de lead encola un aviso.
Esta fase **no cambia ese camino**: lo completa con otros dos, siempre por el outbox y el puerto `Notificador`
existentes. Todo aviso sale por `EncolarAviso` con un `DatosAviso` más rico (motivo, producto, enlace).

```
handoff confirmado ─┬─ motivo de lead ──▶ leads.AvisoLeadEnHandoff ──▶ AvisarLead ─┐
(ProcesarTurno)     └─ otro motivo ─────▶ notificaciones.AvisoTraspaso ────────────┤
                                                                                     ├─▶ EncolarAviso ─▶ outbox ─▶ Telegram
mensaje del cliente en humano ─▶ conversaciones: marca de espera (Redis)             │    (texto con enlace)
barrido de esperas ──▶ observadores ──▶ notificaciones.AvisoEsperaCliente ───────────┘
```

## Architecture Decisions

### D1: el enlace se construye en `notificaciones`, con una función pura

**Choice**: `construirEnlaceConversacion({ base, cuenta, idChatwoot })` en `notificaciones/dominio/`, sin estado ni
I/O. La base sale de `CHATWOOT_URL_PUBLICA` con respaldo en `CHATWOOT_URL`; se le quitan las barras finales.
**Alternatives**: que cada módulo que avisa arme su URL (duplicación y riesgo de formatos distintos); guardar la
URL en `parametro` (cambia sin desplegar, pero el entorno ya es dueño de las URLs, R15 no aplica a infraestructura).
**Rationale**: una sola regla, probada sin infraestructura; la variable nueva es opcional, así que no rompe ningún
entorno existente.

### D2: `DatosAviso` crece con tipos nuevos, sin romper los que existen

**Choice**: `tipo` pasa de `'lead' | 'recordatorio'` a `'lead' | 'recordatorio' | 'traspaso' | 'espera'`; se
añaden campos opcionales `motivo`, `producto` (nombre), `enlace` y `esperaMin`. `armarAviso` sigue siendo la
segunda barrera de R14: redacta cualquier texto libre que reciba.
**Alternatives**: una clase por tipo de aviso (más tipos, el mismo resultado: texto plano).
**Rationale**: los avisos actuales no cambian de forma salvo por las líneas nuevas; sus tests se ajustan, no se
reescriben.

Formato (texto plano; la línea del enlace va sola):

```
Lead caliente: un cliente necesita un asesor.
Producto: Regadera fija con brazo
Señales: pide_pagar
Resumen: ...
Atender: https://chat.ejemplo.co/app/accounts/1/conversations/2
```

| Motivo del traspaso | Texto del título |
|---|---|
| `tope-turnos` | `Traspaso: el bot llegó al tope de turnos con un cliente.` |
| `fallo-llm` | `Traspaso: el bot no pudo responder por una falla técnica.` |
| `techo-gasto` | `Traspaso: el bot dejó de responder por el techo de gasto.` |
| `audio-repetido` | `Traspaso: el cliente insiste con audios y el bot no los procesa.` |
| `argumentos-invalidos` | `Traspaso: el bot no pudo completar una consulta.` |
| `plazo-agotado` | `Traspaso: el bot se quedó sin tiempo para responder.` |
| espera | `Cliente esperando: escribió hace <n> min y nadie ha respondido.` |

Los textos son **datos del negocio** (R15) solo en el sentido de que el dueño podría querer editarlos; en esta fase
quedan como constantes del dominio de `notificaciones` (son para el equipo interno, no para el cliente) y se
anota como límite.

### D3: el aviso de traspaso sin lead vive en `notificaciones` y se observa desde `conversaciones`

**Choice**: `AvisoTraspaso` (en `notificaciones`) se registra en `RegistroObservadoresHandoff` y atiende los
motivos que **no** son de lead (el complemento de `MOTIVOS_DE_LEAD`). `EventoHandoff` gana el campo `version` (la de
la conversación tras la transición). La clave de idempotencia es
`traspaso:<conversacionId>:<version>:<motivo>`: el reintento del mismo evento cae en la restricción única del
outbox y no duplica; un traspaso posterior (otra versión) avisa de nuevo.
**Alternatives**: ponerlo en `leads` (ya tiene las dependencias, pero un traspaso sin lead no es un lead y
mezclaría responsabilidades); ampliar `MOTIVOS_DE_LEAD` y crear un lead artificial (ensucia el embudo).
**Rationale**: `notificaciones` pasa a importar el barril de `conversaciones`; no hay ciclo (`conversaciones` no
importa a nadie de arriba) y `npm run fronteras` lo confirma. **Si la regla de fronteras lo rechaza**, el
observador se mueve a `leads` y se anota la desviación.

### D4: la marca de «cliente esperando» vive en Redis (Q3, por defecto)

**Choice**: dos estructuras en Redis, ambas por conversación y sin contenido de mensajes (R14):
`conversaciones:espera:pendiente` (ZSET: miembro = id de la conversación, puntaje = instante del primer mensaje
sin respuesta, `ZADD NX`) y `conversaciones:espera:avisada` (SET). Se registra desde
`ConsumidorConversaciones` cuando el mensaje llega con la conversación en `humano` o `handoff_pendiente` (hoy ese
camino hace `return` sin dejar rastro, `consumidor-conversaciones.ts:118-122`). Se borra de ambas en todo eco
humano (`cederAHumano` y el camino de renovación) y en toda transición a `bot` (`TransicionarConversacion`).
**Alternatives**: columna `espera_desde` en `conversacion` (durable y consultable, pero es **cambio de esquema** y
decisión del dueño, `CLAUDE.md`; si la elige, ADR-0021 y migración). **Rationale**: el aviso de espera es de
apoyo —el traspaso ya avisó—, así que perderlo si Redis se reinicia es aceptable; el patrón de claves de Redis
por conversación ya existe (`agente:<id>:…`, marca de espera de handoff).

Un fallo de Redis al registrar o borrar la marca **no** frena el mensaje (CNV12): `warn` sin datos del cliente.

### D5: barrido propio, con su frecuencia

**Choice**: `BarridoEsperas` en `conversaciones`, mismo patrón que `BarridoVencimientos` (cola BullMQ con
`upsertJobScheduler`, listener de error, apagado con `COLAS_TRABAJADORES`). Cada pasada: toma del ZSET las
conversaciones con puntaje ≤ `ahora − ESPERA_CLIENTE_MIN`, relee la conversación, y si sigue en `humano` o
`handoff_pendiente` y no estaba avisada, la marca como avisada, la quita del ZSET y llama a los observadores
(`ObservadorEsperaCliente`, registro simétrico al de handoff). Si el observador falla, se deshace la marca (el
próximo barrido reintenta), igual que `RecordarLeads`.
**Alternatives**: colgarlo de `BarridoVencimientos` (cada 5 min por defecto: el aviso saldría entre 10 y 15 min);
colgarlo de `BarridoLeads` (es de otro dominio). **Rationale**: frecuencia propia
(`ESPERA_CLIENTE_BARRIDO_MS`, 60 s) sin cambiar el barrido de vencimientos.

### D6: quien arma el aviso necesita el id de Chatwoot

`AvisarLead`, `RecordarLeads` y los observadores nuevos solo conocen el id interno de la conversación. Se expone en
`conversaciones` un caso de lectura mínima `ObtenerReferenciaConversacion` (`id` → `{ chatwootConversationId }`)
que `notificaciones` y `leads` consumen por el barril. El nombre del producto sale del caso de uso de catálogo que
`leads` ya usa para la cobertura (si no existe uno de lectura por id, T2 añade `ObtenerNombreProducto` en `catalogo`;
nunca el SKU, AGT16).

## Interfaces / Contracts

| Pieza | Módulo | Qué es |
|---|---|---|
| `construirEnlaceConversacion` | `notificaciones/dominio` | función pura |
| `DatosAviso` (ampliado) | `notificaciones/dominio` | tipos `traspaso`, `espera`; campos `motivo`, `producto`, `enlace`, `esperaMin` |
| `AvisoTraspaso` | `notificaciones/aplicacion` | `ObservadorHandoff` para los motivos sin lead |
| `AvisoEsperaCliente` | `notificaciones/aplicacion` | `ObservadorEsperaCliente` |
| `ObservadorEsperaCliente`, `RegistroObservadoresEspera` | `conversaciones/aplicacion` | puerto y registro (inversión de dependencia, D7 de la 08) |
| `MarcaEsperaCliente` | `conversaciones/puertos` + Redis | `registrar`, `cerrar`, `vencidas(limite)`, `marcarAvisada` |
| `BarridoEsperas` | `conversaciones/infraestructura/colas` | cola y worker repetible |
| `ObtenerReferenciaConversacion` | `conversaciones/aplicacion` | lectura mínima |
| `EventoHandoff.version` | `conversaciones/aplicacion` | campo nuevo |

## Configuración nueva

| Variable | Defecto | Uso |
|---|---|---|
| `CHATWOOT_URL_PUBLICA` | vacía (cae en `CHATWOOT_URL`) | base del enlace; debe ser accesible desde el celular |
| `ESPERA_CLIENTE_MIN` | 10 (mín. 1) | minutos de espera antes de avisar |
| `ESPERA_CLIENTE_BARRIDO_MS` | 60000 (mín. 10000) | frecuencia del barrido de esperas |

`.env.example` y `docs/operacion/` se actualizan en la misma tarea que las introduce.

## Testing Strategy

| Nivel | Qué |
|---|---|
| Unit | enlace, `armarAviso` (cada tipo y motivo, redacción R14), `MarcaEspera` en memoria, observadores con outbox falso, barrido con `ClockFalso` |
| Integración | marca de espera sobre Redis real; barrido con Postgres y Redis reales; idempotencia del aviso de traspaso contra la restricción única del outbox |
| E2E | webhook firmado hasta el tope de turnos → fila `notificacion.telegram` con el enlace; cliente que escribe en `humano` y no recibe respuesta → aviso de espera tras `ESPERA_CLIENTE_MIN` con el reloj falso |
| Manual `[manual]` | un aviso real en Telegram y el enlace tocable **desde el celular** con un Chatwoot accesible (Q4, Q5) |

## Risks (diseño)

- El estado `handoff_pendiente` ya tiene su propio aviso al **cliente** (CNV3); no se toca. Esta fase solo avisa al
  **asesor**.
- `techo-gasto` puede dispararse en todas las conversaciones a la vez: un aviso por conversación (proposal).
- La marca de espera no distingue «gracias» de una duda: es deliberado (R14).

## Rollback

Sin migración. Revertir el código vuelve al aviso anterior; las claves de Redis quedan huérfanas y expiran o se
ignoran. `ESPERA_CLIENTE_MIN` alto o `COLAS_TRABAJADORES=false` desactiva solo el aviso de espera.
