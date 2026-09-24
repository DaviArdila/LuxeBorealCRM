# Exploration: Fase 00 — Fundaciones (LuxeBorealCRM)

> Esta exploración se hizo antes de decidir partir la Fase 00 (P19, 2026-09-23) y cubre tanto 00a
> (esqueleto y verificación local) como 00b (CI y contrato de API); la proposal de 00b la referencia
> en vez de repetirla.

- Fecha: 2026-09-23 · Fase SDD: explore · Espejo: Engram `luxeborealcrm` / `sdd/fase-00-fundaciones/explore`
- Verificación del orquestador (fuentes primarias, 2026-09-23): `@nestjs/core` dist-tags
  `latest = 12.1.0`, `legacy = 11.2.6` (https://registry.npmjs.org/@nestjs/core); `nest new` ofrece
  "ESM (the default), which uses Vitest for testing, or CommonJS, which uses Jest"
  (https://docs.nestjs.com/cli/overview).

## Estado actual

Repo en planeación pura: sin `package.json`, sin `src/`, sin `prisma/`. Solo documentación
(`SPEC.md` 0.3 aprobada, `openspec/config.yaml`, `openspec/specs/*`, `docs/fases/README.md`, ADR
0001-0008, skills `luxeboreal-arquitectura` y `luxeboreal-fases`). Ningún change existía antes de este.

## Verificación de salida de Fase 00 (fila 00 de `docs/fases/README.md`)

`npm run verify` en verde; `npm test` corre y `openspec/config.yaml` pasa a `strict_tdd: true`;
`GET /health` responde con Postgres y Redis arriba y aparece en el contrato OpenAPI; pipeline de API
(ADR-0008): `nestjs-zod` + `@nestjs/swagger` generan `openapi/openapi.json`, Scalar sirve `/docs`
protegido fuera de desarrollo; CI en verde: lint, typecheck, `dependency-cruiser`, tests de
integración (Testcontainers), `gitleaks`, `npm audit`, commitlint, drift de `openapi/openapi.json` +
Spectral + oasdiff.

## Qué pertenece a Fase 00 y qué a fases posteriores

| Pieza | Fase | Motivo |
|---|---|---|
| Config Zod, Clock, logs redactados, fronteras, runner de tests, Docker dev, CI, pipeline OpenAPI | 00 | Fila 00 explícita |
| Health con `@nestjs/terminus` (Postgres + Redis) | 00 | Exigido en la fila 00, pero **sin** esquema de negocio |
| `PrismaService` completo, `MODELO_DATOS.md` v1, migración inicial, semilla DANE | 01 | Fila 01; el esquema es lógica de negocio del usuario |
| Uso real de Redis (colas, debounce, locks) | 05+ | Esas piezas no existen antes de Conversaciones |

Tensión: el health de Fase 00 necesita comprobar Postgres, pero el esquema Prisma es de la Fase 01.
Un `schema.prisma` con solo `datasource` + `generator` (sin modelos) genera un `PrismaClient` usable
para `SELECT 1` sin invadir el diseño de datos. Alternativa: cliente `pg` crudo solo para health.

## Qué se migra del prototipo (vía CodeGraph sobre `../ChatLuxeCRM`)

| Prototipo | Decisión | Destino | Motivo |
|---|---|---|---|
| `src/config/env.ts` | Rediseñar | `plataforma/config` (ConfigModule + Zod) | A1: valida y lanza al importar |
| `src/lib/logger.ts` | Rediseñar | `nestjs-pino` con `redact` | R14/A11: el prototipo no redacta |
| `src/lib/tiempo.ts` | Conservar la idea, rediseñar la forma | `plataforma/reloj` (`Clock` por DI) | B8 acierto; A1 reloj global mutable |
| `src/lib/dinero.ts`, `texto.ts`, `numero.ts` | Conservar | `compartido/` | B1/B11; funciones puras ya testeadas |
| `src/health/router.ts` (`{status:"ok"}` fijo) | Rediseñar | `@nestjs/terminus` con Postgres + Redis | No chequea nada hoy |
| `docker-compose.yml` | Rediseñar (parcial) | Compose de desarrollo: Postgres 16 + Redis 7 con healthcheck | Caddy e imagen de producción son Fase 09 |
| `.env.example` con `MOCK_*` | Descartar el patrón | Variables validadas por Zod, sin `MOCK_*` | A2, ADR-0001 |
| `package.json` (Vitest, Express) | Descartar | `package.json` nuevo | Stack distinto (ADR-0001) |

## Verificación externa (2026-09)

| Herramienta | Hallazgo | Implicación |
|---|---|---|
| NestJS | `latest` 12.1.0; la 11 es `legacy` | ADR-0001 fija NestJS 11: reabrir o confirmar |
| `nest new` | Default ESM + Vitest; CommonJS + Jest es la alternativa | Contradice "Jest es el estándar de NestJS" (P10, `config.yaml`, skills) |
| `@nestjs/terminus` | 11.x para Nest 11; 12.x para Nest 12 | Se fija según la mayor elegida |
| `nestjs-zod` | v5, "bring your own zod" (v3, v4, zod-mini) | Compatible con el plan |
| `@nestjs/swagger` + zod v4 | Reportes puntuales con `Date` (nestjs/swagger#3672) | Fijar versiones exactas y probar fechas ISO 8601 |
| Prisma `@default(uuid(7))` | Estable desde 5.18.0 (2024-08) | ADR-0007 sin riesgo |
| dependency-cruiser / eslint-plugin-boundaries | Ambos activos; se suelen combinar | dependency-cruiser basta para Fase 00 |
| Testcontainers Node | `testcontainers` 11.x; módulos postgresql/redis 12.x | Activo |
| Spectral CLI | 6.16.x publicado; existe fork sin telemetría | Mantenido |
| oasdiff | Soporta OpenAPI 3.0/3.1/3.2; `--fail-on ERR` en CI | Coincide con ADR-0008 |
| CHANGELOG | `git-cliff` vs `release-please`; `changesets` es para monorepos | Decisión real |
| gitleaks, commitlint | Estables | Sin cambios |

## Riesgo de tamaño

La fila 00 abarca al menos 4 subsistemas (esqueleto, observabilidad/health, CI, contrato de API).
Con alta probabilidad supera las 10 tareas de `openspec/config.yaml` y los slices de ~400 líneas.

Partición propuesta:
- **00a — Esqueleto y verificación local**: NestJS, config Zod, Clock, logger con redacción,
  `compartido/`, dependency-cruiser, runner de tests, health (Postgres + Redis), Docker Compose dev.
  Sale con `npm run verify` en verde local.
- **00b — CI y contrato de API**: CI completo, pipeline OpenAPI (nestjs-zod + swagger + Scalar +
  Spectral + oasdiff + drift), CHANGELOG. Depende de 00a. Sale con `strict_tdd: true`.

## Decisiones abiertas (para el usuario)

1. NestJS 11 (ADR-0001) o 12 (la mayor actual).
2. Runner de tests: Jest (lo escrito en los docs) o Vitest (default actual del CLI).
3. Partir la Fase 00 en 00a/00b o mantenerla entera.
4. Health de Postgres: `schema.prisma` mínimo sin modelos o cliente `pg` aparte.
5. CI: GitHub Actions ya o hook git local hasta subir el repo.
6. CHANGELOG: `git-cliff` o `release-please`.
7. Lint: se asume ESLint (flat config); Biome no se evaluó a fondo.

## Recomendación del explorador

Partir en 00a/00b; `schema.prisma` mínimo para el health; decidir explícitamente NestJS y runner
antes de la proposal (ninguna respuesta se inventó aquí).
