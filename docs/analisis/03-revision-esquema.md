# 03 · Revisión del esquema de datos (lógica de negocio del usuario)

- Fecha: 2026-09-22 · Estado: **propuestas y preguntas, nada decidido**
- Fuente: `ChatLuxeCRM/prisma/schema.prisma` desde la línea 90 ("diseñé de aquí en adelante") y
  `ChatLuxeCRM/MODELO_DATOS.md`.
- Regla: este esquema es lógica de negocio del usuario. Aquí solo se **sugiere** y se **pregunta**;
  cualquier cambio lo decide el usuario y queda en `MODELO_DATOS.md` del proyecto nuevo + ADR.

> **Resultado (2026-09-22).** Las respuestas del usuario quedaron en `MODELO_DATOS.md` v1 (§9 lista
> cada cambio y su motivo):
>
> | Sugerencia | Resultado |
> |---|---|
> | 2.1 Contacto con PK por teléfono | **Aceptada, con otra forma**: id propio + `chatwoot_contact_id`; **sin** tabla `identidad_canal` (la identidad multicanal la resuelve Chatwoot, ADR-0005) |
> | 2.2 Ciclo de vida del lead | **Aceptada** (P2) |
> | 2.3 Conversación como entidad | **Aceptada**, sin guardar mensajes (P3) |
> | 2.4 `parametro` tipado | **Aceptada** (versión mínima: `jsonb` + registro en código) |
> | 2.5 Ubicación en texto vs DANE | **Aceptada y rediseñada** con el usuario: cobertura por exclusión + rango aproximado (P4) |
> | 2.6 Movimiento sin usuario | **Aceptada** (`origen` + `usuario_id` opcional) |
> | 2.7 Medios fuera del disco | **Aceptada** a nivel de esquema (`clave_archivo`); dónde se guardan se decide en la Fase 03 |
> | 2.8 Detalles | UUID v7 (ADR-0007), `expira_control_en`, `creado/actualizado`: **aceptados** |
> | 2.9 Multiempresa (P5) | **Descartada**: un solo negocio (ADR-0006) |
>
> El resto de este documento queda como registro del análisis.

---

## 1. Lo que está bien diseñado y se conserva tal cual

| Decisión | Por qué es buena |
|---|---|
| Dinero en `Int` de pesos, nunca `Float` | Cero errores de redondeo |
| `venta` no guarda totales; se derivan de `venta_item` + `envio` | Una sola fuente de verdad del dinero |
| `venta_item.precioUnitarioCop` y `descripcion` congelados | El histórico no cambia si cambia el precio |
| Ledger `movimiento_inventario` como verdad y `producto.stock` como caché | Patrón contable correcto, auditable |
| `envio` separado de `venta` (otro dueño del ciclo, 0..1) | Refleja la realidad logística; 1:N sin migrar datos |
| `envio.porcentajeContraentrega` copiado al registrar | El histórico no depende del parámetro actual |
| Tarifa por franja de **peso facturable** sin FK a producto | Así cobran las transportadoras |
| `tarifa_envio.ciudad = ""` en vez de `NULL` | El unique compuesto funciona |
| Catálogo geográfico DANE con códigos oficiales como PK | Estable y sin mantenimiento |
| Enums nativos de Postgres | La base rechaza valores inválidos |
| Sin tabla `variante` (una variante = otro SKU) | Simple y coherente con la hoja, el `wa.me` y las fotos |

---

## 2. Sugerencias (cada una con su pregunta)

### 2.1 `contacto` con PK = teléfono → cliente con identidades por canal

- **Hoy:** `contacto.numero` es la PK y la FK de `venta`, `lead` y `estado_conversacion`.
- **Problema:** con Instagram, Messenger o un widget web, el cliente no tiene un número; y la misma
  persona puede escribir por dos canales.
- **Propuesta:**
  ```
  contacto (id cuid/uuid PK, nombre, documento, correo, telefono, …)
  identidad_canal (id, contacto_id FK, canal enum, id_externo, UNIQUE(canal, id_externo))
  ```
  `venta`, `lead` y la conversación apuntan a `contacto.id`. WhatsApp es una identidad más
  (`canal=whatsapp, id_externo=573001234567`).
- **Pregunta P1:** ¿los otros canales (Instagram, Messenger, web) están en el horizonte de este
  año? Si la respuesta es "no", se puede dejar la PK por teléfono y migrar después; si es "sí",
  conviene hacerlo desde el principio porque cambiar una PK con ventas encima es caro.

### 2.2 Ciclo de vida del `lead`

- **Hoy:** `lead` guarda la evaluación (temperatura, señales, resumen, derivado) pero no qué pasó
  después. No hay relación `lead → venta`.
- **Propuesta:** `lead.estado` enum (`nuevo`, `en_atencion`, `ganado`, `perdido`, `descartado`),
  `lead.motivoPerdida?`, `venta.leadId?` (FK opcional). Permite medir conversión del bot
  (¿cuántos leads calientes terminaron en venta?), que es la métrica que justifica el sistema.
- **Pregunta P2:** ¿quieren un embudo de ventas (pipeline) en el CRM, o el lead es solo el aviso?

### 2.3 Conversación como entidad

