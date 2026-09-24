# Proposal: Fase 00b — CI y contrato de API

- Change: `fase-00b-ci-contrato-api` · Fase de la hoja de ruta: **00b** (`docs/fases/README.md`)
- Rama: `fase-00b-ci-contrato-api` · Fecha: 2026-09-24 · Estado: `spec en revisión`
- Depende de: **Fase 00a, cerrada** (`openspec/changes/archive/2026-09-23-fase-00a-esqueleto/`)
- Insumo principal: `openspec/changes/archive/2026-09-23-fase-00a-esqueleto/exploration.md` (la
  exploración de la Fase 00 cubre explícitamente 00a **y** 00b; no se repite aquí) y el
  `verify-report.md` de 00a (§"Desviaciones", §"Qué aprendimos que cambia las fases siguientes")

## Intent

La Fase 00a dejó una puerta de calidad real (`npm run verify`: lint, typecheck, fronteras, tests
unitarios e integración, 23.7 s en verde), pero esa puerta **solo protege la máquina donde alguien
la corre a mano**. Hoy nada impide empujar un commit con formato no convencional, con un secreto
dentro, o sin haber corrido los tests de integración. Y nada de eso se puede exigir más adelante sin
haberlo construido antes: la regla 3 de `docs/fases/README.md` prohíbe que una fase dependa de otra
que no esté cerrada.

En paralelo, ADR-0008 decidió que el contrato de API **empieza en la Fase 00b, no en la 14**, y hoy
ese pipeline no existe: no hay `openapi/openapi.json`, ni `/docs`, ni validación por esquema zod en
ningún endpoint. La Fase 00a dejó tres escenarios de `openspec/specs/api/spec.md` explícitamente
diferidos a esta fase (`verify-report.md` de 00a, §"Resultado por escenario"): los dos de API2
(prefijo `/api/v1` y `operationId` estable) y el de API8 (`GET /health` fuera del documento público).
Cuanto más tarde llegue el pipeline, más endpoints habrá que documentar de golpe y más caro será
detectar un cambio incompatible (API10).

Además, `openspec/config.yaml` sigue con `strict_tdd: false`, con el comentario que dice que **la
Fase 00b MUST terminar con `strict_tdd: true`**. Esa puerta se cierra aquí.

Éxito = la verificación de salida de la fila 00b de `docs/fases/README.md`: CI en verde en local
(hook pre-push) con el workflow de Actions escrito, `openspec/config.yaml` en `strict_tdd: true`, y
CI completo en verde (lint, typecheck, `dependency-cruiser`, tests de integración con Testcontainers,
`gitleaks`, `npm audit`, commitlint, drift de `openapi/openapi.json` + Spectral + oasdiff).

## Decisiones ya tomadas por el usuario (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Mecanismo de validación y documentación | Soporte **nativo** de Standard Schema de NestJS 12: `StandardSchemaValidationPipe` global + esquema zod por la opción `schema` de `@Body()`/`@Query()`/`@Param()`; `@nestjs/swagger` convierte esos mismos esquemas. **Sin `nestjs-zod`** (descartado, no diferido) | ADR-0008 §Enmienda (2026-09-23); `verify-report.md` de 00a §Desviaciones; skill `luxeboreal-arquitectura` §10 |
| Interfaz de documentación | **Scalar** (`@scalar/nestjs-api-reference`) en `/docs`, protegida o desactivada fuera de desarrollo | ADR-0008 §Decisión; API9 |
| Contrato versionado en git | `openapi/openapi.json` se genera y se commitea; nadie lo edita a mano; CI regenera y falla si difiere | ADR-0008; API1; skill `luxeboreal-arquitectura` §10 |
| Lint y compatibilidad del contrato | **Spectral** (lint) + **oasdiff** contra `main` (cambios incompatibles) | ADR-0008; API10; exploración §"Verificación externa" (Spectral 6.16.x, oasdiff con `--fail-on ERR`) |
| CHANGELOG | **`git-cliff`** desde Conventional Commits (elegido sobre `release-please`) | `CLAUDE.md` §Stack; skill `luxeboreal-arquitectura` §11; exploración §"Decisiones abiertas" (6) |
| CI: hook local **y** workflow | Las dos cosas: hook pre-push activo ya, workflow de GitHub Actions completo escrito y listo, activo cuando el repo se suba | fila 00b de `docs/fases/README.md`; exploración §"Decisiones abiertas" (5) |
| Infraestructura de pruebas en CI | **Testcontainers**, el mismo mecanismo en local y en CI; Docker Compose queda solo para desarrollo manual | ADR-0009 (aceptada en 00a); skill `luxeboreal-arquitectura` §7 |
| `GET /health` en el contrato | Ruta sin prefijo de versión (única excepción a API2) y **excluida del documento público** (API8) | Q1 de la proposal de 00a, resuelta por el usuario el 2026-09-23; `openspec/specs/api/spec.md` API2 y API8 |
| Errores y convenciones JSON | RFC 9457 (`application/problem+json`, API4) y convenciones JSON (API3) entran en 00b | tabla "Out of Scope" de la proposal de 00a |
| `strict_tdd` | Pasa a `true` al cerrar esta fase | fila 00b; comentario de `openspec/config.yaml` |
| Review requerida | **RDD** por commit de unidad de trabajo. **Sin `judgment-day`** (00b no es 04/05/06/10) | regla 6 de `docs/fases/README.md` |
| Entrega | `auto-chain` con cadena `stacked-to-main`, slices de ~400 líneas de autoría | preflight de la migración (`CLAUDE.md`, skill `luxeboreal-fases`) |

