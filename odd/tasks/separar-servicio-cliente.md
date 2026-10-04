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
- [ ] T2 — `package.json` de la raíz como orquestador sin dependencias
- [ ] T3 — El cliente se verifica solo: generación y deriva de su API, auditoría con sus excepciones, pruebas de
  fronteras y proxy en `cliente/herramientas/`; el servicio deja de conocer al cliente
- [ ] T4 — Documentación vigente (`CLAUDE.md`, `README.md`, `docs/CONTEXTO_SESIONES.md`, skills, guías)
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
