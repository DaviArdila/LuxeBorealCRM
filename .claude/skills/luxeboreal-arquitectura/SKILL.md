---
name: luxeboreal-arquitectura
description: Convenciones de código de LuxeBorealCRM (NestJS monolito modular) — estructura de módulos, fronteras, puertos y adaptadores, DI en vez de flags MOCK_*, eventos de dominio y outbox, Prisma por módulo, reloj inyectable, pasarela de LLM, tests por nivel, nombres y checklist de cierre. Úsala siempre que vayas a crear o modificar código en src/, prisma/, test/, la configuración o Docker de este repo.
---

# LuxeBorealCRM — cómo se escribe el código

Documentos que mandan: `SPEC.md` (qué e índice de reglas R1-R16) → `openspec/specs/` (comportamiento
vigente por dominio) → el change activo en `openspec/changes/fase-NN-<nombre>/` (specs delta, diseño
y tareas de la fase en curso) → `docs/adr/`. Esta skill traduce los principios a reglas concretas. Si
una regla de aquí choca con un ADR aceptado, gana el ADR y se corrige esta skill.

> Estado: 0.2 — ajustada al cerrar la Fase 00b (CI y contrato de API) con lo que el pipeline real fijó.

## 1. Estructura

```
src/
├── main.ts                     bootstrap: pino, shutdown hooks, validación global
├── app.module.ts               solo importa módulos; sin lógica
├── plataforma/                 transversal técnico (no negocio)
│   ├── config/                 ConfigModule + esquema Zod por grupo; única lectura de process.env
│   ├── reloj/                  Clock (token CLOCK) + implementación de sistema
│   ├── observabilidad/         logger, trazas
│   ├── prisma/                 PrismaService (conexión y ciclo de vida)
│   ├── redis/                  cliente Redis inyectable
│   ├── salud/                  GET /health con @nestjs/terminus (indicadores postgres/redis, D4/D13)
│   ├── documentacion/          pipeline del contrato OpenAPI: construir/filtrar/ordenar/serializar
│   │                           el documento, respuestaDesdeZod, montarDocumentacion (Scalar en
│   │                           /docs, Fase 00b D1/D4/D7)
│   ├── errores/                catálogo de códigos RFC 9457 + filtro global problem+json
│   │                           (Fase 00b D5)
│   └── outbox/                 tabla outbox + publicador
├── compartido/                 funciones puras sin dependencias: dinero, texto, número
└── modulos/
    ├── catalogo/  horario/  canales/  conversaciones/  llm/  agente/
    ├── leads/  notificaciones/  contactos/  admin/
    └── usuarios/  inventario/  ventas/            (fases 11+)
```

