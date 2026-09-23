# SPEC — LuxeBorealCRM

> Fuente de verdad del **qué**. Describe solo lo vigente: la historia de decisiones va a
> `docs/adr/` y el avance a `docs/fases/README.md`. El detalle de cada fase vive en su propia spec
> (`docs/fases/FASE-NN-*.md`); este documento tiene lo que es cierto para **todas** las fases.
>
> Estado: **borrador 0.2 (2026-09-22)** — incorpora las respuestas P1-P11 de
> `docs/PREGUNTAS_ABIERTAS.md`. Nada de este documento está aprobado hasta que el usuario lo diga.

## 1. Qué es

Un **CRM con atención automatizada** para un negocio de venta de productos (muebles e iluminación)
que vende por Marketplace y WhatsApp. Un solo servicio (monolito modular en NestJS) que:

1. **Atiende** a los clientes por WhatsApp con un agente LLM que consulta el catálogo, cotiza envíos,
   manda fotos y califica el interés de compra.
2. **Cede** la conversación a un asesor humano (en Chatwoot) cuando hay un lead caliente o el
   cliente lo pide, y la **recupera** cuando el asesor termina o no aparece.
3. **Registra** contactos, leads y (a partir de la Fase 11) inventario, ventas y envíos.
4. **Expone** una API para un cliente de back office independiente.

Es la reescritura del prototipo `ChatLuxeCRM` (funcional con WhatsApp real desde 2026-09-17) con una
arquitectura que pueda crecer. El prototipo es la **referencia de comportamiento**: ante una duda
sobre qué debe pasar, se mira qué hace el prototipo y su test.

## 2. Alcance

**Dentro (fases 00-14):** todo lo que hace el prototipo (ver `docs/migracion/inventario.md`) +
pasarela de LLM multiproveedor + observabilidad del agente + evals + usuarios, inventario, ventas,
envíos y API del back office.

**Fuera, hasta nueva decisión:**
- El cliente del back office (interfaz): es otro proyecto; aquí solo su API.
- Canales distintos de WhatsApp (el diseño los permite vía Chatwoot; no se implementan).
- Pagos o checkout dentro del chat.
- Campañas salientes / remarketing (requieren plantillas Marketing y opt-in).
- Multi-idioma (solo español).
- Escalado a más de una instancia (el diseño no debe impedirlo; no se opera así).
- Multiempresa: el sistema es para **un solo negocio** (ADR-0006).
- Lo que Chatwoot Community ya hace: canales, historial de mensajes, bandeja, asignación,
  reportes de atención (`docs/analisis/04-chatwoot-delegar-vs-construir.md`).

## 3. Principios de arquitectura

Detalle y porqué en `docs/analisis/` y en los ADR; la skill `luxeboreal-arquitectura` los traduce a
reglas de código.

1. **Monolito modular**: un proceso, módulos NestJS por contexto de negocio con fronteras
   verificadas automáticamente (ADR-0001).
2. **El dominio no conoce la infraestructura**: canales, LLM, notificaciones, almacenamiento y reloj
   entran por puertos inyectados. Cambiar Chatwoot, el proveedor de LLM o Telegram es escribir un
   adaptador.
3. **Postgres es la fuente de verdad**; Redis es para lo efímero (colas, buffer, locks, dedupe,
   cachés) (ADR-0003).
4. **Entrega al menos una vez + idempotencia**: todo evento entrante se registra antes de
   confirmarse; toda salida lleva clave de idempotencia; los efectos secundarios que deben
   sobrevivir una caída pasan por outbox (ADR-0004).
5. **El proveedor de LLM es configuración**, no código (ADR-0002): GPT-5.6 Luna vía OpenRouter con
   modelos de respaldo.
6. **Delegar antes de construir**: lo que Chatwoot Community ya resuelve no se construye (ADR-0005).
7. **Núcleo agnóstico al canal**: el agente no pregunta por el canal; lo que cambia por canal vive en
   un perfil de capacidades en el borde (`docs/analisis/05-multicanal.md`).
8. **Una feature no está terminada sin su test**, y el test verifica el criterio de aceptación de la
   spec de su fase.

## 4. Reglas de negocio invariantes

Heredadas del prototipo y **no negociables**. Su detalle completo está hoy en
`../ChatLuxeCRM/SPEC.md` (§ indicado) y se trae a la spec de la fase que las implementa.

