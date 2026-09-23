# 02 · Investigación: cómo se suele construir esto y qué conviene adoptar

- Fecha: 2026-09-22 · Estado: primera versión, para discutir
- Pregunta: ¿cómo se construye hoy un sistema de atención al cliente automatizado con LLM + traspaso
  a humano + CRM, y cómo lo contrastamos con lo que hay en ChatLuxeCRM?

> Las versiones de librerías citadas se **verifican en la Fase 00** antes de fijarlas en
> `package.json`; aquí se decide el enfoque, no el número exacto.

---

## 1. La arquitectura de referencia de la industria

Plataformas como Intercom Fin, Zendesk AI Agents, Ada o Botpress, y los equipos que construyen la
suya, convergen en las mismas piezas. Contraste con el prototipo:

| Pieza | Qué hace | ChatLuxeCRM hoy | LuxeBorealCRM |
|---|---|---|---|
| **Adaptadores de canal** | Traducen cada canal (WhatsApp, IG, web) a un mensaje normalizado | Solo Chatwoot, y su formato llega hasta el motor (A9) | Módulo `canales` con un adaptador por canal; el dominio no conoce ninguno |
| **Bandeja omnicanal** | Donde trabajan los humanos | Chatwoot (bien elegido) | Se conserva Chatwoot detrás de un puerto |
| **Inbox de eventos** | Recibir, persistir, confirmar, procesar después | Procesa dentro del request (A8) | Tabla/cola de eventos entrantes + procesador idempotente |
| **Gestor de conversación** | Estado de la sesión, quién atiende, ventanas de tiempo | Máquina de estados en Redis (B4, A6) | FSM en Postgres + eventos de dominio |
| **Orquestador de turno / agente** | Políticas previas + bucle LLM ⇄ herramientas | `motor.ts` monolítico (A5) | Pipeline de políticas + agente con registro de tools |
| **Pasarela de LLM** | Abstrae proveedores, reintentos, fallback, costo | Interfaz propia + 2 clientes a mano (A7) | Puerto propio + AI SDK (§3) |
| **Herramientas / acciones** | Acceso controlado a datos y efectos | 6 tools, bien acotadas (B2) | Mismas 6, con efectos tipados (A4) |
| **Conocimiento (RAG)** | FAQ, políticas, manuales | No existe; el catálogo va entero al prompt | No hace falta con 20-50 productos. Se reevalúa si el catálogo pasa de ~200 o si hay FAQ largas |
| **Guardas (guardrails)** | Reglas duras que el modelo no puede saltarse | Dinero formateado, escala determinista (B1, B3) | Se conservan y se formalizan como tests |
| **Traspaso a humano** | Protocolo de escalamiento con vencimiento | ADR-008, bien resuelto | Se conserva |
| **Observabilidad del agente** | Trazas de cada turno: prompt, tools, tokens, costo, latencia | Logs sueltos | OpenTelemetry + trazas de LLM (§4) |
| **Evaluaciones (evals)** | Conversaciones de referencia que se corren al cambiar prompt/modelo | No existen | Set de evals desde la fase del agente (§5) |
| **CRM / back office** | Contactos, leads, ventas, inventario | Tablas creadas, sin lógica | Módulos NestJS + API para el cliente futuro |

**Conclusión:** el prototipo ya tiene las piezas que más cuestan de pensar (guardas, traspaso,
idempotencia). Lo que le falta es lo que se nota al crecer: aislamiento de canal, inbox de eventos,
pasarela de LLM seria, observabilidad y evals.

---

## 2. NestJS como base del monolito modular

Por qué encaja con lo que se pide:

- **Módulos** como unidad de frontera (lo que hoy son carpetas sin control) con `exports` explícitos:
  un módulo solo ve lo que el otro exporta.
- **Inyección de dependencias** nativa: resuelve A1, A2 y A11 sin inventar nada.
- **Integraciones oficiales** para lo que el prototipo ya usa: `@nestjs/bullmq` (colas y
  procesadores con decoradores), `@nestjs/config`, `@nestjs/schedule` (jobs repetibles),
  `@nestjs/event-emitter` (eventos de dominio en proceso), `@nestjs/terminus` (health),
  `@nestjs/throttler` (rate limit HTTP), `nestjs-pino` (logs).
- **Ciclo de vida**: `enableShutdownHooks()` resuelve A10.
- **Testing**: `Test.createTestingModule().overrideProvider()` reemplaza los `MOCK_*`.
- **API para el cliente futuro**: controladores + OpenAPI (`@nestjs/swagger`) generan el contrato
  que consumirá el back office (Next.js u otro).

