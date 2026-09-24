# Proposal: Fase 00a — Esqueleto y verificación local

- Change: `fase-00a-esqueleto` · Fase de la hoja de ruta: **00a** (`docs/fases/README.md`)
- Rama: `fase-00a-esqueleto` · Fecha: 2026-09-23 · Estado: `spec en revisión`
- Insumo principal: `openspec/changes/fase-00a-esqueleto/exploration.md` (cubre 00a y 00b)

## Intent

El repositorio está en planeación pura: no hay `package.json`, ni `src/`, ni runner de tests. Ninguna
fase posterior puede empezar (regla 3 de `docs/fases/README.md`: solo se depende de fases cerradas) y
la convención de TDD estricto (`openspec/config.yaml` §apply.tdd) no se puede cumplir sin un runner
real.

La Fase 00a deja un esqueleto NestJS 12 que ya cumple, desde la primera línea, las reglas que el
prototipo rompía: configuración validada una sola vez e inyectada (A1, A2), tiempo leído de un
`Clock` inyectado (B8, A11, regla 6 de `CLAUDE.md`), logs sin datos personales (R14, B11), fronteras
verificadas por herramienta (A3, ADR-0001) y apagado ordenado (A10).

Éxito = `npm run verify` en verde en local (lint, typecheck, fronteras, tests), `npm test` corriendo
con Vitest y `GET /health` respondiendo con Postgres y Redis arriba (fila 00a de
`docs/fases/README.md`).

## Decisiones ya tomadas por el usuario (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Versión de NestJS | **12**, con una primera tarea que verifica la compatibilidad de las dependencias clave; si alguna falla, se retrocede a 11 y el motivo se registra en este change | P18, ADR-0001 (enmienda 2026-09-23) |
| Runner de tests | **Vitest + ESM** | P10, `CLAUDE.md`, skill `luxeboreal-arquitectura` §7 |
| Partición de la Fase 00 | 00a (este change) y 00b (CI y contrato de API) | P19, `docs/fases/README.md` |
| Health de Postgres | `schema.prisma` mínimo (solo `datasource` + `generator`, sin modelos) y `SELECT 1` | fila 00a de `docs/fases/README.md` |
| Herramienta de fronteras | `dependency-cruiser` | fila 00a de `docs/fases/README.md` |
| Lint | ESLint con configuración plana (flat config) | decisión del usuario para 00a |

## Scope

### In Scope

1. **Verificación de compatibilidad (primera tarea)**: comprobar contra NestJS 12 las dependencias
   clave `nestjs-zod`, `nestjs-pino`, `@nestjs/terminus`, `@nestjs/bullmq`, `@nestjs/swagger` y
   `@scalar/nestjs-api-reference` (rangos de `peerDependencies` y una instalación real). El resultado
   MUST quedar registrado en este change (`design.md` o `tasks.md`) con versiones exactas. Si alguna
   falla, se aplica el fallback a NestJS 11 (ADR-0001, enmienda) y se registra el motivo. Las que solo
   se usan en 00b (`nestjs-zod`, `@nestjs/swagger`, Scalar) o después (`@nestjs/bullmq`) se verifican
   pero **no** se integran aquí.
2. **Esqueleto NestJS 12** en ESM con TypeScript estricto: `src/main.ts`, `src/app.module.ts` sin
   lógica, estructura `plataforma/` y `compartido/` de la skill `luxeboreal-arquitectura` §1.
3. **Runner de tests Vitest (ESM)**: `npm test` (unitarios), pruebas de integración contra Postgres y
   Redis reales (sin mocks de infraestructura, A12) y `npm run test:e2e` con Supertest para el
   arranque completo (checklist §12.2: 00a toca `main.ts` y Docker). Una vez instalado el runner en
   las primeras tareas, toda tarea MUST seguir RED → GREEN → REFACTOR observado.
4. **`plataforma/config`**: `ConfigModule` con esquema Zod; única lectura de `process.env` del
   sistema; la aplicación MUST NOT arrancar con configuración inválida o incompleta y MUST informar
   qué variable falla sin imprimir su valor. `.env.example` documenta cada variable (skill §9). Sin
   variables `MOCK_*` (A2, ADR-0001).