## Scope

### In Scope

1. **Hook pre-push local**: corre lint, typecheck, tests unitarios, commitlint y `gitleaks` antes de
   empujar. MUST ser rápido (los tests de integración se quedan en CI, no en el hook) y MUST poder
   saltarse de forma explícita y visible (`--no-verify`), nunca en silencio.
2. **Convención de commits verificada**: `commitlint` con Conventional Commits; MUST rechazar un
   mensaje sin tipo válido y MUST rechazar líneas de atribución de IA (`Co-Authored-By`, `CLAUDE.md`
   §"Cómo se trabaja").
3. **Secretos y dependencias**: `gitleaks` sobre el repositorio y `npm audit` con un umbral de
   severidad explícito. Un secreto detectado MUST bloquear; una alerta por debajo del umbral MUST NOT
   bloquear.
4. **Workflow de GitHub Actions completo**, escrito y validado estáticamente, listo para activarse
   cuando el usuario suba el repo (hoy es local, `CLAUDE.md` §Repositorio). MUST ejecutar los mismos
   pasos que la puerta local, sin duplicar su definición (ver Approach).
5. **Pipeline de contrato de API (ADR-0008)**: `StandardSchemaValidationPipe` global, esquema zod de
   cada endpoint como única fuente, generación **determinista** de `openapi/openapi.json` con
   `@nestjs/swagger` (orden de claves estable, sin valores dependientes del momento o del entorno,
   API1) y comprobación de deriva (el documento commiteado MUST coincidir con el generado).
6. **Scalar en `/docs`** protegida o desactivada fuera de desarrollo (API9), sobre el mismo documento
   generado.
7. **`GET /health` dentro del contrato como endpoint interno**: esquema zod de su respuesta,
   etiquetado `internal`, **excluido** del documento público servido en `/docs` y del
   `openapi/openapi.json` distribuido (API8), y ruta sin prefijo de versión (API2). Los dos
   escenarios de API2 diferidos en 00a quedan verificables aquí.
8. **Errores en RFC 9457** (API4): filtro global que responde `application/problem+json` con un
   código de error propio estable, distinto del `status` HTTP, para errores de validación del pipe y
   para errores no manejados. Convenciones JSON observables (API3: camelCase, UUID, ISO 8601 UTC,
   dinero entero) verificadas sobre lo que exista en esta fase.
9. **Lint y diff del contrato**: `Spectral` con un ruleset versionado y `oasdiff` contra `main` con
   `--fail-on ERR`; política explícita y visible cuando no existe documento base contra el cual
   comparar (ver Risks).
10. **`CHANGELOG.md` generado con `git-cliff`** desde los Conventional Commits, con su configuración
    versionada. El archivo MUST NOT editarse a mano.