Versión: NestJS 11 es la línea estable en 2026 (v12 anunciada con ESM completo). Prisma: la línea 6
es la más probada con NestJS; la 7 cambia la generación del cliente y tiene soporte en camino en las
librerías de integración. **Decisión en Fase 00**: Prisma 6 con `PrismaService` propio (sin librería
intermedia) salvo que la 7 ya esté estable con NestJS al arrancar.

### Estructura interna de cada módulo (hexagonal pragmática)

```
src/modulos/<modulo>/
├── dominio/          entidades, reglas puras, eventos. Sin Nest, sin Prisma, sin red. Tests unitarios.
├── aplicacion/       casos de uso (servicios @Injectable) que orquestan dominio + puertos
├── puertos/          interfaces + tokens de inyección de lo que el módulo necesita de afuera
├── infraestructura/  adaptadores: repositorios Prisma, clientes HTTP, procesadores BullMQ
├── interfaz/         controladores HTTP, DTOs de entrada/salida
└── <modulo>.module.ts
```

No todos los módulos necesitan las cinco carpetas: un módulo pequeño (p. ej. `horario`) puede ser un
servicio y su test. La regla que **sí** es obligatoria: `dominio/` no importa nada de afuera.

### Comunicación entre módulos

1. **Llamada directa** a un servicio exportado cuando se necesita respuesta (consulta).
2. **Evento de dominio** cuando es "esto pasó, a quien le interese" (transiciones de conversación,
   lead confirmado). En proceso con `EventEmitter2`; si el efecto debe sobrevivir una caída
   (notificar a Telegram, espejar status en Chatwoot), se escribe en una **outbox** y lo publica un
   job. Esto generaliza el mecanismo ad hoc de hoy (`lead.notificado_en = null` + job de reintento).

### Opciones consideradas y descartadas

| Alternativa | Por qué no ahora |
|---|---|
| Microservicios | Dos personas, un VPS de 8 GB, techo de $20/mes. El monolito modular deja la puerta abierta: un módulo bien aislado se extrae después |
| Mantener Express y ordenar | Se puede, pero es reconstruir a mano lo que NestJS trae (DI, módulos, ciclo de vida, testing) |
| Frameworks de agentes pesados (LangChain/LangGraph, Mastra) | El bucle de tools es de 160 líneas y está entendido; un framework agrega abstracciones que no se necesitan con 6 tools. Se reevalúa si aparecen flujos multi-agente |

---

## 3. Pasarela de LLM: cambiar de proveedor sin tocar el agente

### El problema en el prototipo

`LlmClient` es la idea correcta (B7), pero cada proveedor es un cliente escrito a mano con su propio
mapeo de mensajes, su propio reintento y sus variables de entorno. Agregar Anthropic, OpenAI u
OpenRouter es otro archivo de 150-180 líneas con los mismos riesgos (A7).

### Opciones evaluadas