5. **`plataforma/reloj`**: puerto `Clock` con token `CLOCK`, implementación de sistema (único lugar
   donde se permite leer la hora del sistema) y `ClockFalso` para tests en `test/fakes/`.
6. **Logger `nestjs-pino` con redacción (R14)**: logs JSON; redacción de contenido de mensajes,
   teléfonos (solo últimos 4 dígitos), cédula, correo y tokens/secretos; `console.log` prohibido
   (skill §9).
7. **`compartido/`**: `dinero`, `texto` y `numero` portados del prototipo como funciones puras, con
   sus tests **reescritos** como unitarios (ver tabla de migración).
8. **Fronteras con `dependency-cruiser`**: reglas de la skill §2 que ya aplican a 00a (`compartido/`
   no importa nada de la aplicación; sin ciclos; `@prisma/client` solo en `plataforma/prisma` e
   `infraestructura/`; sin imports a rutas internas de otro módulo), preparadas para los módulos
   futuros.
9. **ESLint (flat config)** con las reglas de la skill §3: `Date.now()` y `new Date()` sin argumentos
   prohibidos fuera de `plataforma/reloj`; `process.env` prohibido fuera de `plataforma/config`;
   `console.*` prohibido.
10. **Health con `@nestjs/terminus`**: `GET /health` comprueba Postgres (vía `PrismaClient` generado
    desde el `schema.prisma` mínimo, `SELECT 1`) y Redis (`PING`); responde error cuando alguno cae.
    Ver pregunta abierta Q1 sobre la ruta.
11. **Docker Compose de desarrollo**: Postgres 16 y Redis 7 con `healthcheck`, puertos configurables.
12. **Apagado ordenado (A10)**: `enableShutdownHooks()` y cierre de conexiones Postgres/Redis en
    `OnApplicationShutdown`; ningún recurso se abre al importar un archivo (A1).
13. **`npm run verify`**: lint + typecheck + fronteras + tests unitarios e integración, en verde en
    local y en < 3 min (`SPEC.md` §5).
14. **Documentación de cierre**: sección "Comandos" de `CLAUDE.md`; en `openspec/config.yaml` se
    confirman `test_command` y `build_command` (quitando "PLANEADO"), **sin** tocar `strict_tdd`;
    ajuste de la skill `luxeboreal-arquitectura` a lo que el scaffold fije (§2 herramienta, §7 niveles
    de test).

### Out of Scope

| Qué | Fase | Motivo |
|---|---|---|
| Hook pre-push local (lint, typecheck, tests, commitlint, gitleaks) | 00b | P19 |
| Workflow de GitHub Actions | 00b | P19 |
| Pipeline OpenAPI: soporte nativo de Standard Schema de NestJS 12 (`StandardSchemaValidationPipe` + `@nestjs/swagger`) + Scalar en `/docs` + Spectral + oasdiff + drift de `openapi/openapi.json` (API1, API9, API10) | 00b | ADR-0008 (enmienda 2026-09-23, descarta `nestjs-zod`); `GET /health` entra al contrato en 00b |
| Errores RFC 9457 y convenciones JSON (API3, API4) | 00b | `openspec/specs/api/spec.md` |
| CHANGELOG con `git-cliff` | 00b | skill `luxeboreal-arquitectura` §11 |
| Pasar `strict_tdd` a `true` en `openspec/config.yaml` | 00b | criterio de salida de 00b |
| Testcontainers en CI | 00b | fila 00b |
| `PrismaService` con modelos, esquema `MODELO_DATOS.md` v1, migraciones, semilla DANE, base aislada por worker para repositorios | 01 | fila 01; el esquema es lógica de negocio del usuario |
| Uso real de Redis (colas BullMQ, debounce, locks, dedupe) | 05+ | no existen antes de Conversaciones |
| Chatwoot local (`scripts/chatwoot-*.sh`, `infra/chatwoot/`) | 04 | 00a no tiene canal; ver nota N1 |
| Imagen Docker de producción, Caddy/Traefik, Dokploy, Sentry, rotación de logs | 09 | fila 09 |
| Parámetros de negocio editables (R15) | 01, 02 | `openspec/specs/configuracion-negocio/spec.md`; 00a solo tiene configuración técnica |

## Qué se migra del prototipo

