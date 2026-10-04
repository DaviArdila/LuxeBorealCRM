# Tasks: Fase 11b — Cliente Angular: estilo del bot y mensajes fijos

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio (regla 6: solo
04/05/06/10).

TDD estricto: RED observado → GREEN → REFACTOR. Runner **Vitest** en el servidor (`npm test`,
`npm run test:integracion`, `npm run test:e2e`) y el runner que fije T1 en el cliente; `npm run verify` al cerrar cada
slice del servidor y `npm run cliente:ci` al cerrar cada slice del cliente. Sin cambio de esquema de base de datos.

Ramas: una por slice, `fase-11b-pK-<tema>`, apiladas desde `main` (la 11a ya está fusionada). Un commit de unidad de
trabajo por tarea, Conventional Commits (encabezado y líneas del cuerpo ≤ 100 caracteres: `npm run commits` antes de
subir), sin atribución de IA. Antes de cada push, la batería completa de `CLAUDE.md` más `npm run cliente:ci` desde T5. Cada tarea
cita su commit al cerrarse.

**Resultado: 10 tareas, en el límite de 10.**

## Checklist

- [ ] T1 — Verificación de compatibilidad (Angular, PrimeNG, runner, `ng-openapi-gen` con OpenAPI 3.1, fronteras por lint), sin código de producción
- [ ] T2 — Endpoints de admin del estilo en `agente` y contrato
- [ ] T3 — Catálogos de mensajes fijos por módulo dueño y módulo `mensajes-fijos` (dominio y casos de uso)
- [ ] T4 — Endpoints de mensajes fijos, contrato y semilla `npm run mensajes:sembrar`
- [ ] T5 — Andamio de `cliente/` por áreas: shell, registro de áreas, fronteras por lint, proxy, `cliente:generar` y `cliente:deriva`
- [ ] T6 — Sesión en el cliente: inicio de sesión, `SesionServicio`, guardias e interceptor
- [ ] T7 — Pantalla «Estilo del bot» (área `bot`)
- [ ] T8 — Pantalla «Mensajes fijos» (área `bot`)
- [ ] T9 — `npm run ci` con el cliente
- [ ] T10 — Guía de operación, cierre documental y recorrido real `[manual]`

## Mapeo de escenarios por tarea (CLT 26 + AGT 8 + CFN 10 + CI 3 = 47)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | (sin escenarios: registro de compatibilidad en `design.md`) | 0 |
| T2 | AGT23 (8) | 8 |
| T3 | CFN2 «Un texto inválido se rechaza con su motivo»; CFN3 (3) | 4 |
| T4 | CFN1 (3); CFN2 (3 restantes) | 6 |
| T5 | CLT1 (2); CLT2 (2); CLT9 «Un import entre áreas se rechaza», «El código de un área no viaja en el arranque» | 6 |
| T6 | CLT4 (4); CLT5 (4); CLT6 (2); CLT9 «Un área registrada aparece en el menú de su rol», «El menú no muestra las áreas que el rol no puede usar» | 12 |
| T7 | CLT7 (4) | 4 |
| T8 | CLT8 (3) | 3 |
| T9 | CI10 (3) | 3 |
| T10 | CLT3 (1, `[manual]` además de su test de configuración del proxy) | 1 |

## Tareas

### T1 — Verificación de compatibilidad (sin código de producción)

- Llenar «Registro de compatibilidad» de `design.md`: versión estable de Angular a la fecha, PrimeNG compatible,
  runner de tests por defecto del CLI, `ng-openapi-gen` contra el `openapi/openapi.json` real (OpenAPI 3.1, con los
  endpoints de la 11a y `excludeParameters` para `X-Luxe-Csrf`, D12), `angular-eslint` con la regla de imports
  prohibidos y `eslint-plugin-boundaries` con las reglas de D10 (fixtures que las violan).
- Punto de partida medido el 2026-10-04 (se confirma en T1, no lo reemplaza): `@angular/core` 22.2.1,
  `primeng` 22.1.2 (pide `@angular/core ^22.1.0`), `angular-eslint` 22.5.0, `eslint-plugin-boundaries` 7.2.0,
  `ng-openapi-gen` 1.1.0. El CLI de Angular 22 pide Node `^22.22.3 || ^24.15.0`.
- Si `ng-openapi-gen` falla, se elige la alternativa, se anota y se ajusta ADR-0022 antes de seguir.
- Forecast: sin cambios de producción, sin riesgo de presupuesto.

### T2 — Endpoints del estilo

- `EstiloController` en `agente/interfaz/` con los cuatro endpoints de `design.md`, `@Roles('admin')`, DTO Zod y
  `respuestaDesdeZod`; `ResultadoPublicacion.razon`; códigos `estilo-invalido` y `version-estilo-inexistente`.
- `npm run contrato:generar` en el mismo commit; deriva, Spectral y oasdiff en verde.
- E2E con sesión real: admin, asesor (`403`), publicar y ver el estilo en el prompt del siguiente turno (LLM guionado),
  logs sin el texto.
- Forecast: ~400 líneas.

### T3 — Catálogos y módulo `mensajes-fijos`

- `agente`, `conversaciones`, `catalogo` y `llm` mueven su texto de respaldo a `dominio/` con descripción y lo exportan
  por su barril; sus repositorios lo siguen usando (los tests existentes de AGT3 y similares deben seguir verdes).