Cada submódulo de `plataforma/` (`config/`, `reloj/`, `observabilidad/`, `prisma/`, `redis/`,
`salud/`) expone su API pública en un `index.ts` (barril): nadie importa rutas internas de otro
submódulo, solo lo que su `index.ts` exporta (regla de fronteras 6, `dependency-cruiser`,
`sin-rutas-internas-de-plataforma`, confirmada en la Fase 00a). El mismo patrón de barril aplica a
`modulos/<m>/index.ts` (regla 5) y a `compartido/<x>/index.ts`.

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
- **Herramienta elegida: `dependency-cruiser`** (`.dependency-cruiser.cjs`, decisión del usuario,
  fijada en la Fase 00a). Once reglas, todas `severity: 'error'`, cada una con un test de fixture
  que la viola (`test/fronteras/dependency-cruiser.spec.ts`); `npm run fronteras` cruza `src` y
  `scripts` (Fase 00b):

  | # | Regla | Qué prohíbe |
  |---|---|---|
  | 1 | `sin-ciclos` | cualquier ciclo de imports |
  | 2 | `compartido-puro` | `compartido/` importando cualquier otra cosa (ni `src/`, ni npm) |
  | 3 | `dominio-aislado` | `modulos/<m>/dominio/` importando fuera de sí mismo y `compartido/` |
  | 4 | `prisma-solo-en-infraestructura` | `@prisma/client`/cliente generado fuera de `plataforma/prisma` e `infraestructura/` de cada módulo |
  | 5 | `sin-rutas-internas-de-modulo` | importar una ruta interna de otro `modulos/<m>/` (solo su `index.ts`) |
  | 6 | `sin-rutas-internas-de-plataforma` | importar una ruta interna de otro submódulo de `plataforma/` (solo su `index.ts`) |
  | 7 | `plataforma-no-conoce-modulos` | `plataforma/` importando de `modulos/` |
  | 8 | `src-no-importa-test` | `src/` importando de `test/` |
  | 9 | `src-sin-dev-dependencies` | `src/` importando una `devDependency` |
  | 10 | `sin-irresolubles` | imports que no resuelven a ningún módulo real |
  | 11 | `scripts-solo-barriles-de-plataforma` | `scripts/` importando algo de `plataforma/` que no sea el `index.ts` público de un submódulo (Fase 00b D12) |

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
| Unitario (Vitest) | `dominio/` y `compartido/`, casos de uso con puertos falsos | junto al archivo, `*.spec.ts` | ninguna |
| Fronteras (Vitest) | scripts de la puerta de CI, reglas de `dependency-cruiser`, ESLint, commitlint | `test/fronteras/` | ninguna (algunos casos usan Docker real: gitleaks, oasdiff, actionlint — ADR-0009) |
| Contrato (Vitest) | pipeline OpenAPI ejercitado con el controlador *fixture* de `test/contrato/fixture/` (D3 de la Fase 00b): nunca se importa desde `src/`, la frontera 8 lo hace estructuralmente imposible | `test/contrato/` | ninguna |
| Integración (Vitest) | repositorios, máquina de estados, colas, controladores | `test/integracion/` | Postgres + Redis reales, base aislada por worker |
| E2E (Vitest + Supertest) | flujo completo por HTTP con canal y LLM falsos | `test/e2e/` | stack completo |
| Evals | conversaciones de referencia contra LLM simulado (siempre) o real (bajo demanda) | `test/evals/` | según modo |

Fronteras y Contrato corren dentro del proyecto `unit` de Vitest (`npm test`, sin infraestructura
propia); son filas separadas en esta tabla porque agrupan un tipo de comportamiento distinto
(puerta de CI y pipeline de contrato), no porque tengan su propio proyecto de Vitest.

- Cada escenario de las specs tiene al menos un test nombrado `<R#> — <título del escenario>`
  (ej. `R13 — Respuesta agrupada en el mínimo de mensajes`); así verify comprueba la cobertura por
  nombre.
- Los tests del prototipo se **reescriben** en el nivel correcto, no se copian.
- Reloj fijado con un `ClockFalso` inyectado; nada de `vi.useFakeTimers` sobre lógica de negocio.
- Vitest es el runner (ESM, decisión 2026-09-23; reemplaza Jest — `CLAUDE.md`, ADR-0001 enmienda);
  `@nestjs/testing` + `Test.createTestingModule` sigue aplicando igual.
- **Proyectos de Vitest** (`vitest.config.ts`, fijados en la Fase 00a): `unit` (`npm test`, junto al
  código y `test/fronteras/`, sin infraestructura), `integracion` (`npm run test:integracion`,
  `test/integracion/`) y `e2e` (`npm run test:e2e`, `test/e2e/`). Los proyectos `integracion` y `e2e`
  levantan Postgres 16 y Redis 7 reales con **Testcontainers** desde un `globalSetup`
  (`test/soporte/contenedores.global-setup.ts`, ADR-0009): un solo mecanismo de infraestructura de
  pruebas, idéntico en local y en CI (00b); Docker Compose queda solo para desarrollo manual
  (`npm run start:dev`).

## 8. Nombres e idioma

- Dominio en **español** (como el prototipo y el negocio): `Conversacion`, `transicionar`,
  `cotizarEnvio`. Sufijos técnicos de NestJS en inglés por convención del framework
  (`*.module.ts`, `*.controller.ts`, `*.service.ts` si se usa, `*.spec.ts`).
- Archivos en kebab-case (`maquina-estados.ts`); clases en PascalCase; booleanos como pregunta
  (`estaDentroDeHorario`).
- Claves de Redis con prefijo de módulo: `conv:<id>:buffer`, `catalogo:version`.
- Comentarios solo para el porqué no evidente, con referencia (`R7`, `ADR-0003`, `R7 — <escenario>`).

## 9. Seguridad y PII

- Firma validada sobre el body crudo antes de cualquier lógica (R3).
- Logs: `nestjs-pino` con `redact` para cuerpos de mensaje, números (solo últimos 4), cédula,
  correo, tokens. Nunca `console.log`.
