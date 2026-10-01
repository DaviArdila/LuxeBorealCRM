# Tasks: Fase 08c — El estilo del agente se edita desde la base de datos

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio (regla 6: solo 04/05/06/10).

TDD estricto: RED observado → GREEN → REFACTOR. Runner **Vitest** (`npm test`, `npm run test:integracion`,
`npm run test:e2e`, `npm run evals`); `npm run verify` al cerrar cada slice. Nunca se llama a un LLM real salvo en la
tarea `[manual]`. Sin cambio de esquema: solo filas nuevas de `parametro`.

Rama: `fase-08c-prompts-en-base-de-datos` (desde `main` con la 08b fusionada). Un commit de unidad de trabajo por tarea,
Conventional Commits (encabezado y líneas del cuerpo ≤ 100 caracteres: `npm run commits` antes de subir), sin
atribución de IA. Antes de cada push, la batería completa de `CLAUDE.md`.

**Resultado: 7 tareas, dentro del límite de 10.**

## Checklist

- [x] T1 — `validarEstilo` (dominio) y ADR-0020 aceptada
- [x] T2 — Lectura del estilo: `ProveedorEstilo` con respaldo, copia en memoria y versión en Redis
- [x] T3 — `EnsamblarPrompt` usa el proveedor y el log lleva la versión del estilo
- [x] T4 — Publicar, historial y restaurar (casos de uso y repositorio transaccional)
- [x] T5 — Comando `npm run prompt:estilo`
- [x] T6 — Evals y e2e del estilo leído de la base; corrida real `[manual]`
- [x] T7 — Guía de operación y cierre documental

## Mapeo de escenarios por tarea (AGT13 5 + AGT18 3 + AGT19 3 + AGT20 3 + AGT21 3 + AGT22 3 = 20)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | AGT20 (3) | 3 |
| T2 | AGT18 (3); AGT19 (3) | 6 |
| T3 | AGT13 (5: los cuatro vigentes con el estilo del proveedor y «La versión del estilo queda en el log sin su contenido») | 5 |
| T4 | AGT21 (3) | 3 |
| T5 | AGT22 (3) | 3 |
| T6 | Casos de evals y e2e (sin escenarios nuevos) | 0 |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1.400 de autoría |
| 400-line budget risk | Medium: T2 y T4 pueden superarlo por tests (TDD, ~60 %) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No (fase y ADR-0020 aprobados el 2026-10-01; Q1 y Q2 resueltas).
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

| PR | Tareas | Estimado | Excepción anticipada | Comando enfocado | Rollback |
|---|---|---|---|---|---|
| PR1 | T1 + T2 | ~450 | Sí (lectura con caché y tests de Redis) | `npm test -- agente` + `npm run test:integracion -- agente` | Dejar de leer `parametro` |
| PR2 | T3 + T4 | ~450 | Sí (casos de uso y repositorio transaccional) | `npm test -- agente` + `npm run test:integracion -- agente` | Volver a `CargadorPrompts.estilo` |
| PR3 | T5 | ~300 | No | `npm test -- scripts` | Quitar el comando |
| PR4 | T6 + T7 | ~400 | Sí (parte documental sin riesgo) | `npm run evals` + `npm run test:e2e` + `npm run verify` | Revertir casos y documentos |

---

## T1 — `validarEstilo` y ADR-0020 aceptada

- **Qué**: función pura `agente/dominio/validar-estilo.ts` (AGT20); el dueño acepta el ADR-0020.
- **RED**: los tres escenarios de AGT20.
- **Estado**: hecha (2026-10-01; ADR-0020 aceptado). RED: `validar-estilo.spec.ts` sin el módulo; GREEN: 6/6. Constante
  `MAX_CARACTERES_ESTILO = 4000`; el motivo nombra la regla y nunca copia el texto (R14); el límite es inclusivo y
  un `$` sin cifras o la palabra «sku» sola no cuentan.

## T2 — Lectura del estilo

- **Qué**: puerto `RepositorioEstilo` (lectura), `ProveedorEstilo` con copia en memoria, versión en Redis
  `agente:prompt:version`, TTL de respaldo de 5 minutos por `Clock`, y respaldo en `estilo.v2.md` (AGT18, AGT19).
- **RED**: AGT18 (3) y AGT19 (3), este último con Redis real (integración) y con Redis caído.
- **Estado**: hecha (2026-10-01). RED: `proveedor-estilo.spec.ts` y `repositorio-estilo.spec.ts` sin los módulos; GREEN: unit 9/9,
  integración 6/6 contra Postgres y Redis reales, unit total 1050 pasan. `ProveedorEstilo` nunca lanza (base caída → archivo;
  Redis caído → sin copia, lee la base); la copia vive 5 min por `Clock`. `VersionEstiloRedis` usa `agente:prompt:version`;
  un estilo editado a mano sin versión se lee como versión 1. Aún no se registran en `AgenteModule` (lo hace T3, que los
  usa); `publicar` e historial entran en T4.

## T3 — El ensamblador usa el proveedor

- **Qué**: `EnsamblarPrompt` pide el estilo a `ProveedorEstilo`; `ContenidoLlm` loguea `version` y `versionEstilo`
  sin contenido (AGT13).
