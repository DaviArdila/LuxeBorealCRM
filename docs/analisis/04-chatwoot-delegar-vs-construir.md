# 04 · Chatwoot: qué delegamos y qué construimos

- Fecha: 2026-09-22 · Estado: primera versión
- Regla del usuario: **si Chatwoot ya lo hace, no lo construimos.**
- Restricción: solo cuenta lo que trae la **edición Community** (gratis, MIT). Lo de pago
  (Premium 19 USD/agente/mes, Enterprise 99) no se da por disponible.
- Verificación: **V** = verificado en la instancia local v4.17.1 del prototipo
  (`ChatLuxeCRM/docs/CHATWOOT.md`); **D** = según documentación oficial; **?** = verificar en la
  Fase 04 antes de depender de ello.

## 1. Lo que delegamos

| Capacidad | Qué hace Chatwoot | Cómo lo usamos | Ver. |
|---|---|---|---|
| Canales | WhatsApp Cloud, Messenger, Instagram, Telegram, Line, SMS, email, widget web, canal API | Chatwoot es el único punto de entrada y salida; nosotros no hablamos con Meta salvo el "escribiendo…" | V (WhatsApp), D (resto) |
| Webhook de Meta | Recibe y valida los webhooks de cada canal | No los recibimos; nos llegan como eventos del Agent Bot | V |
| Historial de mensajes y adjuntos | Guarda toda la conversación, visible para los asesores | **No guardamos mensajes** (P3). Si hace falta, se leen por API (`GET …/conversations/{id}/messages`) | V |
| Identidad del contacto | Un contacto con varios `contact_inbox` (uno por canal) y fusión de duplicados | Guardamos `chatwoot_contact_id`; no hay tabla de identidades propia (P1) | D |
| Datos del contacto visibles al asesor | Atributos personalizados de contacto y conversación | Escribir ahí producto de interés, ciudad, temperatura del lead, para que el asesor los vea sin salir de la bandeja | D |
| Bandeja humana | Web + app móvil, notas privadas, menciones, adjuntos | Es donde trabaja el asesor | V |
| Asignación | Asignación automática por disponibilidad, equipos | Se activa en el inbox; el bot no asigna | D |
| Etiquetas | Etiquetas por conversación, filtros | `lead-caliente`, `fuera-de-horario` | V |
| Respuestas guardadas y macros | Plantillas con atajo `/` y secuencias de acciones en un clic | Para los asesores; no se construye nada | D |
| Reglas de automatización | Eventos: conversación creada / actualizada / reabierta, mensaje creado. Acciones: asignar, etiquetar, responder, resolver, posponer, silenciar, enviar correo | Reglas operativas simples (asignar por etiqueta, etc.). La lógica del agente **no** va aquí | D |
| Reportes de atención | Tiempos de primera respuesta y resolución, por agente / inbox / etiqueta / equipo, CSAT | No construimos reportes de atención; los nuestros son de negocio (leads → ventas, inventario) | D |
| Notificaciones al asesor | Push de la app móvil al abrir/asignar conversaciones | Complemento o reemplazo de Telegram (P12) | D |
| Plantillas y campañas de WhatsApp | Envío de plantillas aprobadas; campañas a listas de contactos (acceso anticipado) | Para campañas futuras (fuera de alcance hoy) | D, ? |
| Centro de ayuda | Artículos y preguntas frecuentes públicas | Posible fuente de conocimiento del agente a futuro | D |
| Dashboard Apps | Pestaña con nuestra web embebida dentro de la conversación; recibe el contexto (conversación y contacto) por `postMessage` | Primera pantalla del CRM al lado del chat: ficha del lead, crear venta (P14) | D |

## 2. Lo que construimos (Chatwoot no lo hace o no sirve)

| Capacidad | Por qué no se delega |
|---|---|
| Agente con herramientas (catálogo, ficha, cotización, fotos, lead, datos) y la regla de que el LLM nunca calcula dinero | Captain (el agente de Chatwoot) es **de pago** en self-hosted, usa OpenAI sin nuestras reglas ni acceso a nuestro catálogo |
| Control bot/humano con vencimiento (préstamo) | Chatwoot solo tiene `pending` / `open` / `resolved`; no devuelve la conversación al bot si nadie la toma en 45 min |
| Agrupar mensajes seguidos (debounce) y lock por conversación | No existe |
| "Escribiendo…" y leído en WhatsApp | Verificado: Chatwoot no los reenvía a Meta (V) |
| Calificación de leads (escala determinista) y embudo | No existe |
| Catálogo, fotos/collage, cobertura y precio aproximado de envío | No existe |
| Captura de datos fuera de horario | El horario de Chatwoot solo manda un mensaje automático de ausencia |
| Inventario, ventas, envíos, usuarios del back office | Chatwoot no es un ERP |
| Kill switch del bot | Es del bot |

## 3. Zona gris (decidir o verificar)

| Tema | Opciones | Pregunta |
|---|---|---|
| Timbre de leads | Telegram (ya funciona) vs push de la app de Chatwoot | P12 |
| Historial corto para el LLM | Redis propio (hoy, últimos 6 turnos) vs leerlo de la API de Chatwoot en cada turno | Decidir en la Fase 07 midiendo la latencia |

### Resuelto en la Fase 04 (canal Chatwoot, 2026-09-27)

| Tema | Decisión | Dónde queda |
|---|---|---|
| Horario semanal (P13) | **Se mantiene la tabla propia** (`excepcion_horario`, Fase 02); no se delega a Chatwoot, que no tiene calendario de festivos fiable. El puerto `Horario` (`src/modulos/horario/puertos/horario.ts`) no se toca | Decisión del usuario, `openspec/changes/fase-04-canal-chatwoot/proposal.md` §"Decisiones ya tomadas" |
| Auto-resolver por inactividad | **Queda apagado por defecto.** Su umbral único por cuenta y solo sobre `open` no sustituye los dos TTL de la máquina de estados bot/humano (Fase 05). Esta fase solo garantiza que `conversation_status_changed` (incluido un `resolved`) llegue limpio al inbox; no construye ninguna política de auto-resolución | `openspec/changes/fase-04-canal-chatwoot/proposal.md` §"Decisiones ya tomadas"; la Fase 05 decide la política sobre sus propios TTL |

## 4. Lo que queda prohibido

- Construir algo de la §1 sin antes descartar explícitamente la opción de Chatwoot.
- Depender de una función de pago de Chatwoot.
- Guardar el contenido de los mensajes en nuestra base.

## Fuentes

- [Precios self-hosted (Community / Premium / Enterprise)](https://www.chatwoot.com/pricing/self-hosted-plans)
- [Automatizaciones](https://www.chatwoot.com/features/automations)
- [Agent Bots](https://www.chatwoot.com/hc/user-guide/articles/1677497472-how-to-use-agent-bots)
- [Webhooks (payload con `account`, `inbox`, `conversation.channel`)](https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks)
- [Dashboard Apps](https://www.chatwoot.com/hc/user-guide/articles/1677691702-how-to-use-dashboard-apps)
- [Horario de atención](https://www.chatwoot.com/features/business-hours)
- [Plantillas de WhatsApp](https://www.chatwoot.com/hc/user-guide/articles/1754940076-whatsapp-templates)
- [Campañas de WhatsApp](https://www.chatwoot.com/blog/whatsapp-campaigns-and-workflow-improvements)
- [Repositorio y README](https://github.com/chatwoot/chatwoot)
- `ChatLuxeCRM/docs/CHATWOOT.md` — comportamiento verificado en v4.17.1