11. **Cierre**: `openspec/config.yaml` pasa a `strict_tdd: true` y fija `coverage_threshold` (hoy 0,
    "se fija en 00b con CI"); sección "Comandos" de `CLAUDE.md` con los scripts nuevos; skill
    `luxeboreal-arquitectura` §10/§11 alineada con lo que el pipeline haya fijado.

### Out of Scope

| Qué | Fase | Motivo |
|---|---|---|
| Mecanismo real de autenticación para `/docs` (token, sesión, rol) | 11 (auth) / 09 (endurecimiento) | API7 y ADR-0008 dejan el mecanismo de autenticación para la Fase 11; 00b cumple API9 desactivando `/docs` fuera de desarrollo |
| Endpoints de negocio bajo `/api/v1` | 11-14 | No existe ningún recurso de negocio todavía; 00b fija la convención, no los recursos |
| Webhook de Chatwoot etiquetado `internal` | 04 | El webhook no existe (escenario de API8 diferido a 04 en el `verify-report.md` de 00a) |
| Kill switch etiquetado `internal` | 09 | fila 09 |
| `Idempotency-Key` (API6), paginación por cursor (API5), autorización por rol (API7) | 12-13, 12-14, 11 | `openspec/specs/api/spec.md` los asigna a esas fases |
| Subir el repo a GitHub, ejecutar el workflow de verdad, protección de ramas, abrir PRs | Fuera de fase | Push, PR y merge son siempre decisión del usuario (`CLAUDE.md`); ver pregunta abierta Q4 |
| Versionado semántico automático, tags y publicación de releases | Posterior | `git-cliff` en 00b solo genera el `CHANGELOG.md`; publicar versiones no es criterio de salida de la fila 00b |
| Imagen Docker de producción, despliegue en Dokploy, Sentry, Uptime Kuma, rotación de logs | 09 | fila 09 |
| Cliente generado desde `openapi.json` y estabilización de la API v1 | 14 | fila 14; ADR-0008 §"Empieza en la Fase 00b, no en la 14" |
| Modelos Prisma, migraciones, semilla DANE | 01 | fila 01; el esquema es lógica de negocio del usuario |
| Resolver la redacción de `err.message` en logs | Decisión del usuario | Pendiente señalado en el `verify-report.md` de 00a; ver Risks y pregunta abierta Q2 |

## Qué se migra del prototipo

**No aplica: el prototipo no tenía ni CI ni contrato de API.**

| Prototipo (`../ChatLuxeCRM`) | Decisión | Destino | Motivo |
|---|---|---|---|
| — (ninguna pieza) | — | — | `docs/migracion/inventario.md` no asigna ninguna fila a esta fase: no hay workflows, hooks de git, configuración de linters de contrato ni documento OpenAPI en el prototipo. ADR-0008 §Contexto lo dice explícitamente: la API "solo está mencionada, no especificada". El `package.json` del prototipo (Express, scripts) ya se descartó en 00a |

### Tests del prototipo que esta fase reemplaza

Ninguno. Los 199 tests del prototipo (`docs/migracion/inventario.md` §Tests) son especificación de
comportamiento de negocio; 00b no toca negocio. Lo único que 00b hereda de ese terreno es **A12**
(pirámide de tests invertida en el prototipo, ya corregida en 00a): el orden y la separación de los
proyectos de Vitest en el workflow MUST preservar esa pirámide — los unitarios corren primero y sin
infraestructura, los de integración después con Testcontainers.

## Capabilities

### New Capabilities

- `integracion-continua`: la puerta de calidad automatizada, observable desde fuera del código —
  qué se comprueba antes de empujar, qué se comprueba en el servidor, qué hace fallar el build
  (secreto detectado, mensaje de commit inválido, dependencia vulnerable por encima del umbral,
  deriva del contrato, cambio incompatible de API) y cómo se genera el `CHANGELOG.md`. Ids de
  requisito sugeridos: `CI1…CIn`.

### Modified Capabilities