- **RED**: los escenarios de AGT13 sobre el proveedor y el log.
- **Estado**: hecha (2026-10-01). RED: 24 fallos (el constructor de `EnsamblarPrompt` ganó `ProveedorEstilo`, el log la
  `versionEstilo`); GREEN: unit 167/167 en `agente`. `PromptEnsamblado.versionEstilo` (`0` = archivo); el log del turno
  lleva `{ evento, version, versionEstilo }` y un test comprueba que ningún log copia el texto del estilo. `AgenteModule`
  registra `REPOSITORIO_ESTILO`, `VERSION_ESTILO` y `ProveedorEstilo`.

## T4 — Publicar, historial y restaurar

- **Qué**: `PublicarEstilo`, `RestaurarEstilo`, `ListarHistorialEstilo`; `RepositorioEstiloPrisma` escribe las tres
  claves en una transacción y después sube la versión en Redis (AGT21).
- **RED**: los tres escenarios de AGT21, contra Postgres y Redis reales.
- **Estado**: hecha (2026-10-01). RED: módulos inexistentes (`publicar-estilo.spec.ts` y `publicar-estilo.spec.ts` de integración);
  GREEN: unit 174/174 en `agente`, integración 12/12 contra Postgres y Redis reales (AGT21 ×3, versión en Redis, 5
  publicaciones simultáneas sin perder versiones, historial dañado). `RepositorioEstilo` gana `leerHistorial` y `publicar`
  (transacción con candado consultivo `pg_advisory_xact_lock` por clave: la primera publicación no tiene filas que bloquear;
  el driver no admite `$queryRaw` con `void`, por eso `$executeRaw`). `fecha` del historial = cuándo dejó de estar vigente.
  `PublicarEstilo` valida, guarda y sube la versión (si Redis falla ya está publicado); `RestaurarEstilo` publica el texto
  viejo como versión nueva y lo valida; `ListarHistorialEstilo` entrega vigente e historial. Registrados en `AgenteModule`.

## T5 — Comando `prompt:estilo`

- **Qué**: `scripts/prompt-estilo.ts` registrado en `scripts/cli.ts` y en `package.json`; acciones `ver`,
  `historial`, `publicar --archivo`, `restaurar --version`; sin texto del estilo en logs (AGT22).
- **RED**: los tres escenarios de AGT22.
- **Estado**: hecha (2026-10-01). RED: `prompt-estilo.spec.ts` sin el módulo; GREEN: unit 210/210 (`scripts` + `agente`) e integración
  de punta a punta 5/5 con el contexto real de Nest, Postgres y Redis, más una corrida real por `npm run prompt:estilo`
  (ver, publicar, historial, inválido con salida 1). **Desviación**: el comando necesitaba componer el estilo sin el LLM,
  los leads ni las colas, así que `ProveedorEstilo`, los casos de uso y `CargadorPrompts` pasaron a un `EstiloModule`
  que `AgenteModule` importa y el barril de `agente` exporta (sin rutas internas desde `scripts/`). `publicar`,
  `restaurar` e `historial` nunca copian el texto; `ver` sí lo muestra en la terminal de quien lo pide.

## T6 — Evals y e2e

- **Qué**: caso de evals y e2e donde un estilo publicado cambia el prompt del turno siguiente sin reiniciar, el
  respaldo cuando falta y `restaurar`.
- **`[manual]`**: corrida real (`EVALS_MODO=real`) con el estilo que el dueño quiera probar (EVL3), por ejemplo
  `EVALS_MODO=real EVALS_ESTILO=./mi-estilo.md npm run evals` (clave de OpenAI; el estilo se publica solo en la base de la corrida).
- **Estado**: hecha en lo automático (2026-10-01); la corrida real queda pendiente del dueño. Dos e2e nuevos
  (`agente-llm`, 12/12): publicar un estilo cambia el prompt del siguiente mensaje sin reiniciar y conserva las reglas;
  restaurar devuelve el estilo anterior. No hubo RED clásico (el comportamiento ya existía desde T2-T4): se hizo una
  **prueba de mutación**, quitando a propósito `incrementar()` de `PublicarEstilo`, y los dos e2e fallaron; se
  restauró el código. **Agregado fuera del mapeo**: `EVALS_ESTILO=<ruta>` (ayudante `estilo-candidato.ts`, 5 tests
  unitarios y un caso de evals) publica un estilo candidato en la base **de la corrida** por el mismo caso de uso del
  comando, para medirlo con el LLM real antes de publicarlo; un estilo inválido o un archivo ilegible detiene la
  corrida sin copiar el texto. Evals guionadas: 35 pasan, APROBADA.

## T7 — Guía de operación y cierre

- `docs/operacion/estilo-del-bot.md` (cómo editar, volver atrás y qué no se puede tocar); deltas fusionados en
  `openspec/specs/agente`; `docs/fases/README.md`; P45 anotada; `verify-report.md`; archivar el change.
- **Estado**: hecha (2026-10-01). Guía en `docs/operacion/estilo-del-bot.md` (qué se puede editar, flujo recomendado con
  `EVALS_ESTILO`, comandos, motivos de rechazo, volver atrás, síntomas). Delta fusionado en `openspec/specs/agente`
  (25→30 requisitos, 77→93 escenarios: AGT13 modificado con 1 escenario nuevo y AGT18-AGT22 con 15). `docs/fases/README.md`
  (08c cerrada con `[manual]`), `docs/PREGUNTAS_ABIERTAS.md` (P45 con su destino), `CLAUDE.md` (comando, `EVALS_ESTILO` y
  mapa de documentación), `docs/CONTEXTO_SESIONES.md`, `verify-report.md` y change archivado.
