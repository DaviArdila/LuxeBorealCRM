---
name: luxeboreal-arquitectura
description: Convenciones de código de LuxeBorealCRM (NestJS monolito modular) — estructura de módulos, fronteras, puertos y adaptadores, DI en vez de flags MOCK_*, eventos de dominio y outbox, Prisma por módulo, reloj inyectable, pasarela de LLM, tests por nivel, nombres y checklist de cierre. Úsala siempre que vayas a crear o modificar código en src/, prisma/, test/, la configuración o Docker de este repo.
---

# LuxeBorealCRM — cómo se escribe el código

Documentos que mandan: `SPEC.md` (qué y reglas R1-R16) → spec de la fase en curso → `docs/adr/`.
Esta skill traduce los principios a reglas concretas. Si una regla de aquí choca con un ADR
aceptado, gana el ADR y se corrige esta skill.

> Estado: borrador 0.1 — se ajusta al cerrar la Fase 00 con lo que el scaffold real haya fijado.

## 1. Estructura

```
src/
├── main.ts                     bootstrap: pino, shutdown hooks, validación global
├── app.module.ts               solo importa módulos; sin lógica
├── plataforma/                 transversal técnico (no negocio)
│   ├── config/                 ConfigModule + esquema Zod por grupo; única lectura de process.env
│   ├── reloj/                  Clock (token CLOCK) + implementación de sistema
│   ├── prisma/                 PrismaService (conexión y ciclo de vida)
│   ├── redis/                  cliente Redis inyectable
│   ├── outbox/                 tabla outbox + publicador
│   └── observabilidad/         logger, trazas
├── compartido/                 funciones puras sin dependencias: dinero, texto, número
└── modulos/
    ├── catalogo/  horario/  canales/  conversaciones/  llm/  agente/
    ├── leads/  notificaciones/  contactos/  admin/
    └── usuarios/  inventario/  ventas/            (fases 11+)
```

Dentro de un módulo (solo las carpetas que hagan falta):

```
modulos/<m>/
├── dominio/          entidades, reglas puras, eventos, errores. PROHIBIDO importar @nestjs, @prisma, redis, http
├── aplicacion/       casos de uso @Injectable: orquestan dominio + puertos
├── puertos/          interfaces + tokens (export const LLM_PORT = Symbol('LLM_PORT'))
├── infraestructura/  adaptadores: repositorios Prisma, clientes HTTP, processors BullMQ
├── interfaz/         controllers, DTOs
└── <m>.module.ts     exports = la API pública del módulo (casos de uso y tokens), nada más
```

## 2. Fronteras (se verifican en `npm run verify`)

- Un módulo importa de otro **solo** lo que este exporta en su `index.ts`/módulo; nunca rutas
  internas (`../otro/infraestructura/...`).
- `dominio/` no importa nada fuera de sí mismo y `compartido/`.
- Solo `infraestructura/` de cada módulo y `plataforma/prisma` importan `@prisma/client`. Los tipos
  de Prisma no salen de `infraestructura/`: el repositorio devuelve tipos de dominio.
- Sin ciclos entre módulos. Si A necesita reaccionar a algo de B y B a algo de A, uno de los dos
  sentidos es un **evento**.
- Herramienta: `dependency-cruiser` (o `eslint-plugin-boundaries`) con las reglas anteriores.

## 3. Inyección de dependencias

- Todo lo que toca el mundo exterior (canal, LLM, Telegram, Meta, almacenamiento, reloj) es un
  **puerto** con token y se inyecta: `constructor(@Inject(LLM_PORT) private readonly llm: LlmPort)`.
- **Prohibido** elegir implementaciones con `if (env.MOCK_X)` en código de producción. Los fakes
  viven en `test/fakes/` o en un `DesarrolloModule` que solo se registra fuera de producción.
- Nada abre conexiones ni lee `process.env` al importarse. Recursos con `OnModuleInit` /
  `OnApplicationShutdown`.
- Tiempo: `this.clock.ahora()`. `Date.now()` y `new Date()` sin argumentos están prohibidos fuera de
  `plataforma/reloj` (regla de lint).

## 4. Comunicación entre módulos

- **Consulta** (necesito una respuesta): llamada a un caso de uso exportado.
- **Hecho** (esto pasó): evento de dominio en pasado (`ConversacionCedidaAHumano`,
  `LeadConfirmado`) emitido con `EventEmitter2`.
- **Efecto externo que no se puede perder** (Telegram, status en Chatwoot): se escribe en `outbox`
  **en la misma transacción** que el cambio de estado; lo publica un job con reintentos.

## 5. Datos

- El diseño de datos se decide en `MODELO_DATOS.md` antes de tocar `prisma/schema.prisma`.
  El esquema es lógica de negocio del usuario: proponer, no imponer.
- Modelos Prisma en camelCase, tablas/columnas `@@map`/`@map` en snake_case; enums nativos.
- Llaves primarias `uuid` v7 nativo (ADR-0007); excepciones: códigos DANE y `parametro.clave`.
  Nunca el teléfono ni otro dato del cliente como PK.