- Secretos solo por variables de entorno; `.env.example` documenta cada variable.

## 10. API

Convenciones y decisión completas en `docs/adr/0008-contrato-api-openapi.md` y
`openspec/specs/api/spec.md`; aquí solo las reglas que tocan al escribir código.

- El esquema **zod** de cada endpoint es la **única fuente**: se pasa con la opción `schema` a
  `@Body()`/`@Query()`/`@Param()`/`@RawBody()` (`StandardSchemaValidationPipe`, soporte nativo de
  NestJS 12 — enmienda 2026-09-23 de ADR-0008; sin paquete de terceros como `nestjs-zod`), y
  `@nestjs/swagger` genera el fragmento OpenAPI desde ese mismo esquema. La respuesta se documenta
  con `respuestaDesdeZod(esquema, opciones)` (`plataforma/documentacion`, Fase 00b D4) — nunca con
  `@ApiProperty` a mano.
- Los DTO viven en `interfaz/` del módulo dueño, junto a los controllers que los usan.
- Nadie escribe ni edita `openapi/openapi.json` ni `openapi/openapi.interno.json` a mano; ambos se
  generan desde una sola construcción del documento (`npm run contrato:generar`, ADR-0010, Fase
  00b D1): el **interno** tiene todo, el **público** es la función pura `filtrarDocumentoPublico`
  que retira lo etiquetado `internal` (health check, webhooks, kill switch).
- Todo error de respuesta sigue RFC 9457 (`plataforma/errores`, `FiltroProblemJson`, ADR-0011): un
  código estable del catálogo `CATALOGO_CODIGOS`, nunca el `status` HTTP como código y nunca el
  valor recibido en el detalle de validación (Fase 00b D5).
- Si un commit agrega o cambia un endpoint, **el mismo commit** regenera y commitea los dos
  documentos (`npm run contrato:generar`) y `npm run verify`/`npm run ci` los verifica: deriva
  (`contrato:deriva`), lint (`contrato:lint`, Spectral) y cambios incompatibles contra `main`
  (`contrato:diff`, oasdiff, D11) — pipeline real desde la Fase 00b, ya no aspiracional.

## 11. Documentación

- Toda documentación humana (README, runbooks, guías, ADR) sigue la skill `cognitive-doc-design`:
  resumen primero, una idea por sección, tablas para comparar, ejemplos ejecutables.
- **TSDoc** solo en lo que cada módulo **exporta** (casos de uso y puertos en `<m>.module.ts`);
  nunca en `dominio/`, `infraestructura/` ni tipos internos.
- Runbooks de operación (qué hacer si algo falla en producción) van en `docs/operacion/`, desde la
  Fase 09.
- `CHANGELOG.md` se genera desde Conventional Commits con **git-cliff** (`npm run changelog`,
  `cliff.toml`, decidido 2026-09-23, configurado en la Fase 00b). Nunca se edita a mano: una
  edición manual se sobrescribe al volver a generar (CI8).

## 12. Checklist de cierre (no se reporta "listo" sin esto)

1. `npm run verify` en verde (lint, typecheck, fronteras, deriva del contrato, tests unitarios e
   integración — seis comprobaciones, PLT7).
2. `npm run test:e2e` si se tocó un flujo, Docker, esquema o `main.ts`.
3. Cada escenario de las specs delta del change (`openspec/changes/fase-NN-<nombre>/specs/`) tiene
   su test y pasa.
4. Si cambió el esquema: `MODELO_DATOS.md` actualizado + migración + semillas corren.
5. Si hubo decisión con alternativas: ADR escrito e indexado.
6. `docs/migracion/inventario.md` y `docs/fases/README.md` actualizados.
7. Sin `Date.now()`, sin `process.env` fuera de config, sin imports cruzados a rutas internas.
8. Un commit por unidad de trabajo (Conventional Commits, sin atribución de IA), en rama de fase,
   nunca en `main`; push, PR y merge los decide el usuario. Nunca `.env` ni secretos.
9. Si cambió un endpoint: `openapi/openapi.json` y `openapi/openapi.interno.json` regenerados y
   commiteados en el mismo commit (`npm run contrato:generar`), `contrato:lint` (Spectral) y
   `contrato:diff` (oasdiff contra `main`) en verde (§10).