| Prototipo (`../ChatLuxeCRM`) | Decisión | Destino | Motivo |
|---|---|---|---|
| `src/config/env.ts` | Rediseñar | `src/plataforma/config` (ConfigModule + Zod) | A1: valida y lanza al importarse; A2: variables `MOCK_*` como mecanismo de inyección |
| `src/lib/logger.ts` | Rediseñar | `nestjs-pino` con `redact` | R14, B11: el prototipo depende de que cada llamada use `enmascarar` a mano |
| `src/lib/tiempo.ts` | Conservar la idea, rediseñar la forma | `src/plataforma/reloj` (`Clock` por DI, token `CLOCK`) | B8 acierto; A1 reloj global mutable (`establecerReloj`); A11 `Date.now()` fuera del reloj |
| `tests/helpers/reloj.ts` (`fijarReloj`) | Rediseñar | `test/fakes/` `ClockFalso` inyectado | Sustituye el reloj global por un proveedor sobrescribible (`overrideProvider`, ADR-0001) |
| `src/lib/dinero.ts` | Conservar | `src/compartido/dinero` | B1: funciones puras de formato; base de R2 |
| `src/lib/texto.ts` | Conservar | `src/compartido/texto` | Funciones puras de normalización |
| `src/lib/numero.ts` (`enmascarar`, `normalizarNumero`) | Conservar | `src/compartido/numero` | B11: base de la redacción de teléfonos (R14) |
| `src/health/router.ts` (`{status:"ok"}` fijo) | Rediseñar | `@nestjs/terminus` con Postgres + Redis | No comprueba nada hoy |
| `docker-compose.yml` | Rediseñar (parcial) | Compose de desarrollo: Postgres 16 + Redis 7 con `healthcheck` | Caddy e imagen de producción son Fase 09 |
| `.env.example` con `MOCK_*` | Descartar el patrón | Variables validadas por Zod, sin `MOCK_*` | A2, ADR-0001 |
| `package.json` (Express, scripts) | Descartar | `package.json` nuevo | Stack distinto (ADR-0001) |
| Sin apagado ordenado | Rediseñar | `enableShutdownHooks()` + `OnApplicationShutdown` | A10 |
| `scripts/chatwoot-*.sh`, `infra/chatwoot/` | Posponer | Fase 04 | 00a no integra canales (nota N1) |

### Tests del prototipo que esta fase reemplaza

| Test del prototipo | Qué pasa en 00a |
|---|---|
| `tests/lib/texto.test.ts` | Se reescribe como unitario de `compartido/texto` |
| `tests/tools/formateoDinero.test.ts` (solo la parte de formato puro) | Los casos de `formatearCop`, `formatearRangoCop`, `formatearDias`, `formatearRecargoContraentrega` se reescriben como unitarios de `compartido/dinero`, sin base de datos. La parte que prueba las tools (`obtener_ficha`, `cotizar_envio`) contra la base queda para las fases 02 y 07 |
| (sin test en el prototipo) `lib/numero.ts` | Tests nuevos de `enmascarar` y `normalizarNumero`; la redacción de R14 depende de ellos |
| `tests/helpers/reloj.ts` | Reemplazado por `ClockFalso` |

## Capabilities

### New Capabilities

- `plataforma`: comportamiento técnico transversal observable desde fuera de los módulos —
  configuración validada al arrancar (falla temprano, sin `MOCK_*`), `Clock` inyectable y sustituible
  en tests, health de Postgres y Redis, apagado ordenado y verificación local (`npm run verify`,
  fronteras y reglas de lint). Ids de requisito sugeridos: `PLAT1…PLATn`.
- `compartido`: funciones puras de formato de dinero (enteros de pesos → texto), normalización de
  texto y de lugares, y enmascarado/normalización de números de teléfono. Ids sugeridos:
  `COMP1…COMPn`.

### Modified Capabilities

- Ninguna a nivel de requisito. El escenario "Redacción en logs" de `privacidad` (R14) se
  **implementa** en esta fase sin cambiar el requisito; su test MUST llamarse
  `R14 — Redacción en logs` (`openspec/config.yaml` §specs). `api` no cambia en 00a (sus requisitos
  empiezan en 00b).

## Approach

1. **Tarea 1 primero**: verificación de compatibilidad con NestJS 12 y registro del resultado. Si
   falla, fallback a 11 antes de escribir más código (ADR-0001, enmienda).
