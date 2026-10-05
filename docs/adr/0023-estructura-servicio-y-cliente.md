# 0023. Estructura del repositorio: `servicio/` y `cliente/` como aplicaciones hermanas

- Estado: propuesta
- Fecha: 2026-10-04
- Enmienda: ADR-0022 (el cliente sigue en `cliente/`; lo que cambia es dónde vive el servidor y quién orquesta la CI)

## Resumen

El servidor NestJS pasa de la raíz del repositorio a **`servicio/`**, al lado de **`cliente/`**. Cada aplicación tiene su
`package.json`, su lockfile, sus dependencias y su propia secuencia `ci`. La raíz solo guarda lo que abarca las dos
(documentación, contrato, configuración de Git y GitHub, sistemas externos) y un `package.json` **sin dependencias** que
encadena las dos aplicaciones. El código del servidor no cambia: solo cambian rutas de herramientas.

## Contexto

- El repo nació como una sola aplicación NestJS en la raíz. La Fase 11b agregó `cliente/` con su propio `package.json`
  (ADR-0022), pero la raíz siguió siendo el servidor: `npm run ci` del servidor instalaba, probaba y construía el
  cliente (`cliente:ci`), y tests del servidor (`test/fronteras/cliente-*.spec.ts`) revisaban archivos del cliente.
- El dueño quiere que las dos aplicaciones se vean y se comporten como independientes que conviven en un repo, y que el
  despliegue de la Fase 09b pueda construir cada una por separado.
- Los scripts de herramientas resuelven la raíz con `git rev-parse --show-toplevel`
  (`servicio/scripts/herramientas.ts`); al mover el servidor, esa raíz sigue siendo la del repositorio.
- Aún no existen el Dockerfile de producción (09a) ni el despliegue (09b): es el momento más barato para reorganizar.

## Alternativas

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **`servicio/` y `cliente/` hermanas, raíz sin dependencias** | La estructura dice lo que hay; cada carpeta es una unidad de build y de despliegue | Mover ~800 archivos y corregir rutas de herramientas |
| B | Dejar el servidor en la raíz (como hoy) | Sin trabajo | El servidor sigue siendo «dueño» del repo y del cliente |
| C | Cliente en otro repositorio | Aislamiento total | Dos CI, contrato sincronizado a mano, dos PRs por cambio de endpoint (descartado en ADR-0022) |
| D | Monorepo con workspaces de npm o Nx | Tareas y caché compartidas | Herramienta nueva y un solo árbol de dependencias; contradice «empaquetadas por separado» |

## Decisión (A)

1. **Qué va dentro de cada aplicación:** lo que solo esa aplicación usa para construirse, probarse o correr.
   - `servicio/`: `src/`, `test/`, `prisma/`, `scripts/`, `datos-desarrollo/`, `package.json` y lockfile, `tsconfig*`,
     `nest-cli.json`, `vitest.config.ts`, `eslint.config.js`, `.dependency-cruiser.cjs`, `prisma.config.ts`, `.swcrc`,
     `.env.example`, `auditoria-excepciones.json`, `commitlint.config.js` y `docker-compose.yml` (Postgres, Redis y MinIO
     de `start:dev`; los tests usan Testcontainers).
   - `cliente/`: todo lo de Angular, incluida la generación y la deriva de su cliente HTTP y sus propias excepciones de
     auditoría.
2. **Qué queda en la raíz:** lo que abarca las dos aplicaciones o el repositorio entero.
   - Producto: `SPEC.md`, `MODELO_DATOS.md`, `docs/`, `openspec/`, `odd/`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`.
   - Contrato: `openapi/` y `.spectral.yaml`. El servicio lo genera y el cliente lo consume; ninguno de los dos lo posee.
   - Repositorio: `.github/` (GitHub solo lo lee en la raíz), `.githooks/`, `.gitleaks.toml`, `cliff.toml`, `.nvmrc`,
     `.gitignore`, `.gitattributes`, `.claude/`.
   - Sistemas externos: `infra/chatwoot/`, con sus scripts (`chatwoot-up.sh`, `chatwoot-bootstrap.sh`, …). Ahí irá la
     composición de producción de la 09b.
3. **Herramientas del repositorio instaladas en `servicio/`.** commitlint, la búsqueda de secretos, `git-cliff`,
   `actionlint` y el lint y diff del contrato son scripts TypeScript probados con la suite del servicio; se quedan ahí y
   operan sobre la raíz del repositorio. `commitlint.config.js` vive junto a su paquete porque commitlint resuelve
   `@commitlint/config-conventional` desde la carpeta de la configuración. Los scripts distinguen
   `resolverRaizRepositorio()` (lo del repo) de `resolverRaizServicio()` (lo del servicio).
4. **La raíz encadena, no instala nada.** `package.json` de la raíz, sin dependencias: `instalar` (`npm ci` de cada
   aplicación, sin tocar los lockfiles), `auditoria:cliente` y `ci` (servicio, luego cliente, luego la auditoría del
   cliente con la herramienta del repo). El workflow de GitHub Actions sigue siendo un solo job que llama a
   `npm run instalar` y `npm run ci` de la raíz.
5. **El servicio no conoce al cliente.** Sus scripts no tienen `cliente:*` y sus tests no leen `cliente/`. Las pruebas
   de las fronteras y del proxy del cliente viven en `cliente/herramientas/` y corren con el `ci` del cliente.
6. **Hooks de Git:** siguen en `.githooks/` (raíz) y entran a `servicio/` para correr `ci:hook` y commitlint.
7. **CLT1 cubre la carpeta nueva:** la regla del lint del cliente que prohíbe importar código del servidor bloquea
   también `servicio/`.

## Consecuencias

- **Gana:** la estructura coincide con las unidades de despliegue de la 09b: una imagen construida solo desde
  `servicio/` y otra solo desde `cliente/`, más `infra/` para lo externo. El cliente se construye sin `openapi/`, porque
  su cliente HTTP generado está commiteado.
- **Gana:** cada aplicación se instala, prueba y construye sola; un error de una no oculta la otra.
- **Paga:** los comandos del servidor se corren desde `servicio/` (`npm --prefix servicio run …` desde la raíz) y el
  `.env` local pasa a `servicio/.env`. La documentación vigente se actualiza; los `verify-report` archivados no, porque
  describen lo que pasó.
- **Obligatorio desde ahora:** nada de lo que usa solo una aplicación se agrega a la raíz, y la raíz no declara
  dependencias. Lo que abarca las dos aplicaciones se decide aquí, no dentro de una de ellas.
- **Se revisa** si las herramientas del repositorio necesitan salir de `servicio/` (por ejemplo, si el cliente se va a
  otro repo): entonces se llevan a un paquete propio en la raíz.