- `api` (`openspec/specs/api/spec.md`): al menos dos requisitos cambian a nivel de texto, no solo de
  implementación:
  - **API9**: hoy dice "en producción"; la fila 00b exige `/docs` protegida **fuera de desarrollo**
    (más amplio: también preproducción). El escenario observable cambia.
  - **API4**: hoy tiene un solo escenario (error de validación). 00b agrega el comportamiento para
    errores no manejados y la exigencia de un catálogo de códigos de error estables.
  - **API1/API8**: si el diseño separa documento **interno** (con `/health`) de documento **público**
    (sin él), esa distinción MUST quedar en el requisito, no solo en el código.
  - API2, API3 y API10 se **implementan** en esta fase sin que su texto cambie; `sdd-spec` MUST
    registrarlo así (como hizo 00a con `privacidad`/R14) en vez de inventar un delta.
- `plataforma` (`openspec/specs/plataforma/spec.md`): **PLT7** pasa de cinco a seis comprobaciones si
  `npm run verify` incorpora la deriva del contrato (es lo recomendado: el checklist §12.9 de la
  skill `luxeboreal-arquitectura` exige el contrato regenerado en el mismo commit, y eso debe
  detectarse antes del push). `gitleaks` y `commitlint` NO entran en `verify` — dependen del estado
  de git, no del build — y viven en el hook y en CI. Si el diseño decide dejar `verify` intacto, esta
  capability no lleva delta y `sdd-spec` MUST decirlo explícitamente.

## Approach

1. **Una sola definición de los pasos de CI.** Un script `npm run ci` es la fuente de verdad de la
   secuencia completa; el hook pre-push corre su subconjunto rápido y el workflow de Actions lo
   invoca en vez de redefinir los pasos en YAML. Esto resuelve el problema estructural de esta fase:
   el repositorio es local (`CLAUDE.md` §Repositorio), el workflow **no se puede ejecutar de verdad**
   hasta que el usuario lo suba, y un YAML que nadie ejecutó se desincroniza del proyecto sin que
   nadie lo note. Con esta forma, "CI completo en verde" se verifica localmente corriendo lo mismo
   que correrá el servidor, y el YAML se valida estáticamente.
2. **Contrato antes que la CI del contrato**, en este orden: pipe nativo + esquema zod → documento
   generado de forma determinista → comprobación de deriva → Spectral → oasdiff. Cada eslabón
   necesita que el anterior exista; invertir el orden produce herramientas configuradas contra un
   documento que aún no se genera.
3. **El pipeline se ejercita sin inventar endpoints de negocio.** Hoy el único endpoint es
   `GET /health`, y API8 lo excluye del documento público: el documento público nace con `paths`
   vacío. `sdd-design` MUST decidir cómo se prueban API2/API3/API4 sin ampliar la superficie pública
   real; la dirección recomendada es un controlador *fixture* registrado **solo** en el arranque de
   test (nunca en producción, y nunca con un flag `MOCK_*` — A2, ADR-0001), más el documento interno
   con `/health` como caso real de generación determinista.
4. **Documento público vs. documento interno**: `sdd-design` decide entre generar dos documentos o
   uno filtrado por etiqueta, y cuál de los dos alimenta Spectral y oasdiff (lo esperable: el
   público, que es el que se distribuye). La decisión tiene alternativas reales → MUST quedar como
   ADR `propuesta` si cambia algo de lo que ADR-0008 ya fijó.
5. **Cierre de la puerta TDD**: `strict_tdd` sigue en `false` durante la fase y pasa a `true` en la
   tarea de cierre, porque es criterio de salida de la fila 00b. La convención del proyecto
   (`openspec/config.yaml` §`apply.tdd: true`) aplica desde la primera tarea: RED observado → GREEN →
   REFACTOR, con `npm test` (Vitest, proyecto `unit`), que ya existe desde 00a.