| Opción | Qué es | Ventajas | Desventajas |
|---|---|---|---|
| **A. Clientes a mano por proveedor** (hoy) | SDK o `fetch` por proveedor | Control total | Duplicación, cada proveedor nuevo es trabajo y bugs nuevos |
| **B. AI SDK de Vercel (`ai`)** | Librería TypeScript con una API única (`generateText`, tools, streaming) y paquetes por proveedor (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/xai`, `@ai-sdk/openai`, `@openrouter/ai-sdk-provider`, …) | Mapeo de mensajes y tool calling ya resuelto y mantenido; cambiar de proveedor = cambiar un string de configuración; soporta opciones específicas (p. ej. `cacheControl` de Anthropic) sin romper la abstracción; no requiere desplegar nada | Dependencia de terceros en la ruta crítica; hay que fijar versión |
| **C. OpenRouter** | Servicio que expone cientos de modelos detrás de una API compatible con OpenAI, con fallback entre modelos y enrutamiento por proveedor | Una sola key y una sola factura; fallback del lado del servidor; probar modelos nuevos sin cuentas nuevas | Intermediario (latencia, comisión sobre el precio, un punto más de falla, los datos pasan por un tercero); algunas funciones propias del proveedor (caché de prompts) se exponen de forma parcial |
| **D. Proxy propio (LiteLLM)** | Servidor que unifica proveedores, con presupuestos y fallback | Presupuestos y claves virtuales centralizadas | Otro servicio que desplegar y operar en un VPS ya justo de RAM |

### Recomendación

**B como base, C como un proveedor más, y el puerto propio encima.** En capas:

```
agente (dominio)  ──usa──▶  LlmPort  (interfaz propia: generar(mensajes, tools, opciones) → respuesta)
                               │
                               ▼
                    LlmGateway (aplicación) — timeout, reintentos, fallback en cadena,
                               │               circuit breaker, registro de uso/costo, trazas
                               ▼
                    AiSdkAdapter (infraestructura) — traduce a `generateText` del AI SDK
                               │
              ┌────────────────┼──────────────────┬──────────────────┐
              ▼                ▼                  ▼                  ▼
          anthropic         google              xai            openrouter (cualquier modelo)
```

- El **dominio** sigue viendo solo `LlmPort` con tipos propios (lo que ya hace el prototipo). Si
  mañana el AI SDK deja de convenir, se cambia un adaptador, no el agente.
- La **configuración** de modelos deja de ser variables sueltas por proveedor y pasa a ser un perfil
  validado por perfil de uso:

  ```yaml
  # config/llm.yaml (o equivalente en variables de entorno)
  perfiles:
    conversacion:
      cadena:                               # se prueba en orden; el siguiente solo si el anterior falla
        - modelo: anthropic:claude-haiku-4-5
        - modelo: openrouter:google/gemini-flash   # nombre ilustrativo
      timeout_ms: 15000
      max_tokens: 400
      reintentos: 2
  ```

- La **resiliencia se escribe una vez** en `LlmGateway`: timeout por intento, reintento con backoff
  para 429/5xx/timeout, paso al siguiente modelo de la cadena, y circuit breaker por proveedor para
  no insistir contra uno caído. Nunca se convierten argumentos inválidos en `{}` en silencio: se
  devuelven como error de tool al modelo (regla ya existente, SPEC §3.6).
- Cada llamada registra `proveedor, modelo, tokens entrada/salida/caché, latencia, costo estimado`
  por turno y por conversación → permite hacer cumplir el techo de gasto en código, no solo en la
  consola del proveedor.
- **Caché de prompts**: el system prompt y las definiciones de tools se arman para ser un prefijo
  estable (primero lo fijo, al final lo variable). Con Anthropic se marca `cacheControl`; con
  proveedores de caché automática (OpenAI, xAI, Gemini) basta con el prefijo estable.

**Cuándo usar OpenRouter:** para experimentar con modelos y como eslabón de respaldo de la cadena.
Para el modelo principal en producción, conviene la API directa del proveedor elegido (menos
latencia y caché de prompts completa), con OpenRouter como red de seguridad.

---

## 4. Observabilidad del agente

- `nestjs-pino` con redacción de PII (número enmascarado, sin contenido de mensajes): se conserva la
  regla B11.
- OpenTelemetry para trazas HTTP → cola → turno → LLM → tools → envío. El AI SDK emite spans de
  telemetría propios.
- Trazas de LLM consultables (prompts y respuestas) solo en un backend autoalojado o con redacción:
  Langfuse autoalojado es la opción habitual. Decisión abierta por costo de RAM en el VPS; mínimo
  viable = tabla `uso_llm` + logs estructurados.

## 5. Evaluaciones del agente

- Un conjunto de **conversaciones de referencia** en archivos (entrada del cliente, catálogo de
  prueba, qué tools deben llamarse, qué no debe decir: precios inventados, derivar sin señal fuerte).
- Dos niveles: (1) contra un LLM simulado, en cada `npm test` — verifica la orquestación;
  (2) contra modelos reales, bajo demanda (`npm run evals -- --perfil conversacion`) — compara
  proveedores y prompts antes de cambiarlos. Es lo que hace seguro cambiar de proveedor.
- Los prompts se versionan como archivos (`prompts/conversacion.v3.md`) y el turno registra qué
  versión usó.

## 6. Estrategia de migración: *strangler fig*

1. El servicio nuevo crece al lado del viejo, fase a fase, cada fase con su verificación.
2. Hasta el corte, el prototipo sigue atendiendo WhatsApp; el nuevo se prueba con el inbox API de
   prueba de Chatwoot y un segundo Agent Bot.
3. Corte: se apunta el Agent Bot del inbox real a la URL nueva. Reversa: volver a la URL vieja.
4. Datos: el catálogo y los parámetros se cargan con el importador; contactos y leads de prueba no
   se migran salvo que se decida lo contrario (pregunta abierta).

---

## Fuentes

- [AI SDK — documentación](https://vercel.com/docs/ai-sdk)
- [OpenRouter provider para el AI SDK](https://github.com/OpenRouterTeam/ai-sdk-provider)
- [AI Gateway: fallbacks de modelos](https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks)
- [Vercel AI Gateway vs OpenRouter (2026)](https://vercel.com/i/vercel-ai-gateway-vs-openrouter)
- [Prisma con NestJS — guía oficial](https://www.prisma.io/docs/guides/frameworks/nestjs)
- [nestjs-prisma — notas de versión (compatibilidad con Prisma 7)](https://github.com/notiz-dev/nestjs-prisma/releases)
- Práctica de traspaso a humano (Meta Handover Protocol, Intercom, Zendesk, Ada): ya documentada
  en `ChatLuxeCRM/docs/adr/0008-retorno-automatico-al-bot.md`.
