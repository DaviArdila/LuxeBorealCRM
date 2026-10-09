# SPEC — LuxeBorealCRM

> Fuente de verdad del **qué**. Describe solo lo vigente: la historia de decisiones va a
> `docs/adr/` y el avance a `docs/fases/README.md`. El detalle de cada fase vive en su change de
> OpenSpec (`openspec/changes/fase-NN-<nombre>/`); este documento tiene lo que es cierto para
> **todas** las fases.
>
> Estado: **0.3 aprobada por el usuario (2026-09-23)** — incorpora las respuestas P1-P16 de
> `docs/PREGUNTAS_ABIERTAS.md`, la adopción de OpenSpec, los ADR 0001-0008 aceptados y el contrato
> de API. Todo cambio posterior entra por un change de OpenSpec o un ADR.

## 1. Qué es

Un **CRM con atención automatizada** para un negocio de venta de productos (muebles e iluminación)
que vende por Marketplace y WhatsApp. Un solo servicio (monolito modular en NestJS) que:

1. **Atiende** a los clientes por WhatsApp con un agente LLM que consulta el catálogo, cotiza envíos,
   manda fotos y califica el interés de compra.
2. **Cede** la conversación a un asesor humano (en Chatwoot) cuando hay un lead caliente o el
   cliente lo pide, y la **recupera** cuando el asesor termina o no aparece.
3. **Registra** contactos, leads y (a partir de la Fase 11) inventario, ventas y envíos.
4. **Expone** una API para un cliente de back office independiente (contrato en
   `docs/adr/0008-contrato-api-openapi.md`).

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

Heredadas del prototipo y **no negociables**. La regla vigente y sus escenarios viven en la spec;
aquí solo el índice. Su detalle histórico completo está en `../ChatLuxeCRM/SPEC.md` (§ indicado en
la spec de cada dominio).

| # | Regla (una línea) | Spec |
|---|---|---|
| R1 | El LLM solo accede a datos por las 7 herramientas definidas; nunca consultas libres | `openspec/specs/agente/spec.md` |
| R2 | El LLM nunca calcula dinero: precios, envíos y recargos llegan formateados; el envío se cita siempre como rango aproximado | `openspec/specs/agente/spec.md` |
| R3 | Todo evento entrante se valida por firma sobre el body crudo antes de cualquier lógica | `openspec/specs/canales/spec.md` |
| R4 | Cada mensaje entrante se procesa una sola vez y cada saliente se envía una sola vez | `openspec/specs/canales/spec.md` |
| R5 | Toda salida al cliente pasa por un único punto que relee el estado antes de cada mensaje | `openspec/specs/conversaciones/spec.md` |
| R6 | Máquina de estados `bot`/`handoff_pendiente`/`humano`/`pausado`; el LLM nunca devuelve la conversación a `bot` | `openspec/specs/conversaciones/spec.md` |
| R7 | El control humano es un préstamo: todo estado que silencia al bot vence o se libera al resolver | `openspec/specs/conversaciones/spec.md` |
| R8 | Tres capas contra la sobreescritura bot/humano, más un lock por conversación | `openspec/specs/conversaciones/spec.md` |
| R9 | Lead caliente = el LLM propone y una escala determinista confirma; "pide hablar con una persona" avisa al asesor sin pasar por el LLM (el bot sigue atendiendo) | `openspec/specs/leads/spec.md` |
| R10 | Fuera de horario el bot sigue atendiendo y captura datos del cliente antes de avisar del lead | `openspec/specs/leads/spec.md` |
| R11 | Notificación de lead a Telegram: máximo 1 por contacto cada 24 h, con reintento hasta entregarse | `openspec/specs/leads/spec.md` |
| R12 | Mensajes no textuales: audio pide texto, imagen pide descripción, ubicación alimenta la cotización, resto se ignora | `openspec/specs/agente/spec.md` |
| R13 | Costos: el menor número posible de mensajes salientes por respuesta, tope de turnos, rate limit por contacto, techo mensual de gasto | `openspec/specs/conversaciones/spec.md` |
| R14 | Datos personales: consentimiento del cliente antes de guardar sus datos; nunca en logs contenido de mensajes, números completos, cédula ni correo; inbox redactado | `openspec/specs/privacidad/spec.md` |
| R15 | Horario, textos al cliente y parámetros del negocio son datos editables, nunca constantes en el código | `openspec/specs/configuracion-negocio/spec.md` |
| R16 | Kill switch global y por contacto, protegido por token | `openspec/specs/admin/spec.md` |

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
| `docs/fases/` | Hoja de ruta y estado de cada fase; el detalle de cada fase vive en su change |
| `docs/adr/` | Decisiones técnicas con alternativas |
| `openapi/openapi.json` | Contrato de la API, generado desde el código (desde la Fase 00b) |
| `docs/analisis/` | Análisis del prototipo, investigación y revisión del esquema |
| `docs/analisis/06-cliente-back-office.md` | Recomendación de tecnología para el cliente futuro de back office (no se construye) |
| `docs/migracion/inventario.md` | Qué se migra, cómo y en qué fase |
| `docs/PREGUNTAS_ABIERTAS.md` | Decisiones del usuario: abiertas y resueltas |
| `.claude/skills/` | Convenciones de código y de fases para el agente |
| `openspec/specs/` | Reglas vigentes por dominio (fuente de verdad del comportamiento actual) |
| `openspec/changes/` | Una carpeta por fase en curso; archivadas en `archive/` al cerrar |
| `openspec/config.yaml` | Configuración del ciclo SDD del proyecto |
| `odd/tasks/` | Tareas ODD fuera del ciclo de fases (mantenimiento, mejoras puntuales) |
