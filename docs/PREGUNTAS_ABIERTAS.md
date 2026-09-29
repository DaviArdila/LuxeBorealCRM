# Preguntas abiertas

Decisiones que son del usuario. Al responder una: se anota la respuesta, la fecha y dónde quedó
reflejada.

## Abiertas

| # | Pregunta | Bloquea | Recomendación |
|---|---|---|---|
| P13 | Horario de atención semanal: ¿se toma del horario del inbox en Chatwoot o de nuestra tabla (`parametro.horario_atencion` + `excepcion_horario`)? | Fase 04 (decisión final) | **Decidido el camino (2026-09-23):** la Fase 02 usa la tabla propia detrás de un puerto `Horario`; la Fase 04 verifica si Chatwoot admite festivos y lectura por API. Si sí, se delega; si no, se queda la tabla |
| P14 | ¿La primera pantalla del CRM es una Dashboard App dentro de Chatwoot (ficha del lead, crear venta al lado del chat), antes o en vez de un back office separado? | Fase 11 | **Se decide al inicio de la Fase 11** (acordado 2026-09-23); la API de la Fase 14 se diseña para ambas opciones. Recomendación de tecnología del cliente: `docs/analisis/06-cliente-back-office.md` |
| P20 | ¿Qué costo se registra en `uso_llm` para un intento que el gateway abortó por timeout? Hoy es 0, pero OpenRouter puede haber seguido generando y cobrando, así que el gasto medido —y el techo de 10 USD/mes— puede quedar por debajo del real (hallazgo W2 de `judgment-day`, Fase 06) | Fase 09 | Dejar el límite de gasto de la consola de OpenRouter como freno de fondo; si el gasto real se desvía del medido, estimar un costo mínimo por intento abortado (tokens de entrada × precio de entrada) |
| P21 | ¿Se confirma que el techo **falle abierta**? Si no se puede medir el gasto (base caída), el gateway deja pasar la llamada y solo loguea un error (hallazgo S1, Fase 06) | Fase 09 | Confirmar: con la base caída el bot tampoco puede operar, y bloquear al cliente por un fallo de contabilidad perdería turnos |
| P22 | Texto real de `mensaje_techo_gasto`: lo que ve el cliente cuando se alcanza el techo mensual y la conversación pasa a un asesor. Hoy rige un default provisional | Fase 10 (corte) | Cargar en `parametro` la clave `mensaje_techo_gasto` con el texto definitivo del negocio; no requiere desplegar |
| P23 | ¿Se hace atómica la verificación del techo? Dos turnos simultáneos justo en el borde pueden pasarse del techo por unas pocas llamadas (hallazgo S3, Fase 06); con un solo proceso el sobrepaso son centavos | Fase 09 | Aceptable con una instancia (ADR-0013 ya la asume); revisar si el servicio se escala a más de un proceso |

## Resueltas