- `mensajes-fijos`: `validarMensajeFijo`, `ListarMensajesFijos`, `GuardarMensajeFijo`, `SembrarMensajesFijos`,
  puerto `RepositorioMensajesFijos` y su adaptador Prisma.
- Unitarias con fakes; integración del repositorio y de la semilla contra Postgres real.
- Forecast: ~400 líneas.

### T4 — Endpoints de mensajes fijos y semilla

- `MensajesFijosController` con los dos endpoints, `@Roles('admin')`, códigos `mensaje-fijo-invalido` y
  `mensaje-fijo-desconocido`; `MensajesFijosModule` en `AppModule`; contrato regenerado en el mismo commit.
- `scripts/sembrar-mensajes-fijos.ts` en `scripts/cli.ts` y `mensajes:sembrar` en `package.json`.
- E2E: lista con origen, editar `mensaje_handoff` y verlo en el siguiente traspaso, clave desconocida, asesor, logs.
- Forecast: ~350 líneas.

### T5 — Andamio del cliente

- `cliente/` con el CLI de Angular (standalone, zoneless), PrimeNG, `angular-eslint` con la regla de CLT1,
  `proxy.conf.json`, `ng-openapi-gen.json`; scripts de raíz `cliente:generar` y `cliente:deriva`; la raíz ignora
  `cliente/**` en su lint.
- Estructura de D7: `nucleo/` (tipo `DefinicionArea`), `compartido/`, `shell/` (marco y menú vacíos todavía),
  `areas/registro.ts` y `areas/bot/` con su `area.ts` y `bot.routes.ts` apuntando a pantallas provisionales; rutas
  diferidas en `app.routes.ts` (D9).
- Fronteras de D10 en el lint del cliente, cada regla con un fixture que la viola (como
  `test/fronteras/dependency-cruiser.spec.ts` en el servidor).
- Test de `cliente:deriva` con un contrato alterado (en `test/fronteras/`, como `contrato:deriva`) y comprobación de
  que el build deja el área `bot` en un archivo aparte.
- **`size:exception`** (fila «T5 supera ~400 líneas» de la tabla de Risks de `proposal.md`): lo generado por el CLI y
  por `ng-openapi-gen` no cuenta como autoría. Forecast: ~350 líneas de autoría.

### T6 — Sesión en el cliente

- Pantalla de inicio de sesión (CLT4), `SesionServicio` con un signal del usuario de `/yo`, guardias de ruta por sesión
  y por rol (CLT5), interceptor de `X-Luxe-Csrf` y de `401`/`403` (CLT6), cerrar sesión.
- El shell gana el menú armado desde `areas/registro.ts` y el rol (CLT9), la barra con el usuario y «Cerrar sesión», y
  la lectura de problem+json de `nucleo/` (D11) que usan las pantallas siguientes.
- Tests de componentes y servicios con `HttpTestingController`.
- Forecast: ~450 líneas (al límite; si lo pasa, la excepción se escribe al cerrar).

### T7 — Pantalla «Estilo del bot»

- En `areas/bot/estilo/`: vista del vigente con origen, editor con contador, publicar con confirmación, motivo del
  `422` sin perder el texto, historial con texto completo y restaurar, recordatorio de evals (EVL3). El editor con
  contador y la confirmación nacen en `compartido/` (los usa también T8).
- Tests de componentes. Forecast: ~350 líneas.

### T8 — Pantalla «Mensajes fijos»

- En `areas/bot/mensajes-fijos/`: tabla con descripción, texto y origen; editor con contador (de `compartido/`);
  guardar; motivo del `422`; advertencia en `aviso_datos`.
- Tests de componentes. Forecast: ~300 líneas.

### T9 — CI con el cliente

- `cliente:ci` y su lugar al final de `npm run ci`; el workflow de Actions sigue llamando solo a `npm run ci` (con caché
  de npm para `cliente/package-lock.json`); `ci:hook` sin cambios; `npm run flujos` en verde.
- Tests en `test/fronteras/` de que `ci` incluye `cliente:ci` y de que `fronteras` sigue limitado a `src` y `scripts`.
- Forecast: ~150 líneas.

### T10 — Guía y cierre

- `docs/operacion/cliente-back-office.md` (cómo levantar API y cliente en local, crear el admin, publicar un estilo,
  editar un mensaje, sembrar), `CLAUDE.md` (comandos y mapa de documentación), `docs/fases/README.md`,
  `docs/PREGUNTAS_ABIERTAS.md`, `docs/analisis/06-cliente-back-office.md` si algo cambió, una sección «Cliente» en la
  skill `luxeboreal-arquitectura` (áreas, fronteras de D10, cómo se agrega un área), `verify-report.md` y archivo
  del change (fusiona `cliente` como dominio nuevo y los deltas de `agente`, `configuracion-negocio` e
  `integracion-continua`).
- **`[manual]`**: el dueño levanta API y cliente, inicia sesión, publica un estilo, edita `mensaje_handoff` y comprueba
  por WhatsApp (o con el simulador) que el siguiente mensaje usa ambos; un usuario asesor no ve las pantallas.
- Forecast: sin cambios de producción, sin riesgo de presupuesto.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2.750 de autoría (sin lo generado por el CLI ni por `ng-openapi-gen`) |
| 400-line budget risk | Medium: T2 y T3 al límite; T6 puede pasarlo; T5 con `size:exception` anticipada |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (T1, T2) → PR2 (T3) → PR3 (T4) → PR4 (T5) → PR5 (T6) → PR6 (T7) → PR7 (T8) → PR8 (T9, T10) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |
