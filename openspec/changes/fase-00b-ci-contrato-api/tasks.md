# Tasks: Fase 00b — CI y contrato de API

Review requerida: **RDD** (00b no es una de las fases 04, 05, 06, 10 de `docs/fases/README.md`; no
requiere `judgment-day`).

Convención de conteo de esta fase (`openspec/config.yaml` §rules.tasks, "Máximo 10 tareas por
change"): cada **tarea** de este archivo (`T1`…`T7`) es una unidad de trabajo completa que termina
en **un solo commit** y corresponde 1:1 a uno de los siete slices que `design.md` ya dejó definidos
en su sección "Migration / Rollout" (S1…S7, con línea estimada de autoría cada uno). Los pasos
numerados dentro de cada tarea (RED/GREEN/REFACTOR, checkpoints `[sin verificar]`, escenarios) son
la ejecución de esa única tarea, no tareas adicionales — el mismo criterio que aplicó
`design.md` al razonar que "siete slices... caben en el límite de 10 tareas si `sdd-tasks` mapea una
tarea por slice", y el mismo formato que usó `tasks.md` de la Fase 00a (`T1`…`T10`).

**Resultado: 7 tareas, dentro del límite de 10.** La pregunta abierta Q3 de `proposal.md` ("si
`sdd-tasks` supera las 10 tareas, ¿se parte la fase en 00b1/00b2?") **no se activa**: el desglose
real cabe completo sin comprimir trabajo. No se propone partir la fase.

## Checklist

Estado de avance que lee `gentle-ai sdd-status`. Se marca `[x]` solo con el test de la tarea en
verde y su commit anotado.

- [x] T1 — Puerta local: hooks, `commitlint`, `gitleaks`, `npm audit`, `herramientas.ts` (S1)
- [x] T2 — Errores RFC 9457 + pipe nativo + fixture de contrato (S2)
- [x] T3 — Documento OpenAPI determinista (interno + público) y su chequeo de deriva (S3)
- [ ] T4 — `GET /health` en el contrato interno y `/docs` con Scalar (S4)
- [ ] T5 — Lint (Spectral) y diff (oasdiff) del contrato (S5)
- [ ] T6 — Workflow de GitHub Actions y `npm run ci` (S6)
- [ ] T7 — Cierre: `git-cliff`, `strict_tdd: true`, `coverage_threshold`, documentación (S7)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2110 líneas de autoría (350+380+400+330+250+180+220, `design.md` §"Migration / Rollout"; `openapi/*.json`, `package-lock.json` y `CHANGELOG.md` excluidos por ser generados) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 → PR6 → PR7 (7 slices, ver abajo) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

`Decision needed before apply: No` porque `auto-chain` ya trae la cadena `stacked-to-main` cacheada
desde el preflight de sesión y desde "Entrega" de `proposal.md`/`design.md`; `sdd-apply` procede con
el primer slice (T1) sin pedir confirmación adicional.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | T1: hook pre-push + `commitlint` + `gitleaks` + `npm audit` + `herramientas.ts` (Docker fijado) | PR1 | `npm test -- fronteras` (incluye los specs nuevos de `commitlint`, resolución de raíz, rango de commits, auditoría) | `git push --no-verify` vs. un `git push` real contra un commit con un secreto de prueba y un mensaje sin tipo, en la máquina de desarrollo (mide el presupuesto de 60 s) | Revertir `.githooks/`, la línea `prepare` de `package.json`, `commitlint.config.js`, `.gitleaks.toml`, `auditoria-excepciones.json`, `.gitattributes`, `scripts/herramientas.ts`, `scripts/buscar-secretos.ts`, `scripts/verificar-commits.ts`, `scripts/auditar-dependencias.ts` y sus specs; nada más existe todavía |
| 2 | T2: `plataforma/errores` (RFC 9457) + `StandardSchemaValidationPipe` global + fixture de contrato (D3) | PR2 | `npm test -- errores contrato` | `npm run test:e2e` (los casos de 00a siguen en verde; no hay caso nuevo de e2e todavía, se agrega en T4) | Revertir `src/plataforma/errores/**`, quitar `ErroresModule` de `app.module.ts` y `useGlobalPipes` de `configurar-aplicacion.ts`, revertir `test/contrato/fixture/**` |
| 3 | T3: `plataforma/documentacion` (construir/filtrar/ordenar/serializar) + `scripts/generar-contrato.ts` + `scripts/verificar-deriva-contrato.ts` + regla 11 de fronteras + `contrato:deriva` en `verify` | PR3 | `npm test -- documentacion fronteras` (incluye la regla 11 nueva) | `npm run contrato:generar && npm run contrato:deriva` (dos ejecuciones consecutivas deben coincidir byte a byte) | Revertir `src/plataforma/documentacion/**`, `scripts/generar-contrato.ts`, `scripts/verificar-deriva-contrato.ts`, `openapi/openapi.json`, `openapi/openapi.interno.json`, la regla 11 de `.dependency-cruiser.cjs` y el paso `contrato:deriva` de `verify` |
| 4 | T4: `esquemaRespuestaSalud` + `respuestaDesdeZod` + `@ApiTags('internal')` + `FiltroSaludOperativo` + `setGlobalPrefix` con exclusión + `DOCS_HABILITADO` + Scalar | PR4 | `npm test -- salud documentacion contrato` | `npm run start:dev` + `curl -i localhost:3000/docs` (`404` con `DOCS_HABILITADO=false`, `200` con `true`) + `npm run test:e2e` (nuevo caso: `/health` real valida contra `esquemaRespuestaSalud`) | `DOCS_HABILITADO=false` apaga `/docs` sin desplegar código; revertir `esquema-respuesta.ts`, `filtro-salud-operativo.ts`, los decoradores de `salud.controller.ts`, `montar-documentacion.ts`, la variable en `plataforma/config` y `openapi/*.json` regenerados |
| 5 | T5: `.spectral.yaml` + `scripts/comparar-contrato.ts` (política "sin base", D11) | PR5 | `npm test -- comparar-contrato` (casos: con base, sin base, sin rama `main`, Docker caído) | `npm run contrato:lint && npm run contrato:diff` contra el propio historial local (primer PR de la cadena: debe imprimir `SIN BASE DE COMPARACIÓN` sin fallar) | Revertir `.spectral.yaml`, `scripts/comparar-contrato.ts` y los dos pasos nuevos de `ci` |
| 6 | T6: `.github/workflows/ci.yml` + `scripts/validar-flujos.ts` (`actionlint`) + composición final de `npm run ci` | PR6 | `npm test -- validar-flujos` | `npm run ci` completo en local, con Docker arriba (mide el tiempo total; valida que corre en el orden de la pirámide, CI7) | Revertir `.github/workflows/ci.yml`, `scripts/validar-flujos.ts` y el script `ci` de `package.json` |
| 7 | T7: `cliff.toml` + `CHANGELOG.md`, `strict_tdd: true`, `coverage_threshold` medido (D15), documentación (`CLAUDE.md`, skill, `docs/fases/README.md`, `docs/migracion/inventario.md`) | PR7 | `npm run test:cobertura` (mide el umbral antes de fijarlo) y `npm run changelog` | `npm run verify` completo en verde (siete comprobaciones) | Revertir `cliff.toml`, `CHANGELOG.md`, la línea `strict_tdd` de `openspec/config.yaml`, `coverage.thresholds` de `vitest.config.ts` y los cambios de documentación; no toca código de producción |

Diagrama de dependencia (cadena lineal, `stacked-to-main`; cada PR se fusiona a `main` en orden
antes de abrir el siguiente — mismo orden que "Migration / Rollout" de `design.md`):

```
PR1 (puerta local) → PR2 (errores+pipe+fixture) → PR3 (documento determinista)
   → PR4 (/health+/docs) → PR5 (Spectral+oasdiff) → PR6 (workflow+ci) → PR7 (cierre)
```

Nota de dependencias reales: PR3 genera y commitea `openapi/openapi.json` y
`openapi/openapi.interno.json` **antes** de que `/health` lleve la etiqueta `internal` (esa
etiqueta llega en PR4). Esto es intencional y transitorio: en el estado de PR3, `/health` todavía
aparece en el documento **público** (no hay nada que lo excluya todavía), y el chequeo de deriva de
PR3 solo verifica que "lo generado coincide con lo commiteado", no el contenido final exigido por
API8. PR4 **regenera ambos documentos** en su propio commit, momento en el que `/health` pasa a
excluirse del público y el documento público queda con `paths: {}` (Success Criteria de
`proposal.md`). T3 y T4 dejan esta transición anotada explícitamente para que `sdd-apply` no la
confunda con una deriva no intencional.

## Matriz de amenazas aplicable a esta fase

Reproducida sin cambios desde la tabla `Threat Matrix` de `design.md` (regla del skill: las filas
`Aplicable` pasan a `tasks.md` sin cambios). Las filas `N/A` de `design.md` ("Rutas tipo
documentación", "Comandos de PR") no aplican a esta fase y se omiten aquí.

| Frontera | Casos adversarios mínimos | Respuesta de diseño | Tests RED planeados | Dónde se cubre |
|---|---|---|---|---|
| Selección del repositorio git | `git -C`, ruta relativa, ruta absoluta | Todos los scripts (`verificar-commits.ts`, `comparar-contrato.ts`, `buscar-secretos.ts`) resuelven la raíz **una vez** con `git rev-parse --show-toplevel` y usan esa ruta absoluta para el `cwd` de git y el montaje `-v <raíz>:/repo` de Docker; ningún script usa `process.cwd()` directamente ni acepta la raíz por argumento; si `rev-parse` falla, el script falla nombrando el problema, **nunca** cae a `.` | Un test que ejecuta el resolvedor desde un subdirectorio (`test/contrato/`) y afirma que devuelve la raíz del repositorio, no el subdirectorio | T1 (se implementa el resolvedor en `scripts/herramientas.ts`); T5 reutiliza el mismo helper sin volver a probarlo |
| Estado del índice | staged, `commit -a`, índice vacío | `secretos --arbol` escanea el árbol de trabajo (incluye cambios sin *stage*); `commits` opera **solo** sobre commits ya creados, así que un índice vacío o sucio no lo afecta; el límite conocido (secreto borrado del árbol pero presente en un commit del push) queda cubierto por `secretos:historial` en `ci`, documentado en D8, no disfrazado | Un test con un rango vacío (`merge-base == HEAD`): `commits` termina en verde sin analizar nada y lo dice explícitamente en su salida | T1 |
| Estado del push | rama con *upstream*, primer push, refspec explícito | El hook `pre-push` **ignora** el refspec que git le pasa por stdin y corre siempre el mismo `ci:hook`, sin deducir qué se está empujando; el rango de `commits` sale de `merge-base(main, HEAD)`, que existe con o sin remoto; `LUXE_COMMITS_DESDE` permite fijarlo explícitamente al rebasar | Un test que fija `LUXE_COMMITS_DESDE` a un SHA conocido y afirma el rango resultante; y el caso "rama == main" (rango vacío, verde) | T1 |

Regla transversal (aplica a T1 y a todo script que reutilice `herramientas.ts`, incluido T5):
`ejecutarHerramienta` y los scripts de git usan `spawn` con **array de argumentos**, nunca
`shell: true` ni concatenación de cadenas, así que una ruta con espacios
(`C:\Users\ASUS\Desktop\Project Dani\...` — la ruta real de este repositorio) no puede partirse en
dos argumentos ni inyectar un comando. Test RED: el resolvedor de raíz y el helper de Docker se
ejercitan desde una ruta con espacios (T1).

---

## T1 — Puerta local: hooks, `commitlint`, `gitleaks`, `npm audit`, `herramientas.ts`

**Objetivo**: instalar la puerta de calidad local completa (CI1-CI4) sin depender de que el
repositorio tenga un remoto: hook `pre-push` con el subconjunto rápido, `commit-msg` con
`commitlint`, detección de secretos con `gitleaks`, auditoría de dependencias con `npm audit`, y el
helper único que invoca las tres herramientas Go vía Docker (D10).

**Dependencias**: ninguna (primera tarea de la fase; parte del estado que dejó la Fase 00a cerrada).

**Archivos/áreas** (design D8, D9, D10, D13, D14):
- `.githooks/pre-push`, `.githooks/commit-msg` (Create) — D9; LF obligatorio.
- `.gitattributes` (Create) — `* text=auto eol=lf` + reglas para `openapi/*.json` y `.githooks/*`
  (D2, D9; esta tarea solo necesita la parte de D9, T3 añade la de `openapi/*.json`).
- `commitlint.config.js` (Create) — `@commitlint/config-conventional` + regla propia
  `sin-atribucion-ia` (D13).
- `.gitleaks.toml` (Create) — allowlist versionada, una entrada por falso positivo con motivo (D14).
- `auditoria-excepciones.json` (Create) — excepciones de `npm audit` con `id`, `paquete`, `motivo`,
  `fecha`, `revisar_antes_de` (D14).
- `scripts/herramientas.ts` (Create) — `IMAGEN_GITLEAKS`, `IMAGEN_OASDIFF`, `IMAGEN_ACTIONLINT`
  (etiqueta + digest exactos), `resolverRaizRepositorio()` (`git rev-parse --show-toplevel`),
  `ejecutarHerramienta(imagen, argumentos, opciones)` con `spawn` y array de argumentos (D10).
- `scripts/buscar-secretos.ts` (Create) — `--arbol` (hook) y `--historial` (CI, D8).
- `scripts/verificar-commits.ts` (Create) — rango `merge-base(main, HEAD)..HEAD` u override por
  `LUXE_COMMITS_DESDE`, `@commitlint/lint` sobre cada mensaje del rango (D8, D13).
- `scripts/auditar-dependencias.ts` (Create) — `npm audit --json`, umbral `high`, excepciones no
  vencidas (D14).
- `package.json` (Modify) — `prepare` (D9: `git config core.hooksPath .githooks || exit 0`),
  `herramienta` (`vite-node --config vitest.config.ts`, D12), scripts atómicos `secretos`,
  `secretos:historial`, `commits`, `auditoria`, y el primer `ci:hook` (D8, todavía sin
  `contrato:deriva`, que llega en T3 — dejar el placeholder documentado en el propio script o
  agregarlo tal cual quede en T3 sin que este commit necesite tocarlo de nuevo).
- Dependencias nuevas (`devDependencies`): `@commitlint/cli`, `@commitlint/config-conventional`,
  `vite-node`.
- `test/fronteras/` (Modify/Create) — specs nuevos para cada script (ver Escenarios).

**Checkpoints `[sin verificar]` de esta tarea** (design.md, nota inicial y D10/D12):

1. **(d) Estabilidad de `vite-node`**: antes de escribir los demás scripts, confirmar que
   `vite-node --config vitest.config.ts scripts/herramientas.ts` ejecuta un script trivial de
   TypeScript con decoradores sin fallar. Si falla o su API resulta inestable, aplicar el fallback
   ya decidido en D12: compilar con `nest build` (agregando `scripts/` a `tsconfig.build.json`) y
   ejecutar desde `dist/`, sacando `contrato:deriva` del hook (se decide en T3, no aquí, porque
   `contrato:deriva` no existe todavía) para no pagar el build en cada push. Registrar el resultado
   en este archivo, en la sección "Hecho cuando".
2. **(e) Montaje de volúmenes Docker con rutas de Windows con espacios**: probar
   `ejecutarHerramienta` en la máquina real de desarrollo (`C:\Users\ASUS\Desktop\Project Dani\...`)
   antes de dar la tarea por cerrada. Si `docker run -v "C:\...:/repo"` falla por el espacio en la
   ruta, convertir la ruta a formato `/c/...` **dentro del helper**, en un solo sitio, y registrar la
   desviación aquí.

**Escenarios cubiertos** (`specs/integracion-continua/spec.md`):
- `CI1 — Un error de lint bloquea el push`
- `CI1 — El hook se salta explícitamente`
- `CI1 — El hook no corre tests de integración`
- `CI2 — Mensaje sin tipo válido rechazado`
- `CI2 — Mensaje con atribución de IA rechazado`
- `CI2 — Mensaje convencional válido aceptado`
- `CI3 — Un secreto detectado bloquea el push`
- `CI3 — Un falso positivo se resuelve con allowlist versionada`
- `CI4 — Vulnerabilidad sobre el umbral bloquea el build`
- `CI4 — Vulnerabilidad bajo el umbral no bloquea el build`

Más los tres tests de la Matriz de amenazas aplicable (arriba): resolución de raíz desde
subdirectorio, resolución de raíz desde ruta con espacios, rango vacío de `commits`, y
`LUXE_COMMITS_DESDE` fijado a un SHA conocido.

**RED → GREEN → REFACTOR**:

1. RED: escribir el checkpoint (d) como un test trivial (`vite-node` ejecuta un script de una línea)
   y observar el resultado real (pasa o falla) antes de construir nada más sobre él.
2. RED: `test/fronteras/herramientas.spec.ts` — resolución de raíz desde `test/contrato/` (todavía
   no existe ese directorio; usar cualquier subdirectorio real del repo) y desde una ruta con
   espacios simulada; `ejecutarHerramienta` construye el comando `spawn` con array de argumentos
   (afirmar los argumentos exactos, no un string). Correr `npm test -- herramientas` y observar
   fallo (el módulo no existe).
3. RED: `test/fronteras/commitlint.spec.ts` — los tres casos de CI2 (mensaje sin tipo, con
   `Co-Authored-By`, válido) vía `@commitlint/lint`. Observar fallo.
4. RED: `test/fronteras/buscar-secretos.spec.ts` — un secreto de mentira en un archivo temporal
   hace fallar el script; el mismo secreto en `.gitleaks.toml` como excepción no lo reporta.
   Observar fallo (script no existe).
5. RED: `test/fronteras/verificar-commits.spec.ts` — rango vacío (`main == HEAD`) termina en verde
   sin analizar nada, dejándolo dicho en la salida; `LUXE_COMMITS_DESDE` fijado a un SHA conocido
   produce el rango esperado. Observar fallo.
6. RED: `test/fronteras/auditar-dependencias.spec.ts` — una vulnerabilidad simulada por encima del
   umbral falla nombrando paquete y severidad; una por debajo no falla; una excepción vencida
   (`revisar_antes_de` en el pasado) falla nombrándola. Observar fallo.
7. GREEN: implementar `herramientas.ts`, `buscar-secretos.ts`, `verificar-commits.ts`,
   `auditar-dependencias.ts`, `commitlint.config.js` hasta que los cinco specs pasen.
8. GREEN: componer `ci:hook` en `package.json` (`lint && typecheck && test && secretos && commits` —
   sin `contrato:deriva` todavía, T3 lo agrega) y los hooks `.githooks/pre-push`/`commit-msg`;
   `npm install` ejecuta `prepare` sin romper en una máquina sin git (`|| exit 0`).
9. REFACTOR: extraer los mensajes de error de cada script para que nombren siempre la comprobación
   que falló (requisito 1 de la proposal: "nunca en silencio").

**Hecho cuando**:
- Los diez escenarios de CI1-CI4 pasan.
- Los tres tests de la Matriz de amenazas aplicable pasan.
- El checkpoint (d) queda resuelto y registrado (`vite-node` confirmado estable, o fallback a
  `nest build` + `dist/` aplicado y documentado aquí).
- El checkpoint (e) queda resuelto y registrado (Docker con rutas de Windows con espacios funciona,
  o la conversión a `/c/...` queda aplicada dentro de `ejecutarHerramienta`).
- El hook `pre-push` completo (`ci:hook`, sin `contrato:deriva` todavía) corre en **≤ 60 s** en la
  máquina de desarrollo real; el tiempo medido queda anotado aquí. Si se pasa del presupuesto, sacar
  `secretos` del hook (D10) antes que cualquier otra comprobación, y registrar el cambio.
- `git push --no-verify` completa sin correr el hook y lo dice en la terminal.

**Checkpoints resueltos en esta tarea (máquina real, 2026-09-24):**

- **(d) `vite-node`**: estable. `vite-node --config vitest.config.ts <script>.ts` ejecuta sin
  problema un script con decoradores TypeScript **cuando el archivo vive dentro de la raíz del
  repositorio** (`unplugin-swc` resuelve su configuración relativa a la raíz; un archivo fuera del
  repo, probado primero en `/tmp`, falla con `Syntax Error`). No hizo falta el fallback a
  `nest build` + `dist/`. Desviación descubierta y resuelta en el mismo checkpoint: bajo `vite-node`
  el patrón `import.meta.url === file://${process.argv[1]}` para detectar "soy el entrypoint de
  CLI" **no funciona** — `vite-node` reemplaza `process.argv[1]` por la ruta de su propio
  `cli.mjs` y nunca expone la ruta del script objetivo en `argv`. Se resolvió sacando todo
  disparo de CLI a un único archivo nuevo, `scripts/cli.ts` (que ningún test importa), dejando
  `buscar-secretos.ts`, `verificar-commits.ts` y `auditar-dependencias.ts` como librerías puras sin
  código de nivel superior. Documentado también en el encabezado de `scripts/cli.ts`.
- **(e) Docker + rutas de Windows con espacios**: funciona **sin conversión**. `docker run -v
  "<raíz>:/repo"` con la salida literal de `git rev-parse --show-toplevel`
  (`C:/Users/ASUS/Desktop/Project Dani/LuxeBorealCRM`, con espacio y sin comillas adicionales
  porque `spawn` recibe un array) monta correctamente vía `spawn` con array de argumentos; no hizo
  falta convertir a `/c/...`. Hallazgo adicional no anticipado por el diseño: montar la **raíz
  completa** del repositorio (con `node_modules/` instalado) para el escaneo de `gitleaks --arbol`
  tardó **56-65 s** solo por el costo de la virtualización de archivos de Docker Desktop en Windows
  sobre miles de archivos de `node_modules/` — sobrepasando el presupuesto de 60 s del hook por sí
  solo. Se resolvió sin tocar `ejecutarHerramienta` (que sigue montando un único origen genérico,
  D10 sin cambios): `buscar-secretos.ts` construye un directorio temporal con
  `git ls-files --cached --others --exclude-standard` (respeta `.gitignore` automáticamente, sin
  enumerar `node_modules/`/`dist/`/`coverage/` a mano) y monta **ese** directorio en vez de la
  raíz completa. Con esta mitigación, `secretos --arbol` real contra este repositorio tarda
  **~3.5 s**.
- **Tiempo real del hook completo** (`npm run ci:hook` = lint + typecheck + test unitario +
  secretos + commits, máquina real, Docker arriba): **~20-21 s**, dentro del presupuesto de 60 s.
  No hizo falta sacar `secretos` del hook.
- **Hallazgo no anticipado, fuera del alcance de esta tarea para corregir**: `commits`
  (rango `merge-base(main, HEAD)..HEAD`) reporta **7 de 56** commits inválidos en la rama real
  `fase-00b-ci-contrato-api` — todos por la regla por defecto de `@commitlint/config-conventional`
  `body-max-line-length`/`footer-max-line-length` (100 caracteres), en commits de la Fase 00a
  escritos **antes** de que existiera esta herramienta. `npm run ci:hook` real contra esta rama
  falla hoy en el paso `commits` por esta deuda histórica, no por ningún commit nuevo de esta
  tarea. No se reescribió el historial (`git rebase`/`commit --amend` en 56 commits ya
  compartidos es destructivo y fuera de lo que esta tarea debe decidir unilateralmente). Queda
  registrado para que el usuario decida: fijar `LUXE_COMMITS_DESDE` al último commit de 00a para
  los pushes de esta rama (D8 ya contempla esta variable exactamente para "rebasar"), o aceptar
  que el hook solo queda limpio una vez que esta rama se fusione a `main` y las ramas futuras
  arranquen sin la deuda. Verificado con un `git push` real (sin `--no-verify`) contra un
  repositorio bare local temporal: el hook corrió, bloqueó el push exactamente en `commits`, e
  imprimió el mensaje de bloqueo esperado; `git push --no-verify` contra el mismo repositorio
  completó al instante sin ejecutar el hook.

  **Decisión del usuario (2026-09-24)**: fijar `LUXE_COMMITS_DESDE` al último commit de la Fase 00a
  (`f3fd4d3`, "fix(openspec): corregir referencias y conteos tras el archivado de 00a" — el commit
  inmediatamente anterior al primer commit de esta fase, `403693e`). Quien empuje desde esta rama
  antes de que se fusione a `main` MUST exportar `LUXE_COMMITS_DESDE=f3fd4d3` en su shell (no se
  persiste en `.env`: `verificar-commits.ts` lee `process.env` directamente y no hay carga de
  `.env` en los scripts de `scripts/cli.ts`, D12). Con esa variable fijada, `commits` solo analiza
  los commits de la Fase 00b en adelante; el rango vuelve a `merge-base(main, HEAD)` automáticamente
  en cuanto la rama se fusione, sin que nadie tenga que desfijar nada.
- Excepciones reales registradas en `auditoria-excepciones.json` (D14): `npm audit` sobre este
  repositorio, hoy, reporta 5 hallazgos `high` (`deepmerge-ts`, `lodash`, `mysql2`,
  `@prisma/config`, `prisma`), todos transitivos de la CLI de Prisma vía su soporte de MySQL (que
  este proyecto no usa; ADR-0001 fija PostgreSQL) o de `deepmerge-ts`. El único fix disponible en
  los cinco casos exige bajar `prisma` de `7.10.0` a `6.19.3` (cambio de major), fuera de alcance
  de esta tarea. Documentado con motivo, fecha y `revisar_antes_de: 2026-12-24` en cada entrada;
  `npm run auditoria` real queda en verde con la fecha de hoy.

**Nota de presupuesto de revisión (Section E del protocolo SDD)**: el diff real de esta tarea es
**~1231 líneas de autoría** (`git diff --cached --numstat`, excluyendo `package-lock.json`),
frente a la estimación de ~350 de `design.md`/este archivo. La diferencia es honesta, no
compresión pendiente: cinco scripts nuevos (`herramientas.ts`, `buscar-secretos.ts`,
`verificar-commits.ts`, `auditar-dependencias.ts`, `cli.ts`) con su cobertura RED→GREEN completa
por script (26 tests nuevos, incluidos los tres casos de la matriz de amenazas), más
`commitlint.config.js`, dos hooks, `.gitattributes`, `.gitleaks.toml` y
`auditoria-excepciones.json`. No se recortaron tests, comentarios ni documentación para acercarse
al presupuesto (prohibido explícitamente por el protocolo). T1 es una sola tarea/commit indivisible
por convención de este `tasks.md`; se recomienda `size:exception` para este PR1 de la cadena
`stacked-to-main`, o que el usuario confirme el exceso antes de continuar con T2.

**Decisión del usuario (2026-09-24)**: `size:exception` aceptado para PR1 (T1). El exceso viene de
cobertura de tests real y completa, no de alcance innecesario; no se reescribe el commit ya creado
ni se parte en varios. Los PR2-PR7 restantes siguen su estimación normal (~1760 líneas combinadas);
si alguno se desvía de forma similar, se vuelve a preguntar en ese momento, no se asume la misma
excepción por adelantado.

**commit:** `77f78a4935c9740620909c4792dc79a8c6f836c7` — `feat(ci): agregar hooks locales, commitlint, gitleaks y auditoria de dependencias`

---

## T2 — Errores RFC 9457 + pipe nativo + fixture de contrato

**Objetivo**: `plataforma/errores` (catálogo de códigos estables + filtro global `problem+json`),
`StandardSchemaValidationPipe` global (soporte nativo de NestJS 12), y el controlador *fixture* de
`test/contrato/` que ejercita el pipeline sin ampliar la superficie pública real (D3).

**Dependencias**: T1 (no técnica; se mantiene el orden de slices de `design.md`. `ci:hook` de T1 ya
corre `lint`/`typecheck`/`test`, que esta tarea usa sin cambios).

**Archivos/áreas** (design D3, D5, árbol de D4):
- `src/plataforma/errores/index.ts`, `catalogo-codigos.ts`, `error-de-aplicacion.ts`,
  `construir-problema.ts` (+ `.spec.ts`), `filtro-problem-json.ts`, `errores.module.ts` (Create) —
  `CATALOGO_CODIGOS` congelado, `CodigoError` derivado de sus claves, `Problema`, `DetalleCampo`,
  `ErrorDeAplicacion`, `FiltroProblemJson` (registra `APP_FILTER`).
- `src/app.module.ts` (Modify) — importa `ErroresModule`.
- `src/configurar-aplicacion.ts` (Modify) — `app.useGlobalPipes(new StandardSchemaValidationPipe())`
  (sin tocar todavía `setGlobalPrefix` ni `montarDocumentacion`, que llegan en T4).
- `test/contrato/fixture/contrato-fixture.module.ts` (+ controller y esquemas zod) (Create) — D3:
  `GET|POST /api/v1/ejemplos` (`listarEjemplos`, `crearEjemplo`), `GET /api/v1/ejemplos/falla`
  (`fallarEjemplo`), `GET /api/v1/ejemplos/interno` (`obtenerEjemploInterno`, etiquetado
  `internal` — el filtro de D1 se implementa en T3; en esta tarea la etiqueta ya se declara en el
  fixture aunque el filtro que la usa todavía no exista).
- `test/contrato/**` (Create) — tests HTTP con Supertest sobre
  `Test.createTestingModule({ imports: [AppModule, ContratoFixtureModule] })`.

**Checkpoint `[sin verificar]` de esta tarea** (design.md D5):

**(b) Forma exacta de la excepción de `StandardSchemaValidationPipe`**: antes de escribir
`filtro-problem-json.ts`, inspeccionar qué excepción lanza el pipe nativo de NestJS 12 sobre un
payload inválido (probablemente `BadRequestException` con los *issues* de Standard Schema). Si los
*issues* permiten clasificar `falta`/`formato`/`valor` (mismo vocabulario que PLT1), mapearlos así
en `DetalleCampo`; si no lo permiten, emitir `problema: "formato"` para todos y registrar la
desviación aquí. La regla que **no** se relaja en ningún caso: la respuesta nunca repite el valor
recibido.

**Escenarios cubiertos** (`specs/api/spec.md` delta, `openspec/changes/fase-00b-ci-contrato-api/specs/api/spec.md`):
- `API4 — Error de validación en formato problem+json`
- `API4 — Error no manejado no filtra detalles internos`
- `API4 — El código de error se mantiene estable entre despliegues`
- `API3 — Dinero como entero, nunca decimal` (spec vigente `openspec/specs/api/spec.md`, sin delta)
- `API3 — Fecha en ISO 8601 UTC` (idem)
- `API2 — Ruta con prefijo y nombre de recurso en español` (idem; primer escenario diferido de 00a,
  ejercitado con el fixture, no con un recurso de negocio real)
- `API2 — operationId estable entre despliegues` (idem; segundo escenario diferido de 00a)

**RED → GREEN → REFACTOR**:

1. RED: `construir-problema.spec.ts` — código → `{ type, title, status, codigo }`; nunca incluye
   valores recibidos. Correr y observar fallo (función no existe).
2. RED: el checkpoint (b) como test exploratorio: montar el pipe sobre un endpoint mínimo del
   fixture y capturar la forma real de la excepción antes de escribir el mapeo definitivo.
3. RED: `test/contrato/errores.e2e-spec.ts` (o el nombre que fije la tarea) — payload inválido a
   `POST /api/v1/ejemplos` responde `application/problem+json` con código estable y sin el valor
   recibido (API4); `GET /api/v1/ejemplos/falla` responde `500` problem+json sin `err.message` ni
   stack (API4). Observar fallo (rutas no existen).
4. RED: `test/contrato/convenciones.e2e-spec.ts` — la respuesta de `listarEjemplos` tiene UUID,
   fecha ISO 8601 UTC y dinero entero (API3); la ruta empieza con `/api/v1` (API2); el
   `operationId` se mantiene igual en dos generaciones sucesivas del código sin cambiar el contrato
   (API2 — se verifica comparando dos ejecuciones del mismo test, no el documento OpenAPI, que
   llega en T3). Observar fallo.
5. GREEN: implementar `CATALOGO_CODIGOS`, `ErrorDeAplicacion`, `FiltroProblemJson`,
   `ErroresModule`, el pipe global y el módulo *fixture* hasta que los cuatro specs pasen.
6. REFACTOR: confirmar que ningún código fuera de `CATALOGO_CODIGOS` compila como `CodigoError`
   (prueba de tipos, no en runtime); limpiar duplicación entre `construirProblema` y el filtro.

**Hecho cuando**:
- Los siete escenarios listados pasan.
- El checkpoint (b) queda resuelto y registrado (forma real de la excepción confirmada, o el
  fallback `problema: "formato"` aplicado).
- El fixture **no** se importa desde ningún archivo de `src/` (verificable a simple vista; la regla
  de fronteras que lo hace estructuralmente imposible, `src-no-importa-test`, ya existe desde 00a).

**Checkpoint (b) resuelto (máquina real, 2026-09-24):** leyendo el código real de zod v4
(`node_modules/zod/v4/core/util.js#finalizeIssue`) en vez de solo probarlo en caliente: los issues
que entrega `schema['~standard'].validate(value)` (el método que usa el
`StandardSchemaValidationPipe` nativo) sí traen `code` (`invalid_type`, `too_small`, etc.), pero
**nunca** el valor recibido (`input`) — zod solo lo adjunta cuando el contexto de validación pide
`reportInput`, algo que `validate(value)` de Standard Schema nunca solicita (su firma no acepta
ese segundo argumento). Sin embargo, `code` por sí solo no permite distinguir `falta` (la clave no
vino) de `formato` (vino con el tipo equivocado) sin ese valor, así que se aplicó el fallback que
el propio checkpoint anticipó: `problema: "formato"` para **todos** los campos, de forma uniforme
(clasificar parcialmente por código daría una falsa impresión de precisión que no existe para
`invalid_type`). La regla que no se relaja — nunca repetir el valor recibido — quedó verificada con
un test que envía un issue con un campo `input` espurio y confirma que `fabricaErrorValidacion` no
lo copia (`fabrica-error-validacion.spec.ts`) y con el e2e de contrato
(`test/contrato/errores.spec.ts`, `not.toContain('no-es-un-numero')`).

**Desviación registrada (no anticipada por `design.md`/este archivo):** en vez de dejar
`new StandardSchemaValidationPipe()` con su `exceptionFactory` por defecto (que aplana cada issue
a una cadena `"campo: mensaje"` y pierde la estructura, D5 lo describía sin este detalle), se le
pasó un `exceptionFactory` propio (`fabricaErrorValidacion`, D5) que construye directamente un
`ErrorDeAplicacion('validacion-fallida', ...)`. Sigue siendo el pipe nativo sin fork
(`exceptionFactory` es su propio punto de extensión documentado en
`@nestjs/common/pipes/standard-schema-validation.pipe.d.ts`); la alternativa (parsear las cadenas
`"campo: mensaje"` del `BadRequestException` por defecto) era más frágil y perdía el `code`. Esto
también agrega un import nuevo de `plataforma/errores` en `configurar-aplicacion.ts` que la tabla
de módulos de `design.md` no listaba explícitamente para T2 (solo lo lista para T4, vía
`plataforma/documentacion`); no viola ninguna regla de fronteras (dirección permitida
`main → configurar-aplicacion → plataforma/*`) y evita reimplementar el aplanado de mensajes.

**Desviación registrada (secuenciación con T4):** `FiltroProblemJson` está `@Catch()` (captura
todo), pero para cualquier `HttpException` que **no** sea un `ErrorDeAplicacion` propio (p. ej. la
`ServiceUnavailableException` que lanza Terminus en `GET /health`, PLT4), delega por composición
en un `BaseExceptionFilter` construido perezosamente (nunca en el constructor: `HttpAdapterHost.
httpAdapter` no queda listo hasta que Nest crea la aplicación HTTP, y
`Test.createTestingModule().compile()` instancia los providers **antes** de ese punto — se detectó
así, con `npm run test:e2e` fallando en `/ejemplos` con 500 en vez de 404 hasta corregirlo).
`design.md` D6 asigna la exención explícita de `/health` a T4 (`FiltroSaludOperativo`, filtro de
controlador con precedencia sobre el global); esta tarea (T2) todavía no la implementa, pero el
work unit table de este archivo exige que `npm run test:e2e` de 00a siga en verde **ya en T2**
("los casos de 00a siguen en verde; no hay caso nuevo de e2e todavía, se agrega en T4"). Sin la
delegación por tipo, el filtro global habría reformateado la respuesta 503 de Terminus a
`problem+json` y roto los tests de 00a antes de que T4 exista. La delegación por tipo (no por ruta)
no contradice la alternativa que D6 descarta ("lista de rutas exentas dentro del filtro global"):
no compara ninguna cadena de URL, y queda superada sin conflicto en cuanto T4 agregue el filtro de
controlador (que Nest prioriza automáticamente sobre el global). Verificado con
`npm run test:e2e` completo (7/7 en verde) y con `npm run test:integracion` (9/9 en verde).

**Desviación registrada (dependencia adelantada de T3):** `tasks.md` pide etiquetar
`obtenerEjemploInterno` con `internal` y declarar los cuatro `operationId` del fixture *ya en esta
tarea* (para que T3 los consuma sin volver a tocar el archivo, y para el escenario "operationId
estable" de API2). Eso exige `@nestjs/swagger` (`@ApiTags`, `@ApiOperation`), que `design.md` lista
como dependencia de la fase completa sin asignarla a una tarea concreta; se instaló ahora
(`^12.0.2`, misma versión verificada en 00a) en vez de esperar a T3. Es inerte hasta que T3 monte
`SwaggerModule.createDocument` de verdad; el test de "operationId estable" de esta tarea genera un
documento mínimo con `SwaggerModule.createDocument` dos veces solo para comparar, sin escribir
ningún archivo (eso también es T3).

**Nota de presupuesto de revisión (Section E del protocolo SDD):** el diff real de esta tarea es
**657 líneas de autoría** (`git diff --cached --numstat`, excluyendo `package-lock.json`), frente a
la estimación de ~380 de `design.md`/este archivo (~1.7×, proporción similar a la de T1). La
diferencia es honesta: cinco archivos nuevos en `src/plataforma/errores/` con su cobertura
RED→GREEN completa (catálogo, `ErrorDeAplicacion`, `construirProblema`, la fábrica de errores de
validación con su propio checkpoint, el filtro global con la delegación explicada arriba), más el
fixture completo de `test/contrato/` (controlador, esquemas zod, módulo, helper compartido) y dos
archivos de test HTTP con Supertest (`errores.spec.ts`, `convenciones.spec.ts`, 8 escenarios en
total). No se recortaron tests, comentarios ni documentación para acercarse al presupuesto
(prohibido explícitamente por el protocolo). Se recomienda `size:exception` para este PR2 de la
cadena `stacked-to-main`.

**Decisión del usuario (2026-09-24)**: `size:exception` aceptado exclusivamente para PR2/T2 (657
líneas de autoría) y mantener intacto el commit `0290b5ec9172f62b7bca5df2210ee4e612272cdf`. Esta
excepción no se extiende a T3–T7; cada slice posterior debe respetar el presupuesto o reportar su
propio riesgo, sin asumir autorización.

**commit:** `0290b5ec9172f62b7bca5df2210ee4e612272cdf` — `feat(plataforma/errores): agregar filtro RFC 9457 y pipe de validacion nativo`

---

## T3 — Documento OpenAPI determinista (interno + público) y su chequeo de deriva

**Objetivo**: `plataforma/documentacion` con las cuatro funciones puras del pipeline (construir,
filtrar, ordenar, serializar), los dos scripts que generan y verifican el contrato (D1, D2), la
regla de fronteras 11, y `contrato:deriva` dentro de `verify` (PLT7 pasa a seis comprobaciones).

**Dependencias**: T2 (`configurarAplicacion` ya tiene el pipe global; `AppModule` ya importa
`ErroresModule` — el generador construye la app real).

**Archivos/áreas** (design D1, D2, D12, árbol de D4):
- `src/plataforma/documentacion/index.ts`, `configuracion-documento.ts`, `construir-documento.ts`,
  `filtrar-documento-publico.ts` (+ `.spec.ts`), `ordenar-documento.ts` (+ `.spec.ts`),
  `serializar-documento.ts` (+ `.spec.ts`) (Create) — **sin** `respuesta-desde-zod.ts` ni
  `montar-documentacion.ts` todavía (esos llegan en T4, D4).
- `scripts/generar-contrato.ts` (Create) — D2: `Test.createTestingModule({ imports: [AppModule] })`
  con `CONFIGURACION` sustituida por un literal del script, `configurarAplicacion(app)`,
  `SwaggerModule.createDocument`, `ordenarDocumento`, `serializarDocumento`, escribe
  `openapi/openapi.interno.json` y (tras `filtrarDocumentoPublico`) `openapi/openapi.json`.
- `scripts/verificar-deriva-contrato.ts` (Create) — regenera en memoria (nunca escribe), compara
  byte a byte con los dos archivos commiteados; distingue explícitamente "solo fin de línea" de una
  diferencia real (D2).
- `scripts/cli.ts` (Modify) — despacha los dos comandos del contrato desde el punto de entrada único
  observado en T1 para `vite-node`.
- `.gitattributes` (Modify) — reglas explícitas de fin de línea para `openapi/*.json` (D2, D9).
- `openapi/openapi.json`, `openapi/openapi.interno.json` (Create, generados) — ver la nota de
  secuenciación al inicio de este archivo: en este punto de la fase, `/health` todavía **no** está
  etiquetado `internal` (eso es T4), así que puede aparecer en ambos documentos. Es transitorio.
- `package.json` (Modify) — scripts `contrato:generar`, `contrato:deriva`; `verify` gana
  `contrato:deriva` (sexta comprobación, PLT7); `ci:hook` gana `contrato:deriva`.
- `.dependency-cruiser.cjs` (Modify) — regla 11 `scripts-solo-barriles-de-plataforma`: `scripts/`
  solo puede importar el `index.ts` de un submódulo de `plataforma/`.
- `test/fronteras/` (Modify) — fixture y caso de la regla 11.
- `test/contrato/documentacion.spec.ts` (Create) — checkpoint del prefijo global, filtro y generación
  repetida sobre `AppModule + ContratoFixtureModule`.
- `test/contrato/fixture/contrato-fixture.controller.ts` y `test/contrato/soporte.ts` (Modify) — el
  controlador usa la ruta relativa `ejemplos`; el prefijo global se configura solo en el harness de
  test para no duplicar `/api/v1`.

**Checkpoint (a) resuelto (máquina real, 2026-09-24; design.md D2):**

`npm list @nestjs/swagger --depth=0` confirmó `@nestjs/swagger@12.0.2`. El test
`API1 — SwaggerModule incluye el prefijo global en el documento` configuró `api/v1` en la app de
fixture y observó que `SwaggerModule.createDocument` incluye ese prefijo por defecto: la ruta sale
como `/api/v1/ejemplos`, no `/api/v1/api/v1/ejemplos`. Por ello el controlador fixture dejó de
repetir el prefijo en `@Controller('ejemplos')` y `construirDocumentoInterno` fija
`ignoreGlobalPrefix: false` explícitamente, aunque el default de 12.0.2 ya sea `false`, para hacer
estable la intención del contrato. T3 no agrega `setGlobalPrefix` a producción; eso sigue asignado a
T4. El documento generado desde `AppModule` aún contiene `/health` en el público, como exige la
secuenciación transitoria de T3.

**Escenarios cubiertos** (`specs/api/spec.md` delta, `specs/plataforma/spec.md` delta):
- `API1 — El contrato generado coincide con el commiteado`
- `API1 — Generar dos veces sin cambios produce el mismo documento`
- `API1 — El documento público se deriva del interno en una sola generación`
- `PLT7 — npm run verify en verde ejecuta las seis comprobaciones`
- `PLT7 — Un fallo en cualquier comprobación hace fallar npm run verify`
- `PLT7 — Un endpoint modificado sin regenerar el contrato hace fallar npm run verify`
- `PLT7 — gitleaks, commitlint y npm audit no forman parte de npm run verify`

**RED → GREEN → REFACTOR**:

1. RED: `filtrar-documento-publico.spec.ts` — sobre un documento de ejemplo (sin arrancar Nest):
   quita la operación etiquetada `internal`, borra el *path item* que queda vacío, quita la etiqueta
   de la lista `tags`, poda `components.schemas` huérfanos, **no** toca lo que ya es público.
   Observar fallo.
2. RED: `ordenar-documento.spec.ts` — dos documentos de ejemplo con distinto orden de inserción
   producen la misma salida (idempotencia). Observar fallo.
3. RED: `serializar-documento.spec.ts` — 2 espacios, salto final, sin `\r`. Observar fallo.
4. RED: resolver el checkpoint (a) generando el documento una primera vez con `SwaggerModule` sobre
   `AppModule + ContratoFixtureModule` de prueba (sin escribir archivo) y afirmando que las rutas
   del fixture llevan `/api/v1`.
5. RED: test de deriva — copiar `openapi/openapi.json` con un campo cambiado a mano y afirmar que
   `verificar-deriva-contrato.ts` sale con código ≠ 0 nombrando el archivo y la primera línea
   distinta; borrar el archivo temporal inmediatamente después.
6. GREEN: implementar las cuatro funciones puras, `generar-contrato.ts`, `verificar-deriva-contrato.ts`
   y la regla 11 hasta que todo pase; generar y commitear los dos documentos reales por primera vez.
7. GREEN: `npm run verify` corre `contrato:deriva` como sexta comprobación; confirmar que `gitleaks`,
   `commitlint` y `npm audit` **no** están en `verify` (ya es así desde T1: nunca se agregaron ahí).
8. REFACTOR: confirmar que generar dos veces en el mismo proceso produce cadenas idénticas (test
   barato de API1, sin escribir a disco dos veces).

**Evidencia TDD observada (T3 exige el ciclo aunque `strict_tdd` global sigue en `false`):**

| Parte | RED observado antes del código | GREEN observado | REFACTOR observado |
|---|---|---|---|
| Filtro, orden y serialización | `npm test -- filtrar-documento-publico.spec.ts`, `... ordenar-documento.spec.ts` y `... serializar-documento.spec.ts`: cada comando salió 1 porque el módulo productivo aún no existía. | `npm test -- documentacion fronteras`: los tres specs pasaron como parte de 13 archivos y 68 tests. | La serialización mantiene LF y dos espacios; ordenar repetidamente produce la misma cadena y no muta el documento fuente. |
| Prefijo global | `npm test -- documentacion.spec.ts` salió 1: la ruta esperada faltaba mientras el fixture codificaba `api/v1` y se le aplicó el prefijo global. | El test pasa con la ruta fixture relativa y el prefijo configurado antes de `app.init()`. | El test verifica tanto el default de Swagger como `construirDocumentoInterno` con `ignoreGlobalPrefix: false`. |
| Deriva y composición | `npm test -- verificar-deriva-contrato.spec.ts` salió 1 porque el checker aún no existía; `npm test -- contrato-scripts.spec.ts` salió 1 con 3 expectativas fallidas; la prueba de frontera salió 1 con 17/18 pasando porque faltaba la regla 11. | `npm test -- documentacion fronteras`: 13 archivos, 68 tests, exit 0; `npm run fronteras` verificó 86 módulos y 157 dependencias sin violaciones. | Una edición temporal de `openapi/openapi.json` fue detectada por el checker sin que este escribiera o reparara el archivo; la regeneración lo restauró. |

**Desviaciones de implementación registradas:**

- La nota de T1 confirma que `vite-node` no expone la ruta objetivo en `process.argv[1]`; por eso los
  módulos `scripts/generar-contrato.ts` y `scripts/verificar-deriva-contrato.ts` exportan funciones
  puras respecto al CLI, y `scripts/cli.ts` despacha los comandos. `package.json` invoca ese punto de
  entrada único en lugar de ejecutar directamente cada archivo nuevo.
- El fixture de T2 pasó de `@Controller('api/v1/ejemplos')` a `@Controller('ejemplos')`; el prefijo
  global se configura solo en `test/contrato/soporte.ts`. Es un cambio del harness necesario para
  probar el comportamiento real de Swagger sin duplicar la versión. `src/configurar-aplicacion.ts`
  queda intacto en T3.

**Work Unit Evidence:**

| Evidence | Resultado |
|---|---|
| Focused test command and exact result | `npm test -- documentacion fronteras` — exit 0; 13 archivos de test, 68 tests pasaron. La salida incluye un stderr no bloqueante `EALLOWSCRIPTS`/`DEP0190` del test preexistente de T1 que ejecuta `npm audit --json`; Vitest y npm terminaron en 0. |
| Runtime harness command/scenario and exact result | `npm run contrato:generar && npm run contrato:deriva` (invocado por `cmd.exe` para conservar `&&` en Windows) — exit 0; ambos documentos coinciden byte a byte. Dos generaciones consecutivas conservaron los blob ids: público `52a5c337752d365f010adbebb452a079163f458a`, interno `3318732e09398b63a30da3994f2fc6fdf28bf3e0`. Con `info.version` cambiado temporalmente a `0.0.2`, `npm run contrato:deriva` salió 1 y señaló la línea 7; el hash de ese archivo no cambió durante la comprobación. `npm run verify` también salió 1 en `contrato:deriva`; `npm run contrato:generar` restauró el documento y la siguiente deriva salió 0. |
| Full verify | `npm run verify` — exit 0; lint, typecheck, fronteras, deriva y Vitest pasaron; 28 archivos y 119 tests, 29.35 s (menos de 3 minutos). Los logs del test de salud incluyen los fallos simulados a `127.0.0.1:65533`; las pruebas pasan. |
| Rollback boundary | Revertir `.dependency-cruiser.cjs`, `.gitattributes`, `package.json`, `scripts/cli.ts`, `scripts/generar-contrato.ts`, `scripts/verificar-deriva-contrato.ts`, `src/plataforma/documentacion/**`, `test/contrato/documentacion.spec.ts`, los cambios de `test/contrato/fixture/contrato-fixture.controller.ts` y `test/contrato/soporte.ts`, los tres cambios/fixtures de `test/fronteras/`, ambos `openapi/*.json` y esta sección T3 de `tasks.md` devuelve el estado anterior a T3 sin retirar los cambios de T1/T2. |

**Nota de presupuesto de revisión (Section E, PR3):** el conteo final es `850` líneas de
autoría (adiciones + eliminaciones; excluye `openapi/*.json` y `package-lock.json`), frente a ~400
estimadas: `450` sobre el presupuesto. No hay un corte cohesivo adicional dentro de T3:
separar los transformadores, el generador/checker o su gate dejaría incompleta la misma unidad de
contrato. No se infiere `size:exception` para T3 ni se abre PR; el commit local no cambia ese límite.

**Hecho cuando**:
- Los siete escenarios listados pasan.
- El checkpoint (a) queda resuelto y registrado.
- `openapi/openapi.json` y `openapi/openapi.interno.json` existen, están commiteados, y regenerarlos
  produce el mismo contenido byte a byte (con la salvedad transitoria de `/health` anotada en la
  nota de secuenciación).
- `npm run verify` sigue completándose en menos de 3 minutos con Postgres/Redis arriba.

**Resultado observado:** todos los criterios anteriores pasan. Los dos documentos se generaron desde
`AppModule` real (sin el fixture de test); `/health` aparece tanto en el documento interno como en el
público de T3, deliberadamente. T4 regenerará ambos al etiquetar `/health` como `internal`.

**commit:** el SHA se registra en el commit de seguimiento de este artefacto; el commit de unidad usa
`feat(plataforma/documentacion): generar el contrato OpenAPI de forma determinista`.

---

## T4 — `GET /health` en el contrato interno y `/docs` con Scalar

**Objetivo**: documentar `/health` desde su esquema zod, etiquetarlo `internal` y excluirlo del
documento público (D1, D6, API8); montar Scalar en `/docs` detrás de `DOCS_HABILITADO`, apagado por
omisión y rechazado en `production` (D7, API9).

**Dependencias**: T3 (`plataforma/documentacion` ya existe; esta tarea agrega las dos piezas que
faltaban del árbol de D4).

**Archivos/áreas** (design D4, D6, D7):
- `src/plataforma/documentacion/respuesta-desde-zod.ts` (Create) — decorador que documenta la
  respuesta desde el mismo esquema zod que valida (skill §10).
- `src/plataforma/documentacion/montar-documentacion.ts` (Create) — no-op si `DOCS_HABILITADO` es
  falso; si es verdadero, filtra a público y monta `apiReference` en `/docs`.
- `src/plataforma/salud/esquema-respuesta.ts` (Create) — `esquemaRespuestaSalud` (zod).
- `src/plataforma/salud/filtro-salud-operativo.ts` (Create) — `FiltroSaludOperativo extends
  BaseExceptionFilter`, reproduce el comportamiento por defecto de Terminus.
- `src/plataforma/salud/salud.controller.ts` (Modify) — `@ApiTags('internal')`,
  `@ApiOperation({ operationId: 'obtenerSalud' })`, `respuestaDesdeZod(esquemaRespuestaSalud, ...)`,
  `@UseFilters(FiltroSaludOperativo)`.
- `src/plataforma/config/esquema.ts` (Modify) — `DOCS_HABILITADO` (`'true' | 'false'` → boolean,
  default `false`); regla: `NODE_ENV=production` + `DOCS_HABILITADO=true` ⇒
  `ConfiguracionInvalidaError({ nombre: 'DOCS_HABILITADO', problema: 'valor' })`.
- `src/configurar-aplicacion.ts` (Modify) — `setGlobalPrefix('api/v1', { exclude: [{ path:
  'health', method: RequestMethod.GET }] })`, llamada a `montarDocumentacion(app)`.
- `.env.example` (Modify) — documenta `DOCS_HABILITADO`.
- `openapi/openapi.json`, `openapi/openapi.interno.json` (Modify, regenerados) — a partir de este
  commit, `/health` sale del público (queda `paths: {}`) y aparece en el interno con la etiqueta.
- `test/e2e/aplicacion.e2e-spec.ts` (Modify) — la respuesta real de `/health` valida contra
  `esquemaRespuestaSalud`.

**Checkpoint `[sin verificar]` de esta tarea** (design.md D4):

**(c) `@ApiResponse` y Standard Schema**: comprobar si `@nestjs/swagger@12` acepta directamente el
Standard Schema (el propio esquema zod) dentro de `@ApiResponse({ schema })`, o si hace falta
convertirlo primero con `z.toJSONSchema(esquema)`. Si acepta el Standard Schema directamente,
simplificar `respuestaDesdeZod` a pasarlo tal cual y registrar el resultado aquí. Lo que **no**
cambia en ningún caso: el esquema zod sigue siendo la única fuente (nunca `@ApiProperty` a mano).

**Escenarios cubiertos** (`specs/api/spec.md` delta, `specs/plataforma/spec.md` delta):
- `API4 — GET /health queda exento de application/problem+json`
- `API8 — GET /health no aparece en el documento público`
- `API8 — GET /health sí aparece en el documento interno, etiquetado internal`
- `API9 — /docs accesible en desarrollo`
- `API9 — /docs protegido fuera de desarrollo`
- `API9 — El proceso rechaza arrancar con /docs habilitado en producción`
- `API2 — GET /health es la única ruta pública sin el prefijo de versión` (spec vigente, sin delta;
  confirmado también aquí con el `setGlobalPrefix` real, no solo con la intención de 00a)
- `PLT7 — Un cambio en /health sin regenerar el contrato se detecta aunque el documento público esté vacío`

**RED → GREEN → REFACTOR**:

1. RED: `cargar-configuracion.spec.ts` (extender el de 00a) — `DOCS_HABILITADO` default `false`,
   acepta `'true'`/`'false'`, y **rechaza** `NODE_ENV=production` + `DOCS_HABILITADO=true` con
   `ConfiguracionInvalidaError`. Observar fallo.
2. RED: `test/contrato/documento-interno.e2e-spec.ts` (o similar) — el documento interno regenerado
   contiene `/health` con la etiqueta `internal`; el documento público regenerado **no** contiene
   `/health` y queda con `paths: {}` (dado que el fixture no es parte de `AppModule`). Observar
   fallo (todavía aparece en ambos, según T3).
3. RED: resolver el checkpoint (c) antes de escribir `respuestaDesdeZod` definitivo.
4. RED: `test/integracion/salud.spec.ts` (extender el de 00a) — `FiltroSaludOperativo` conserva el
   cuerpo de Terminus (200/503) en vez de `problem+json`. Observar fallo (filtro no existe).
5. RED: `test/contrato/docs.e2e-spec.ts` — `GET /docs` responde `404` con `DOCS_HABILITADO=false` y
   `200` con `true`, sirviendo el documento público. Observar fallo.
6. GREEN: implementar `esquemaRespuestaSalud`, `FiltroSaludOperativo`, `respuestaDesdeZod`,
   `montarDocumentacion`, `DOCS_HABILITADO`, `setGlobalPrefix` con exclusión, hasta que los cuatro
   specs pasen; regenerar y commitear `openapi/openapi.json` (ahora `paths: {}`) y
   `openapi/openapi.interno.json` (ahora con `/health` etiquetado `internal`).
7. REFACTOR: confirmar que el e2e existente de 00a (`NODE_ENV: 'test'`, sin `DOCS_HABILITADO`) sigue
   pasando sin tocarse (D7: compatibilidad con el default `false`).

**Hecho cuando**:
- Los ocho escenarios listados pasan.
- El checkpoint (c) queda resuelto y registrado.
- El documento público commiteado tiene `paths: {}` (Success Criteria de `proposal.md`, ahora ya
  definitivo, no transitorio).
- El e2e completo de 00a (`npm run test:e2e`) sigue en verde sin modificaciones de comportamiento.

**commit:** `<pendiente>` — `feat(plataforma/salud): documentar /health como internal y montar /docs con Scalar`

---

## T5 — Lint (Spectral) y diff (oasdiff) del contrato

**Objetivo**: lintear ambos documentos con Spectral (D1: el público hoy no ejercita ninguna regla
por tener `paths: {}`, el interno sí) y comparar el público contra `main` con oasdiff, con la
política explícita de "sin base de comparación" (D11, API10).

**Dependencias**: T4 (`/health` ya está correctamente separado; el fixture de T2 ya cubre las
convenciones que Spectral verifica sobre el documento interno de prueba).

**Archivos/áreas** (design D11):
- `.spectral.yaml` (Create) — `extends: spectral:oas` + reglas del proyecto (prefijo `/api/v1` con
  la excepción de `/health`, `operationId` camelCase, propiedades camelCase, errores en
  `problem+json`); `--fail-severity error`.
- `scripts/comparar-contrato.ts` (Create) — D11: con base → `oasdiff breaking <base> <actual>
  --fail-on ERR`; sin documento base en `main` → no falla, imprime
  `SIN BASE DE COMPARACIÓN — main no tiene openapi/openapi.json; este PR no fue comparado` en
  mayúsculas; sin rama `main` o `git show` falla → falla nombrando el comando; Docker no responde →
  falla nombrando Docker Desktop.
- `package.json` (Modify) — scripts `contrato:lint`, `contrato:diff`; `ci` (todavía sin componer del
  todo — la composición final de `ci` es T6) gana estos dos pasos.

**Escenarios cubiertos** (`specs/integracion-continua/spec.md`, `specs/api/spec.md`):
- `CI9 — Sin documento base, el paso no falla pero deja rastro visible`
- `CI9 — Con documento base, la comparación es real`
- `API10 — Cambio incompatible sin nueva versión bloquea el build` (spec vigente, sin delta)

**RED → GREEN → REFACTOR**:

1. RED: `test/fronteras/comparar-contrato.spec.ts` — simular las cuatro ramas de la tabla de D11
   (con base, sin base, sin rama `main`/`git show` falla, Docker no responde) y afirmar la salida
   exacta de cada una, en especial que "sin base" **nunca** imprime "ok" ni "sin cambios
   incompatibles". Correr `npm test -- comparar-contrato` y observar fallo (script no existe).
2. RED: un campo quitado a mano del documento público de ejemplo hace que `oasdiff breaking` (con
   base simulada) detecte el cambio como incompatible.
3. GREEN: implementar `scripts/comparar-contrato.ts` y `.spectral.yaml` hasta que los tres
   escenarios pasen.
4. GREEN: correr `npm run contrato:lint` sobre los dos documentos reales (público con `paths: {}`,
   interno con `/health` y las rutas del fixture) y confirmar que pasa sin errores de severidad
   `error`.
5. REFACTOR: si Spectral reporta advertencias no bloqueantes sobre el documento público vacío,
   documentarlas aquí en vez de silenciarlas con una excepción de regla.

**Hecho cuando**:
- Los tres escenarios listados pasan.
- `npm run contrato:lint` y `npm run contrato:diff` corren limpios contra el estado actual del
  repositorio (que hoy, al no tener `main` con `openapi/openapi.json` en el primer PR de la cadena,
  MUST reportar explícitamente "sin base" para `contrato:diff`, sin fallar).

**commit:** `<pendiente>` — `feat(ci): agregar lint y diff del contrato OpenAPI con Spectral y oasdiff`

---

## T6 — Workflow de GitHub Actions y `npm run ci`

**Objetivo**: composición final de `npm run ci` (la secuencia completa, CI5), el workflow de GitHub
Actions que la invoca sin redefinirla (CI6), y su validación estática con `actionlint` para poder
verificarlo hoy, sin remoto (Q4).

**Dependencias**: T1, T3, T5 (todos los scripts atómicos que `ci` compone ya existen).

**Archivos/áreas** (design D8, D10):
- `scripts/validar-flujos.ts` (Create) — `actionlint` vía Docker (D10) sobre `.github/workflows/`.
- `.github/workflows/ci.yml` (Create) — un solo job: `checkout` (`fetch-depth: 0`, necesario para
  `merge-base` de `commits` y para oasdiff contra `main`), `setup-node` (`.nvmrc`, cache npm),
  `npm ci`, `npm run ci`. Acciones fijadas por SHA; `permissions: contents: read`; disparadores
  `on: push` y `on: pull_request`.
- `package.json` (Modify) — script `flujos`; composición final de `ci`:
  `prisma:generar && ci:hook && fronteras && test:cobertura && test:e2e && contrato:lint &&
  contrato:diff && auditoria && flujos` (D8).

**Escenarios cubiertos** (`specs/integracion-continua/spec.md`):
- `CI5 — npm run ci ejecuta la secuencia completa en un entorno local`
- `CI5 — El workflow de CI invoca la misma definición, sin duplicarla`
- `CI6 — Un YAML de workflow mal formado falla la validación estática`
- `CI6 — El workflow ejecuta la secuencia completa en cada push y PR`
- `CI7 — Un test unitario roto falla antes de levantar contenedores`

**RED → GREEN → REFACTOR**:

1. RED: `test/fronteras/validar-flujos.spec.ts` — un YAML de workflow con un error de sintaxis
   simulado falla la validación estática, nombrando el archivo y el error. Observar fallo (script no
   existe).
2. RED: un test que inspecciona el `.github/workflows/ci.yml` real (cuando exista) y afirma que
   invoca `npm run ci` (o los scripts que compone), nunca redefine los pasos en YAML — esto puede
   escribirse como test de contenido de archivo, sin necesidad de ejecutar GitHub Actions.
3. RED: un test que rompe deliberadamente un test unitario (fixture temporal) y confirma que
   `npm run ci` se detiene ahí, sin llegar a levantar Testcontainers para integración (CI7); borrar
   el fixture inmediatamente después.
4. GREEN: escribir `scripts/validar-flujos.ts`, `.github/workflows/ci.yml` y componer `ci` en
   `package.json` hasta que los tres tests pasen.
5. REFACTOR: medir el tiempo total de `npm run ci` en local con Docker arriba y registrar el
   resultado aquí (no es un presupuesto exigido por la proposal para `ci`, solo para `ci:hook` y
   `verify`, pero es información útil para la Fase 09).

**Hecho cuando**:
- Los cinco escenarios listados pasan.
- `npm run ci` completo termina en verde en la máquina de desarrollo local, con Docker disponible,
  ejecutando en orden: `prisma:generar`, `lint`, `typecheck`, tests unitarios, `contrato:deriva`,
  `secretos`, `commits`, `fronteras`, tests con cobertura, tests e2e, `contrato:lint`,
  `contrato:diff`, `auditoria`, `flujos`.
- `.github/workflows/ci.yml` pasa `actionlint` y no redefine ningún paso individual en YAML.
- Nota para Q4 (no bloquea): el criterio "CI completo en verde" queda satisfecho localmente; el día
  que el usuario decida subir el repositorio a GitHub, el mismo workflow se reverifica contra un
  remoto real sin cambios de código.

**commit:** `<pendiente>` — `feat(ci): agregar workflow de GitHub Actions y componer npm run ci`

---

## T7 — Cierre: `git-cliff`, `strict_tdd: true`, `coverage_threshold`, documentación

**Objetivo**: generar `CHANGELOG.md` desde los commits de la fase (CI8), fijar
`coverage_threshold` con una medición real (D15), pasar `strict_tdd` a `true` (criterio de salida de
la fila 00b), y dejar la documentación del proyecto alineada con lo que el pipeline fijó.

**Dependencias**: T1-T6 completas (mide cobertura y genera el changelog sobre el trabajo real de la
fase; cierra la puerta TDD solo cuando ya no puede bloquear las tareas anteriores, Approach 5 de la
proposal).

**Archivos/áreas** (design D15, D16):
- `cliff.toml` (Create) — configuración versionada de `git-cliff` (D16).
- `CHANGELOG.md` (Create, generado) — `git-cliff -o CHANGELOG.md` sobre los commits de la fase;
  MUST NOT editarse a mano.
- `package.json` (Modify) — script `changelog`; dependencia `git-cliff` (devDependency).
- `vitest.config.ts` (Modify) — `coverage.thresholds.lines` (D15: `max(60, floor(medido/5)*5 - 5)`,
  calculado sobre la medición real de esta tarea).
- `package.json` (Modify) — `test:cobertura` pasa a correr en `ci` en vez de `test` + `test:integracion`
  por separado (ya definido en T6; aquí solo se confirma que el umbral bloquea de verdad).
- `openspec/config.yaml` (Modify) — `strict_tdd: true`; `coverage_threshold` con el mismo valor que
  `vitest.config.ts` (ambos MUST coincidir).
- `CLAUDE.md` §Comandos (Modify) — scripts nuevos de esta fase (`ci`, `ci:hook`, `contrato:*`,
  `secretos*`, `commits`, `auditoria`, `flujos`, `changelog`, `herramienta`).
- `.claude/skills/luxeboreal-arquitectura/SKILL.md` §1, §2, §7, §10, §11, §12 (Modify) — submódulos
  nuevos (`documentacion`, `errores`), regla 11 de fronteras, proyecto de contrato en Testing
  Strategy, comandos nuevos, checklist de cierre con el contrato regenerado.
- `docs/fases/README.md`, `docs/migracion/inventario.md` (Modify, al archivar) — estado de 00b;
  corregir la fila 00b: "`/health` entra al contrato OpenAPI" → "`/health` entra al documento
  **interno**, excluido del público" (riesgo ya identificado en `design.md`).
- ADR-0010 (`docs/adr/0010-documento-openapi-publico-e-interno.md`) y ADR-0011
  (`docs/adr/0011-codigos-de-error-rfc9457.md`): ya creados en estado `propuesta` durante `sdd-design`
  (no se crean en esta tarea); si el usuario los acepta antes del cierre, actualizar su estado y
  `docs/adr/README.md` en este mismo commit.

**Escenarios cubiertos** (`specs/integracion-continua/spec.md`):
- `CI8 — El changelog se regenera desde los commits`
- `CI8 — Una edición manual del changelog se detecta`

**RED → GREEN → REFACTOR**:

1. RED: `test/fronteras/changelog.spec.ts` (o verificación equivalente) — `git-cliff` sobre un
   historial de ejemplo agrupa por tipo de Conventional Commits; una edición manual posterior queda
   sobrescrita al regenerar. Observar fallo (script/config no existe).
2. GREEN: escribir `cliff.toml`, generar `CHANGELOG.md` real sobre el historial de la fase.
3. Medir: `npm run test:cobertura` sobre el estado final del código de 00a+00b; calcular
   `umbral = max(60, floor(medido / 5) * 5 - 5)`; escribir el mismo número en
   `vitest.config.ts` y `openspec/config.yaml`.
4. Confirmar: `npm run ci` (que ya corre `test:cobertura`) falla si el umbral se sube a mano por
   encima de lo medido, y pasa con el valor fijado.
5. Pasar `strict_tdd: true` en `openspec/config.yaml` como último cambio de la tarea; correr
   `npm run verify` una vez más para confirmar que la puerta nueva no bloquea nada retroactivamente.
6. Actualizar `CLAUDE.md`, la skill y los documentos de fase/inventario.

**Hecho cuando**:
- Los dos escenarios de CI8 pasan.
- `coverage_threshold` en `openspec/config.yaml` y `coverage.thresholds.lines` en
  `vitest.config.ts` coinciden y ambos reflejan la fórmula de D15 sobre una medición real (anotar
  aquí el número medido y el umbral resultante).
- `openspec/config.yaml` queda en `strict_tdd: true`.
- `npm run verify` completo en verde (siete comprobaciones, con el umbral de cobertura ya
  aplicándose de verdad en `ci`).
- Todas las secciones de "Success Criteria" de `proposal.md` quedan verificadas (referencia cruzada
  para `sdd-verify`).
- Nota para Q2 (no bloquea, sigue pendiente): la redacción de `err.message` en logs no se tocó en
  ninguna tarea de esta fase porque ninguna la necesitó (D5); si una fase futura sí la necesita, se
  pregunta al usuario entonces, sin modificar aquí la tabla D9 de 00a.

**commit:** `<pendiente>` — `chore(ci): generar CHANGELOG.md, fijar coverage_threshold y activar strict_tdd`

---

## Notas finales para `sdd-apply`

- **Q3 (partir la fase)**: no se activa. 7 tareas caben en el límite de 10.
- **Q2 (redacción de `err.message`)**: no bloquea ninguna tarea; T2/T5 no la necesitan (D5). Si al
  implementar T2 se concluye que sí hace falta el diagnóstico real, la tarea se detiene y se
  pregunta al usuario antes de tocar la tabla D9 de 00a.
- **Q4 (subir el repositorio a GitHub)**: no bloquea ninguna tarea. T6 deja el workflow validado
  estáticamente y ejecutable localmente vía `npm run ci`; el día que el usuario decida subir el
  repositorio, se reverifica contra un remoto real sin cambios de código.
- **ADR-0010 y ADR-0011**: ya existen en `docs/adr/` en estado `propuesta` (creados durante
  `sdd-design`). Ninguna tarea de este archivo los crea; T2 (ADR-0011, D5) y T3 (ADR-0010, D1) los
  implementan tal como quedaron redactados. Su aceptación formal es decisión del usuario, en
  cualquier momento hasta el cierre (T7 la registra si ocurre antes).