- Un solo negocio (ADR-0006): sin `cuenta_id`, pero nada específico del negocio en el código.
- Nunca se persiste el contenido de los mensajes; la referencia es `chatwoot_conversation_id`.
- Antes de crear una tabla o módulo, comprobar en `docs/analisis/04-chatwoot-delegar-vs-construir.md`
  que Chatwoot no lo resuelve ya.
- Dinero en `Int` de pesos. Nunca `Float` ni cálculos de dinero en el LLM.
- Un repositorio por agregado, en la `infraestructura/` del módulo dueño; métodos con nombre de
  negocio (`listarControlVencido`), no de Prisma.
- Migraciones: `prisma migrate dev --name <que-cambia>`; nunca se edita una migración aplicada.
- Transacciones: el caso de uso las abre (servicio de transacción inyectable); los repositorios
  reciben el cliente transaccional.

## 6. LLM

- El agente solo conoce `LlmPort` (tipos propios). El SDK del proveedor solo aparece en
  `modulos/llm/infraestructura`.
- Modelos, cadenas de fallback, timeouts y `max_tokens` son configuración por **perfil de uso**
  (`conversacion`, `evals`), no constantes.
- Resiliencia (timeout, reintento, fallback, circuit breaker) y registro de uso/costo solo en el
  gateway. Un adaptador nunca reintenta por su cuenta.
- Prompts como archivos versionados en `modulos/agente/prompts/`; prefijo estable (reglas + tools
  + catálogo) antes que lo variable, para la caché de prompts.
- Herramientas: esquema Zod + JSON Schema; devuelven `{ paraElModelo, efectos }`. El bucle no
  conoce nombres de herramientas.
- El agente no pregunta por el canal: lee el **perfil de capacidades** que calcula el borde
  (`docs/analisis/05-multicanal.md`).

## 7. Tests

| Nivel | Qué | Dónde | Infra |
|---|---|---|---|
| Unitario (Jest) | `dominio/` y `compartido/`, casos de uso con puertos falsos | junto al archivo, `*.spec.ts` | ninguna |
| Integración (Jest) | repositorios, máquina de estados, colas, controladores | `test/integracion/` | Postgres + Redis reales, base aislada por worker |
| E2E (Jest + Supertest) | flujo completo por HTTP con canal y LLM falsos | `test/e2e/` | stack completo |
| Evals | conversaciones de referencia contra LLM simulado (siempre) o real (bajo demanda) | `test/evals/` | según modo |

- Cada criterio de aceptación de la spec de fase tiene al menos un test que lo nombra (`CA-3: …`).
- Los tests del prototipo se **reescriben** en el nivel correcto, no se copian.
- Reloj fijado con un `ClockFalso` inyectado; nada de `jest.useFakeTimers` sobre lógica de negocio.
- Jest es el runner estándar de NestJS (`@nestjs/testing` + `Test.createTestingModule`).

## 8. Nombres e idioma

- Dominio en **español** (como el prototipo y el negocio): `Conversacion`, `transicionar`,
  `cotizarEnvio`. Sufijos técnicos de NestJS en inglés por convención del framework
  (`*.module.ts`, `*.controller.ts`, `*.service.ts` si se usa, `*.spec.ts`).
- Archivos en kebab-case (`maquina-estados.ts`); clases en PascalCase; booleanos como pregunta
  (`estaDentroDeHorario`).
- Claves de Redis con prefijo de módulo: `conv:<id>:buffer`, `catalogo:version`.
- Comentarios solo para el porqué no evidente, con referencia (`R7`, `ADR-0003`, `FASE-05 CA-2`).

## 9. Seguridad y PII

- Firma validada sobre el body crudo antes de cualquier lógica (R3).
- Logs: `nestjs-pino` con `redact` para cuerpos de mensaje, números (solo últimos 4), cédula,
  correo, tokens. Nunca `console.log`.
- Secretos solo por variables de entorno; `.env.example` documenta cada variable.

## 10. Checklist de cierre (no se reporta "listo" sin esto)

1. `npm run verify` en verde (lint, typecheck, fronteras, tests unitarios e integración).
2. `npm run test:e2e` si se tocó un flujo, Docker, esquema o `main.ts`.
3. Cada CA de la spec de la fase tiene su test y pasa.
4. Si cambió el esquema: `MODELO_DATOS.md` actualizado + migración + semillas corren.
5. Si hubo decisión con alternativas: ADR escrito e indexado.
6. `docs/migracion/inventario.md` y `docs/fases/README.md` actualizados.
7. Sin `Date.now()`, sin `process.env` fuera de config, sin imports cruzados a rutas internas.
8. Un commit por unidad de trabajo (Conventional Commits, sin atribución de IA), en rama de fase,
   nunca en `main`; push, PR y merge los decide el usuario. Nunca `.env` ni secretos.