2. **Scaffold + runner**: generar el proyecto (ESM + Vitest, el default de `nest new`) y dejar
   `npm test` corriendo; desde ahí, cada tarea en RED → GREEN → REFACTOR observado.
3. **Plataforma de adentro hacia afuera**: config → reloj → logger → `compartido/` (todo unitario, sin
   infraestructura), luego fronteras + lint, luego Compose + `schema.prisma` mínimo + health +
   apagado (integración/e2e con Postgres y Redis reales).
4. **Verificación de salida**: `npm run verify` y `npm run test:e2e` en verde; documentación de cierre.

La elección concreta de cómo se levantan Postgres/Redis en las pruebas de integración locales
(servicios de Compose o Testcontainers) y el umbral de cobertura (`openspec/config.yaml` lo deja
"revisar en Fase 00a") quedan para `sdd-design`.

**TDD**: `strict_tdd` de Gentle-AI sigue en `false` durante 00a porque el runner aún no existe al
empezar; la convención del proyecto (`apply.tdd: true`) aplica igual: en cuanto el runner quede
instalado en las primeras tareas, toda tarea MUST mostrar RED observado antes de GREEN.

**Entrega**: estrategia `auto-chain` con cadena `stacked-to-main`, slices de ~400 líneas de autoría
(archivos generados como `package-lock.json` no cuentan). Límite duro de 10 tareas
(`openspec/config.yaml` §tasks). Review requerida: **RDD** (00a no es 04/05/06/10, sin
judgment-day).

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `package.json`, `package-lock.json`, `tsconfig*.json` | New | Proyecto NestJS 12 ESM, scripts `test`, `test:e2e`, `verify`, `start:dev` |
| `vitest.config.*` | New | Proyectos unitario / integración / e2e |
| `eslint.config.*` | New | Flat config con reglas de reloj, `process.env` y `console` |
| `.dependency-cruiser.*` | New | Reglas de fronteras (skill §2) |
| `src/main.ts`, `src/app.module.ts` | New | Bootstrap con pino y shutdown hooks |
| `src/plataforma/config/` | New | ConfigModule + esquema Zod |
| `src/plataforma/reloj/` | New | `Clock`, token `CLOCK`, implementación de sistema |
| `src/plataforma/observabilidad/` | New | Logger `nestjs-pino` con redacción |
| `src/plataforma/prisma/`, `src/plataforma/redis/` | New | Conexión mínima para health y apagado (sin modelos) |
| `src/plataforma/salud/` (nombre final en design) | New | Controlador de health con Terminus |
| `src/compartido/` | New | `dinero`, `texto`, `numero` + `*.spec.ts` |
| `prisma/schema.prisma` | New | Solo `datasource` + `generator` |
| `test/fakes/`, `test/integracion/`, `test/e2e/` | New | `ClockFalso`, pruebas de health/config/apagado |
| `docker-compose.yml`, `.env.example`, `.gitignore`, `.nvmrc` (o `engines`) | New | Entorno de desarrollo |
| `openspec/config.yaml` | Modified | Confirmar comandos; `strict_tdd` sin cambios |
| `CLAUDE.md` (Comandos), `.claude/skills/luxeboreal-arquitectura/SKILL.md` | Modified | Documentar lo que el scaffold fijó |
| `docs/fases/README.md`, `docs/migracion/inventario.md` | Modified | Al archivar: estado de 00a y filas migradas |
| `docs/adr/0001-monolito-modular-nestjs.md` | Modified (solo si hay fallback) | Registrar retroceso a NestJS 11 |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Una dependencia clave no declara soporte para NestJS 12 | Media | Tarea 1 lo verifica antes de escribir código; fallback a 11 ya decidido (ADR-0001) |
| `@nestjs/swagger` + zod v4 con fechas (nestjs/swagger#3672) | Baja en 00a | Solo afecta a 00b; se anota el hallazgo de la tarea 1 para la proposal de 00b |
| Prisma genera mal o se queja de un `schema.prisma` sin modelos, o su versión actual exige cambios (ESM, configuración nueva) | Media | Probarlo en la tarea de health; si no funciona, **no** se cambia de estrategia en silencio: se vuelve al usuario (la alternativa de la exploración es un cliente `pg` solo para health) |
| Conflicto de puertos en esta máquina: 5432 lo usa un Postgres nativo y 5433 el Postgres del Chatwoot del prototipo | Alta | Puertos de Compose configurables por variable y un default que no choque; lo fija design |
| Reglas ESM + Vitest + decoradores de NestJS (metadatos de tipos) dan fricción en tests | Media | Usar la configuración que genera `nest new` como base; resolver en la tarea del runner antes de seguir |
| La fase roza el límite de 10 tareas | Media | Alcance cerrado arriba; si `sdd-tasks` pasa de 10, se mueve algo a 00b en vez de ampliar |
| La regla de lint de `new Date()` choca con usos legítimos con argumento | Baja | La regla prohíbe solo `new Date()` sin argumentos y `Date.now()` |
| Redacción de logs incompleta (un campo con PII sin ruta en `redact`) | Media | Test `R14 — Redacción en logs` con los cuatro tipos de dato; la lista de rutas se revisa en design |

## Rollback Plan

- Todo el trabajo vive en la rama `fase-00a-esqueleto` y en PRs apilados (`stacked-to-main`); nada se
  despliega y no hay datos que migrar (P7). Revertir = no fusionar la cadena, o `git revert` del
  commit de unidad de trabajo del slice afectado; cada slice es autónomo y reversible.
- Entorno local: `docker compose down -v` elimina los volúmenes de desarrollo; no toca el Postgres
  nativo ni el Chatwoot del prototipo (puertos y nombres de proyecto distintos).
- Fallback de versión: si la tarea 1 falla con NestJS 12, se retrocede a 11 antes de avanzar, se
  registra el motivo en este change y en la enmienda de ADR-0001.
- Si la estrategia de `schema.prisma` mínimo no funciona, la tarea de health se detiene y se consulta
  al usuario; el resto de la fase no depende de ella.

## Dependencies

- Docker (Compose) y Node LTS en la máquina de desarrollo. La versión exacta de Node se fija en
  design según lo que exija NestJS 12.
- Acceso al registro de npm para la tarea 1.
- Ninguna fase previa (00a es la primera).

## Preguntas abiertas

Ninguna pregunta de `docs/PREGUNTAS_ABIERTAS.md` bloquea 00a (P13 → Fase 04, P14 → Fase 11,
P17 → Fase 06). Los dos puntos detectados al cruzar documentos quedaron **resueltos por el usuario
el 2026-09-23**:

| # | Pregunta | Decisión del usuario |
|---|---|---|
| Q1 | ¿Ruta del health, dado que API2 exige `/api/v1` en toda ruta pública? | `GET /health` como **excepción operativa explícita**, sin versión (Docker, Dokploy y Uptime Kuma la consultan fija). API2 MUST nombrarla como única excepción y API8 MUST marcarla `internal` (fuera del contrato público). La delta de la spec `api` va en este change |
| N1 | ¿Scripts e infra local de Chatwoot en 00a o en 04? | En la **Fase 04**; la fila de `docs/migracion/inventario.md` se corrige al archivar 00a |

## Success Criteria

- [ ] Resultado de la verificación de compatibilidad con NestJS 12 registrado en el change, con
      versiones exactas (o el fallback a 11 aplicado y justificado).
- [ ] `npm test` corre con Vitest (ESM) y pasa.
- [ ] `npm run verify` (lint, typecheck, `dependency-cruiser`, unitarios e integración) en verde en
      local, en menos de 3 minutos.
- [ ] `npm run test:e2e` en verde: la aplicación arranca, `GET /health` responde OK con Postgres y
      Redis arriba y error cuando uno de los dos está caído, y el proceso se apaga ordenadamente.
- [ ] La aplicación no arranca con una variable de configuración faltante o inválida y el error la
      nombra sin mostrar su valor.
- [ ] Un `Date.now()` o `new Date()` fuera de `plataforma/reloj`, un `process.env` fuera de
      `plataforma/config` o un import que viole una frontera hace fallar `npm run verify`.
- [ ] Test `R14 — Redacción en logs` en verde.
- [ ] `compartido/` con `dinero`, `texto` y `numero` y sus tests reescritos en verde.
- [ ] `docker compose up` deja Postgres 16 y Redis 7 `healthy`.
- [ ] `CLAUDE.md` (Comandos) y `openspec/config.yaml` (comandos confirmados, `strict_tdd: false`)
      actualizados.
