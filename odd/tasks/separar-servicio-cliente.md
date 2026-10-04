# Separar `servicio/` y `cliente/` en el repositorio

Trabajo fuera de fase (ODD), pedido por el dueño el 2026-10-04. Decisión en
`docs/adr/0023-estructura-servicio-y-cliente.md` (`propuesta`). **Estado: en curso.**

## Objetivo

Que el servidor NestJS y el cliente Angular sean dos aplicaciones hermanas en el repositorio, cada una con sus
dependencias y su `ci`, sin cambiar el comportamiento de ninguna. Solo se reorganizan carpetas y rutas.

## Cómo se comprueba que nada se rompió

Antes de mover nada se tomó una línea base sobre `main` (`83a6b8b`, CI de GitHub en verde). Cada paso se compara contra
ella:

| Qué | Línea base (`main`) | Criterio |
|---|---|---|
| Tests unitarios del servicio | 1397; 7 fallan solo por falta de Docker (gitleaks, oasdiff, actionlint) | Mismos tests, mismos 7 fallos locales, ninguno nuevo |
| Lista de tests (`vitest list`) | unit 1292, integración 857, e2e 129 | Misma lista; solo se suman los tests nuevos |
| `lint`, `typecheck`, `fronteras`, `build`, `contrato:deriva`, `auditoria`, `commits` | Verdes | Verdes |
| Contrato `openapi/*.json` | sha256 `30279583…` (público), `2286e32b…` (interno) | Regenerado byte a byte igual |
| Build del servidor (`dist/`) | 1104 archivos | Misma lista de archivos |
| Cliente: lint, 65 tests, build, deriva | Verdes | Verdes |
| CI completo en GitHub (con Docker) | Verde | Verde en la rama antes de fusionar |

Limitación del entorno de la sesión: no hay Docker, así que integración, e2e, evals, secretos, `flujos` y
`contrato:diff` se comprueban en GitHub Actions.

## Tareas

- [x] T1 — Mover el servidor a `servicio/` y corregir rutas, sin cambiar comportamiento
  - `git mv` de todo lo del servidor; Git lo ve como renombres (incluido `package.json`).
  - `resolverRaizServicio()` en `servicio/scripts/herramientas.ts` (RED: `TypeError: resolverRaizServicio is not a
    function`; GREEN). La usan la semilla de geografía y la auditoría; commitlint carga su configuración desde ahí.
  - `commitlint.config.js` pasa a `servicio/`: desde la raíz no resolvía `@commitlint/config-conventional` (RED: 7 tests
    con `Cannot find module`).
  - `git-cliff` lee `../cliff.toml` y escribe `../CHANGELOG.md` (RED: el changelog salía con la plantilla por defecto).
  - Hooks `pre-push` y `commit-msg` entran a `servicio/`; el test del hook empuja de verdad contra un repo con esa forma.
  - Scripts de Chatwoot a `infra/chatwoot/`, con su raíz recalculada (`bash -n` y resolución de rutas comprobados).
  - CLT1 bloquea también `servicio/` (RED: el import `../../../../servicio/src/app.module` pasaba el lint; GREEN).
  - `.gitignore`: el cliente Prisma generado pasa a `servicio/src/plataforma/prisma/generado/`.
  - Workflow con `working-directory: servicio`.
  - Resultado: 1399 tests (1397 + 2 nuevos), los mismos 7 fallos por Docker, contrato idéntico y misma lista de `dist/`.
  - Commit `e2dc0ef`; CI de GitHub (run 291) en verde, con integración, e2e, evals, secretos y `contrato:diff`.
- [x] T2 + T3 — Raíz que encadena y cliente que se verifica solo (juntas: el `ci` de la raíz encadena el del cliente)
  - `package.json` de la raíz sin dependencias: `instalar`, `instalar:ci`, `auditoria:cliente` y `ci`.
  - El cliente genera y verifica su API con `herramientas/api.mjs` (`api:generar`, `api:deriva`) y corre sus pruebas
    de fronteras, proxy y API con `npm run test:herramientas` (Vitest en Node, aparte de `ng test`).
  - La auditoría usa las excepciones del directorio auditado: `cliente/auditoria-excepciones.json` (braces,
    micromatch, @boundaries/elements, eslint-plugin-boundaries, según `npm audit` real) y las del servicio sin las dos
    que eran solo del cliente.
  - El servicio pierde `cliente:*`, `scripts/generar-cliente.ts` y los tests `cliente-*`; `ci-repositorio.spec.ts`
    prueba que ningún script del servicio mencione al cliente.
  - RED: 11 tests (ci-repositorio, auditoría por directorio, `Cannot find module './api.mjs'`); GREEN.
  - Cuentas: servicio 1399 − 23 trasladados o reemplazados + 10 nuevos = 1386 (mismos 7 fallos por Docker); cliente
    65 tests de componentes + 19 de herramientas (18 trasladados + 1 nuevo). Ningún test se perdió.
  - Specs actualizadas: CI10 (`integracion-continua`), CLT1 y CLT2 (`cliente`).
  - Commit `3ed8277`.
- [x] T4 — Documentación vigente: `CLAUDE.md` (estructura y comandos por aplicación), `README.md`,
  `docs/CONTEXTO_SESIONES.md`, guías de `docs/operacion/`, skill `luxeboreal-arquitectura`, nota en ADR-0022 y
  comentarios de `.env.example`. Los `verify-report` archivados no se tocan.
- [ ] T5 — Verificación final: clon limpio, hooks reales y CI completo en GitHub
- [ ] T6 `[manual]` — Prueba del dueño en Windows (ver la lista al final)

## Prueba del dueño en Windows

1. Mover tu `.env` a `servicio/.env`.
2. `npm run instalar` desde la raíz.
3. `docker compose -f servicio/docker-compose.yml up -d`.
4. `npm --prefix servicio run start:dev` y abrir `http://localhost:3000/health`.
5. `npm --prefix cliente start`, abrir `http://localhost:4200` e iniciar sesión.
6. `bash infra/chatwoot/chatwoot-up.sh`.
7. Un commit y un push de prueba para ver correr los hooks.