| # | Pregunta | Respuesta (P1-P11 y P15: 2026-09-22) | Dónde quedó |
|---|---|---|---|
| P1 | ¿Teléfono como PK de `contacto`? ¿Otros canales cambian el diseño? | Se elimina el teléfono como PK (antipatrón). Núcleo agnóstico al canal + perfil de capacidades; identidad multicanal delegada al contacto de Chatwoot | `MODELO_DATOS.md` §5, `docs/analisis/05-multicanal.md`, ADR-0005 |
| P2 | ¿Embudo de ventas para los leads? | Sí: `lead.estado` (nuevo → en atención → ganado / perdido / descartado) + `venta.lead_id` | `MODELO_DATOS.md` §5-§6 |
| P3 | ¿Guardar historial de mensajes? | No. Chatwoot es la fuente; si hace falta, se lee por su API | `MODELO_DATOS.md` §1, `SPEC.md` R14, doc 04 |
| P4 | ¿Cómo se modelan cobertura y tarifas de envío? | Cobertura por **exclusión** (lista corta de lugares sin cobertura); **rango aproximado** nacional + excepciones; precio real al despachar (Interrapidísimo); recargo contraentrega 5 % lo paga el cliente; lugares elegidos de la lista DANE | `MODELO_DATOS.md` §4, `SPEC.md` R2 |
| P5 | ¿Un negocio o varios (SaaS)? | Un solo negocio | ADR-0006 |
| P6 | ¿Modelo principal de LLM? | GPT-5.6 Luna vía OpenRouter, con lista de modelos de respaldo | ADR-0002 |
| P7 | ¿Migrar datos del prototipo? | No. Arranque limpio; solo se toma la estructura de la base | `MODELO_DATOS.md`, `docs/migracion/inventario.md` |
| P8 | ¿Cuándo el back office? | Después del corte (fases 11-14 tras la 10); mientras tanto catálogo por Sheets + importador | `docs/fases/README.md` |
| P9 | ¿Observabilidad en producción? | Mínimo viable: logs JSON a stdout con rotación (Dokploy), Sentry gratis para errores, Uptime Kuma, tabla `uso_llm`. Langfuse después si hace falta | `docs/fases/README.md` (Fase 09), `MODELO_DATOS.md` §7 |
| P10 | ¿Vitest o Jest? | **Vitest + ESM (2026-09-23; reemplaza Jest: el CLI de NestJS usa ESM + Vitest por defecto)** + Supertest para e2e | `CLAUDE.md`, skill `luxeboreal-arquitectura` |
| P11 | ¿Repo git propio? | Sí, independiente; local por ahora, luego GitHub | `git init` hecho el 2026-09-22 |
| P15 | ¿Se guarda el texto de los mensajes en `evento_entrante.payload`? | No: payload **redactado** (ids, tipo, metadatos; sin texto). Al reprocesar, el contenido se relee de la API de Chatwoot. `lead.resumen` sin datos personales | `openspec/specs/privacidad/spec.md` (R14), `MODELO_DATOS.md` §5 y §7, ADR-0004 |
| P12 | Aviso de leads calientes: ¿Telegram, notificaciones de Chatwoot o ambos? | **Ambos** (2026-09-23): Chatwoot notifica al asignar; Telegram lleva el resumen del lead. Se revisa tras unas semanas de uso real y se retira Telegram si sobra | Fase 08; `openspec/specs/leads/spec.md` (R11) |
| P16 | ¿Se aceptan los ADR 0001, 0003, 0004, 0005 y 0007? | **Aceptados** (2026-09-23); el 0004 con el ajuste de P15 (evento redactado) | `docs/adr/` |
| — | ¿Tipo de llave primaria? | UUID (el usuario lo prefería); recomendación v7 nativo | ADR-0007 |
| P18 | ¿NestJS 11 o 12? | **NestJS 12** (2026-09-23), con verificación de compatibilidad de dependencias clave en la primera tarea de la Fase 00a y fallback a NestJS 11 si alguna falla | ADR-0001 (enmienda) |
| P19 | ¿Partir la Fase 00? | **Sí** (2026-09-23): 00a (esqueleto y verificación local) y 00b (CI y contrato de API); 00b depende de 00a | `docs/fases/README.md` |
| P17 | Techo de gasto mensual (R13): ¿qué hace el bot si, según `uso_llm`, el gasto del mes llega al techo? | **Techo de 10 USD/mes** (confirmado 2026-09-29), configurable con `LLM_TECHO_MENSUAL_USD`; aviso `warn` una vez por mes al 80 %; al 100 % el gateway no llama al LLM y devuelve `techo-alcanzado`, y el texto de derivación vive en `parametro.mensaje_techo_gasto` (ver P22). El límite de la consola de OpenRouter queda como segundo freno | `openspec/specs/llm/spec.md` (LLM7-LLM9), `src/modulos/llm/aplicacion/llm-gateway.ts` |
| P24 | ¿Se aceptan los ADR 0013 (circuit breaker en memoria) y 0014 (fallback iterado en el gateway)? | **Aceptados** (2026-09-29); el 0013 con una línea sobre cómo se resuelve la sonda del circuito (hallazgo C1 de `judgment-day`) | `docs/adr/` |