**Entrega**: `auto-chain` con cadena `stacked-to-main`, slices de ~400 líneas de autoría (skills
`work-unit-commits` y `chained-pr`). `openapi/openapi.json`, `package-lock.json` y `CHANGELOG.md` son
archivos **generados**: no cuentan en el presupuesto de autoría, pero sí entran en el commit de su
unidad de trabajo. Corte natural de slices: (a) hook + commitlint + gitleaks/audit, (b) workflow +
script `ci`, (c) pipe + generación determinista del documento + deriva, (d) Scalar + `/health`
interno + errores RFC 9457, (e) Spectral + oasdiff, (f) `git-cliff` + cierre. El presupuesto nunca se
cumple borrando tests, comentarios ni documentación.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| Hook pre-push (`.husky/` u otra herramienta, la fija design) | New | lint, typecheck, unitarios, commitlint, gitleaks |
| `commitlint.config.*` | New | Conventional Commits + prohibición de atribución de IA |
| `.github/workflows/*.yml` | New | Workflow completo, inactivo hasta que el repo se suba |
| Configuración de `gitleaks` (allowlist versionada) | New | Falsos positivos controlados, nunca por omisión |
| `.spectral.yaml`, configuración de `oasdiff` | New | Lint y diff del contrato (API10) |
| `cliff.toml`, `CHANGELOG.md` | New | Generación desde Conventional Commits (§11 de la skill) |
| `openapi/openapi.json` | New | Documento generado y commiteado (API1); nunca editado a mano |
| `package.json` | Modified | Scripts nuevos (`ci`, generación/verificación del contrato, lint y diff del contrato, changelog) y `verify` extendido con la deriva |
| `src/main.ts` | Modified | `StandardSchemaValidationPipe` global, `SwaggerModule`, montaje de Scalar, filtro de errores |
| `src/plataforma/<documentacion>/` (nombre final en design) | New | Construcción del documento OpenAPI y servicio de `/docs`, con su `index.ts` (regla de fronteras 6) |
| `src/plataforma/<errores>/` (nombre final en design) | New | Filtro global RFC 9457 + catálogo de códigos estables |
| `src/plataforma/salud/` | Modified | Esquema zod de la respuesta y etiqueta `internal` |
| `src/plataforma/config/` | Modified | Variable(s) nuevas: entorno y habilitación de `/docs` (única lectura de `process.env`, PLT1) |
| `test/e2e/`, `test/integracion/`, `test/fronteras/` | Modified | Escenarios de `/docs`, del documento público, de errores problem+json y de la deriva |
| `.dependency-cruiser.cjs` | Modified (si aplica) | Regla para los submódulos nuevos de `plataforma/` |
| `.gitattributes` | New (si aplica) | Fin de línea fijo para que la deriva del documento no falle por CRLF en Windows |
| `openspec/config.yaml` | Modified | `strict_tdd: true`, `coverage_threshold` fijado, comandos nuevos |
| `CLAUDE.md` (§Comandos), `.claude/skills/luxeboreal-arquitectura/SKILL.md` (§10, §11) | Modified | Documentar lo que el pipeline fijó |
| `docs/fases/README.md`, `docs/migracion/inventario.md` | Modified | Al archivar: estado de 00b y corrección de la fila (ver riesgo 6) |
| `docs/adr/` | New (probable) | ADR de documento público vs. interno, o de la herramienta del hook, si hay alternativas reales |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| **El alcance supera las 10 tareas** de `openspec/config.yaml` (la fase abarca dos subsistemas: CI y contrato) | **Alta** | El corte de slices del Approach agrupa el trabajo en 6 unidades. Si `sdd-tasks` pasa de 10, NO se amplía el límite: se propone al usuario partir en **00b1 (CI)** y **00b2 (contrato de API)** (regla 1 de `docs/fases/README.md`). Ver pregunta abierta Q3 |
| **El workflow de Actions no se puede ejecutar de verdad** (el repo es local, sin remoto) | **Alta** | `npm run ci` como definición única de los pasos + validación estática del YAML (`actionlint`); el criterio "CI completo en verde" se satisface localmente y se reverifica el día que el usuario suba el repo |
| **oasdiff sin documento base en `main`** en el primer PR (`main` no tiene `openapi/openapi.json`) | **Alta** | Política explícita: si falta el documento base, el paso reporta "sin base de comparación" y NO falla, pero MUST dejar rastro visible en la salida. Nunca un "verde" silencioso que parezca una comparación real |
| **Documento público con `paths` vacío**: API8 excluye `/health` y no hay endpoints de negocio | Media | `paths: {}` es válido en OpenAPI 3.1; se decide en design si Spectral se ajusta o si se usa el documento interno como objeto adicional de lint. El controlador *fixture* de test ejercita el pipeline sin ampliar la superficie pública |
| **`@nestjs/swagger` + zod v4 con `Date`** (nestjs/swagger#3672, hallazgo de la exploración) | Media | Test explícito de fecha ISO 8601 UTC (API3) en la tarea del pipeline; si falla, el esquema usa `string` con formato y se registra la desviación en `design.md` |
| **Contradicción documental**: la fila 00b dice "`GET /health` entra al contrato OpenAPI", pero API8 (decidido después, Q1 de 00a) lo excluye del documento público | Alta (ya identificada) | Se resuelve como: `/health` se documenta desde su esquema zod y entra al documento **interno**, etiquetado `internal`, y queda **fuera** del público. La fila 00b de `docs/fases/README.md` se corrige al archivar. No se cambia API8 |
| **Redacción de `err.message`**: `message` está en `CLAVES_CONTENIDO_MENSAJE` (D9 de 00a), así que hoy se redacta también el diagnóstico de cualquier error serializado | Media | El filtro RFC 9457 no necesita loguear `err.message` para cumplir API4 (el código de error estable y el `status` bastan). Si una tarea necesita el diagnóstico real, se detiene y se pregunta al usuario (Q2); NO se modifica la tabla D9 aprobada sin su decisión |
| **Falsos positivos de `gitleaks` o `npm audit` bloqueando el hook** | Media | Allowlist versionada y revisada, umbral de severidad explícito en `npm audit`; el hook solo corre lo rápido, de modo que un bloqueo siempre tiene causa legible |
| **Deriva falsa del contrato por fin de línea o por orden de claves** (Windows, CRLF) | Media | Generación determinista exigida por API1 (orden estable, formato fijo) + `.gitattributes`; la tarea del pipeline MUST verificar dos generaciones consecutivas idénticas byte a byte |
| **Hook pre-push demasiado lento** y la gente empieza a usar `--no-verify` por costumbre | Media | El hook excluye integración y e2e (quedan en CI); presupuesto de tiempo explícito verificado en la tarea |
| **`strict_tdd: true` bloquea las propias tareas de esta fase** si se activa antes de tiempo | Baja | Se activa en la tarea de cierre, no al principio; durante la fase manda la convención `apply.tdd: true`, que ya se cumplía en 00a |

## Rollback Plan

- Todo el trabajo vive en la rama `fase-00b-ci-contrato-api` y en slices apilados
  (`stacked-to-main`). Nada se despliega y no hay datos que migrar (P7): revertir = no fusionar la
  cadena, o `git revert` del commit de unidad de trabajo del slice afectado. Cada slice del Approach
  es autónomo y reversible por separado.
- **Hook pre-push**: se salta con `git push --no-verify` y se desinstala borrando su archivo; no deja
  estado en el repositorio remoto (no hay remoto).
- **Workflow de Actions**: borrar `.github/workflows/` lo elimina por completo; hoy no ejecuta nada,
  así que su rollback no tiene efecto sobre ningún entorno.
- **Pipeline de contrato**: borrar `openapi/openapi.json` y quitar el paso de deriva de `verify`
  devuelve el proyecto al estado de 00a; el `StandardSchemaValidationPipe` global se retira de
  `main.ts` sin afectar a `GET /health` (que hoy no valida payload de entrada).
- **`/docs`**: se desactiva por configuración sin desplegar código nuevo (la variable es parte de
  `plataforma/config`).
- **`strict_tdd`**: volver a `false` en `openspec/config.yaml` es una línea, y MUST hacerse
  explícitamente (con motivo registrado), nunca de facto ignorando la puerta.
- **`CHANGELOG.md`**: es generado; se regenera o se borra sin pérdida de información (la fuente son
  los commits).

## Dependencies

- **Fase 00a cerrada** (lo está): `npm run verify`, Vitest con sus tres proyectos, Testcontainers
  (ADR-0009), `plataforma/config`, `plataforma/salud` y las reglas de fronteras.
- **Docker** disponible en la máquina donde corra la parte de integración (Testcontainers), igual que
  en 00a.
- **Binarios de herramientas externas**: `gitleaks`, `spectral`, `oasdiff`, `actionlint`. `sdd-design`
  MUST fijar cómo se obtienen (paquete npm, contenedor o acción de GitHub) sin asumir que el usuario
  los tiene instalados globalmente; en el workflow puede ser una acción, en local MUST existir un
  camino reproducible.
- **Acceso al registro de npm** para instalar las dependencias nuevas.
- **No** se depende de un remoto de GitHub: que exista o no es decisión del usuario (Q4).

## Preguntas abiertas

Ninguna de las tres preguntas vivas de `docs/PREGUNTAS_ABIERTAS.md` bloquea esta fase: P13 (horario)
bloquea la Fase 04, P14 (dashboard) la Fase 11 y P17 (techo de gasto LLM) la Fase 06. Q1 (ruta de
`/health`) y N1 (scripts de Chatwoot) quedaron resueltas por el usuario el 2026-09-23 y ya están
reflejadas en API2/API8 y en `docs/migracion/inventario.md`.

Lo que sí necesita decisión del usuario antes de que la tarea correspondiente avance:

| # | Pregunta | Qué bloquea | Estado |
|---|---|---|---|
| Q2 | Redacción de `err.message` en logs: (a) aceptar la pérdida de diagnóstico, (b) `serializers.err = pino.stdSerializers.err` excluyendo `err.*` de la redacción por `message`, o (c) otra alternativa | Solo la tarea de errores RFC 9457, y **solo si** decide registrar el diagnóstico real del error. El resto de la fase avanza | Pendiente desde el cierre de 00a (`verify-report.md` §Desviaciones, commit `462f935`). No se inventa la respuesta |
| Q3 | Si `sdd-tasks` supera las 10 tareas, ¿se parte la fase en 00b1 (CI) y 00b2 (contrato de API)? | La fase entera, pero solo en el momento de `sdd-tasks` | Pendiente. Regla 1 de `docs/fases/README.md`; solo el usuario cambia la hoja de ruta |
| Q4 | ¿El repositorio se sube a GitHub durante esta fase? | Nada del trabajo; cambia solo **dónde** se verifica el criterio de salida "CI completo en verde" (servidor real vs. `npm run ci` local) | Pendiente. Push, PR y merge son siempre decisión del usuario (`CLAUDE.md`) |

Ninguna de las tres impide arrancar `sdd-spec`.

## Success Criteria

- [ ] El hook pre-push bloquea un push con un error de lint, de tipos, un test unitario roto, un
      mensaje de commit no convencional o un secreto detectado, y lo dice nombrando la causa.
- [ ] Un mensaje de commit con una línea de atribución de IA es rechazado por `commitlint`.
- [ ] `npm run ci` (la secuencia completa) termina en verde en local: lint, typecheck,
      `dependency-cruiser`, tests unitarios, tests de integración con Testcontainers, `gitleaks`,
      `npm audit`, commitlint, deriva de `openapi/openapi.json`, Spectral y oasdiff.
- [ ] El workflow de GitHub Actions está escrito, validado estáticamente y ejecuta exactamente esa
      misma secuencia, sin redefinirla.
- [ ] `openapi/openapi.json` se genera desde los esquemas zod y **generarlo dos veces produce el mismo
      archivo byte a byte** (API1); modificar un endpoint sin regenerar el documento hace fallar la
      verificación.
- [ ] `GET /health` responde igual que en 00a, está documentado desde su esquema zod, etiquetado
      `internal`, y **no aparece** en el documento público ni en `/docs` (API8).
- [ ] `/docs` sirve el documento con Scalar en desarrollo y no es accesible fuera de desarrollo
      (API9).
- [ ] Un payload inválido produce una respuesta `application/problem+json` con un código de error
      propio estable, distinto del `status` HTTP (API4).
- [ ] Un cambio incompatible del contrato contra `main` hace fallar la verificación (oasdiff,
      API10); cuando no hay documento base, la salida lo dice explícitamente en vez de pasar en
      silencio.
- [ ] `CHANGELOG.md` se genera con `git-cliff` desde los Conventional Commits de la fase.
- [ ] `openspec/config.yaml` queda en `strict_tdd: true` con `coverage_threshold` fijado, y los
      comandos nuevos están en la sección "Comandos" de `CLAUDE.md`.
- [ ] Cada escenario de las specs delta de este change tiene su test, nombrado
      `<id del requisito> — <título del escenario>`, y pasa.