| # | Regla | Origen | Fase |
|---|---|---|---|
| R1 | El LLM solo accede a datos por las herramientas definidas (hoy 6: `buscar_producto`, `obtener_ficha`, `cotizar_envio`, `enviar_fotos`, `marcar_lead_caliente`, `guardar_datos_contacto`). Nunca consultas libres | §3.1 | 07 |
| R2 | El LLM nunca calcula dinero: precios, envíos y recargos llegan formateados desde el backend y se citan tal cual. El envío se cita **siempre como rango aproximado** (el precio real lo confirma la transportadora al despachar) y el recargo contraentrega como porcentaje que paga el cliente. Hay cobertura salvo en la lista de zonas excluidas (`MODELO_DATOS.md` §4) | §3.2 | 02, 07 |
| R3 | Todo evento entrante se valida (firma sobre el body crudo) antes de cualquier lógica; firma inválida → 401 sin registrar el payload | §1.2 | 04 |
| R4 | Cada mensaje entrante se procesa una sola vez y cada mensaje saliente se envía una sola vez, aunque haya reintentos | §3.4 | 04 |
| R5 | Toda salida al cliente pasa por un único punto que relee el estado de la conversación justo antes de cada mensaje y aborta si el bot ya no tiene el control | §4.2 | 04, 05 |
| R6 | Máquina de estados `bot` / `handoff_pendiente` / `humano` / `pausado`. El LLM nunca devuelve una conversación a `bot` | §4.1 | 05 |
| R7 | El control humano es un préstamo: todo estado que silencia al bot vence (`handoff_pendiente` sin recoger, `humano` sin actividad del asesor) o se libera al resolver en la bandeja. El peor resultado posible es un cliente que escribe y nadie responde | §4.1, ADR-008 del prototipo | 05 |
| R8 | Tres capas contra la sobreescritura bot/humano: debounce, cancelación en el eco humano, guardia en el envío; más lock por conversación | §4.2 | 05 |
| R9 | Lead caliente = el LLM propone y una escala determinista confirma (≥1 señal fuerte o ≥2 débiles). "Pide hablar con una persona" deriva sin pasar por el LLM. Sin cobertura de envío no hay lead | §5 | 08 |
| R10 | Fuera del horario de atención el bot sigue atendiendo, captura los datos del cliente antes de avisar del lead y no aparca la conversación | §4.5 | 08 |
| R11 | Notificación de lead al grupo de Telegram: máximo 1 por contacto cada 24 h, después de confirmar el cambio de estado, con reintento hasta entregarse | §4.6-4.7 | 08 |
| R12 | Mensajes no textuales: audio → pide texto (segundo audio → humano); imagen → pide descripción; ubicación → alimenta la cotización; resto → se ignora sin costo | §3.5 | 07 |
| R13 | Costos: mínimo de mensajes salientes por respuesta donde el canal cobra por mensaje (una foto es un mensaje; collage por defecto); tope de turnos por conversación; rate limit por contacto; techo mensual de gasto | §7 | 05, 06, 07 |
| R14 | Datos personales: aviso de asistente automatizado en el primer mensaje; nunca en logs contenido de mensajes, números completos, cédula ni correo. El contenido de los mensajes **no se persiste** en nuestra base (vive en Chatwoot): el inbox guarda el evento **redactado** (ids, tipo, metadatos) y al reprocesar se relee el contenido de la API de Chatwoot; `lead.resumen` no incluye datos personales | §8 | todas |
| R15 | Horario, textos al cliente y parámetros del negocio son datos editables, nunca constantes en el código | §3.2 | 01, 02 |
| R16 | Kill switch global y por contacto, protegido por token | §4.8 | 09 |

## 5. Atributos de calidad

| Atributo | Objetivo |
|---|---|
| Latencia de ACK del webhook | < 500 ms (el proveedor corta a los 5 s) |
| Tiempo de respuesta al cliente | p95 < 20 s desde el último mensaje de la ráfaga (debounce incluido) |
| Mensajes perdidos | 0: un evento aceptado se procesa o queda visible como fallido |
| Mensajes duplicados al cliente | 0 |
| Disponibilidad del agente ante caída de un proveedor LLM | Fallback automático al siguiente de la cadena |
| Costo mensual (VPS + LLM + Meta) | ≤ 20 USD al volumen actual (prototipo SPEC §7) |
| Suite de tests (`npm run verify`) | < 3 min en la máquina de desarrollo |

## 6. Glosario

- **Conversación**: una sesión de atención con un contacto por un canal; tiene estado y vencimiento.
- **Turno**: una respuesta del bot a una ráfaga de mensajes agrupados por el debounce.
- **Handoff**: paso del control al humano. **Eco humano**: un asesor escribió desde la bandeja.
- **Lead**: evaluación de interés de compra (frío / tibio / caliente) ligada a un contacto.
- **Puerto / adaptador**: interfaz que el dominio necesita / implementación concreta de un proveedor.
- **Inbox de eventos / outbox**: tablas que garantizan que lo recibido y lo que hay que emitir no se
  pierde ante una caída.

## 7. Documentos

| Documento | Para qué |
|---|---|
| `SPEC.md` | Qué es y reglas invariantes (este archivo) |
| `CLAUDE.md` | Cómo se trabaja día a día en el repo |
| `MODELO_DATOS.md` | Modelo de datos (borrador v1; se aprueba al escribir la Fase 01) |
| `docs/fases/` | Hoja de ruta, estado y una spec por fase |
| `docs/adr/` | Decisiones técnicas con alternativas |
| `docs/analisis/` | Análisis del prototipo, investigación y revisión del esquema |
| `docs/migracion/inventario.md` | Qué se migra, cómo y en qué fase |
| `docs/PREGUNTAS_ABIERTAS.md` | Decisiones del usuario: abiertas y resueltas |
| `.claude/skills/` | Convenciones de código y de fases para el agente |