- **Hoy:** `estado_conversacion` es una fila por **número**, con estado y vencimiento. El contenido
  de los mensajes vive solo en Redis con TTL de 30 días (SPEC §8).
- **Propuesta:** `conversacion` (id, contacto_id, canal, estado, version, expira_control_en,
  id_externo_bandeja, abierta_en, cerrada_en) — una fila por **sesión**, no por cliente. Coincide
  con la regla de ADR-008 ("el escalamiento es de sesión, no de cliente") y con el paso de la
  fuente de verdad del estado a Postgres (antipatrón A6).
- **Pregunta P3:** ¿el CRM debe guardar el historial de mensajes (para que el back office lo muestre
  y para evals con datos reales), o se mantiene la regla de privacidad y el historial solo vive en
  Chatwoot? Si se guarda: ¿cuánto tiempo?

### 2.4 `parametro` sin tipo

- **Hoy:** clave/valor `String`; `horario_atencion` es JSON dentro de un texto; los números son
  texto.
- **Propuesta (mínima):** `valor` como `jsonb` + un esquema Zod por clave en código (registro de
  parámetros conocidos, con default y descripción). Sin tabla nueva.
- **Propuesta (más fuerte):** separar lo que es configuración (horario, factor volumétrico,
  recargo) de lo que es texto para el cliente (mensajes de handoff, aviso de datos) en una tabla
  `texto_bot (clave, texto, actualizado)`. Facilita editarlos desde el back office.

### 2.5 Texto libre de ubicación vs catálogo DANE

- **Hoy:** `contacto` y `tarifa_envio` guardan `departamento`/`ciudad` como texto (a propósito: el
  LLM no debe producir códigos DANE). `envio` sí usa `ciudadId`.
- **Propuesta:** mantener el texto que escribe el cliente, pero **resolverlo en código** a
  `ciudad.id` (normalización + alias) y guardar ambos: `contacto.ciudadTexto` + `contacto.ciudadId?`;
  `tarifa_envio` pasa a FK (`departamentoId`, `ciudadId?`) porque esa tabla la escribe el negocio,
  no el cliente. El LLM sigue pasando texto; la traducción es del backend.
- **Pregunta P4:** ¿la hoja de tarifas puede usar códigos DANE o nombres oficiales, o tiene que
  aceptar cualquier forma de escribir la ciudad?

### 2.6 `movimiento_inventario.usuarioId` obligatorio

- **Problema:** un movimiento automático (p. ej. una venta confirmada desde un flujo del bot o un
  import) no tiene usuario humano.
- **Propuesta:** un usuario técnico `sistema` sembrado, o `usuarioId?` + `origen` enum
  (`usuario`, `sistema`, `importacion`).

### 2.7 Medios en disco local

- **Hoy:** `foto.rutaLocal`, `producto.rutaCollage` apuntan a `data/media/`.
- **Propuesta:** `foto.claveAlmacenamiento` (clave en un bucket S3/R2/MinIO) detrás de un puerto
  `Almacenamiento`. Permite más de una instancia y backups independientes del servidor.

### 2.8 Detalles menores

| Tema | Sugerencia |
|---|---|
| IDs `cuid()` en `text` | Aceptable. Alternativa: `uuid` v7 nativo (ordenable por tiempo, tipo `uuid` de Postgres). Solo si se rehace desde cero |
| `expiraHumanoEn` también se usa para `handoff_pendiente` | Renombrar a `expiraControlEn` en el esquema nuevo (ADR-008 lo dejó sin renombrar solo para no migrar) |
| `producto.precioCop` sin historial | Suficiente (el precio se congela en `venta_item`). Si quieren reportes de cambios de precio: tabla `precio_historico` |
| Sin `creado/actualizado` en `tarifa_envio`, `parametro` | Agregar para auditoría básica |
| `categoria_producto` | Bien como está; el bot no la usa |
| Multiempresa | Ver P5 |

### 2.9 Pregunta de fondo P5: ¿un negocio o varios?

¿LuxeBorealCRM atiende **solo a este negocio**, o la idea es ofrecerlo a otros negocios (SaaS)?
Si es lo segundo, casi todas las tablas necesitan `empresa_id` y el diseño de seguridad cambia
(aislamiento por inquilino). Es la decisión más cara de cambiar después; conviene responderla
antes de la fase de persistencia.

---

## 3. Qué pasa con las tablas en la migración

| Tabla | Decisión propuesta |
|---|---|
| `categoria_producto`, `producto`, `foto` | Se migran; `foto` cambia a clave de almacenamiento (2.7) |
| `tarifa_envio` | Se migra; FK a geografía según P4 (2.5) |
| `parametro` | Se migra con `jsonb` + registro tipado (2.4) |
| `contacto` | Se migra; forma según P1 (2.1) |
| `estado_conversacion` | Se reemplaza por `conversacion` (2.3) |
| `lead` | Se migra + ciclo de vida según P2 (2.2) |
| `excepcion_horario`, `evento_fuera_cobertura` | Se migran igual |
| `usuario`, `movimiento_inventario`, `venta`, `venta_item`, `envio` | Se migran; su lógica se construye en las fases de back office |
| `departamento`, `ciudad` | Se migran con su semilla DANE |
| Nuevas | `identidad_canal` (P1), `evento_entrante` (inbox, A8), `outbox`, `uso_llm` |
