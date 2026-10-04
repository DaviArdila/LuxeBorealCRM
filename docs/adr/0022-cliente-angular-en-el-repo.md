# 0022. Cliente de back office en Angular, dentro de este repo (`cliente/`)

- Estado: propuesta
- Fecha: 2026-10-03
- Enmienda: `docs/analisis/06-cliente-back-office.md` (reemplaza su recomendación de React + Vite en un repo aparte)

## Resumen

El cliente de back office se construye con **Angular** (versión estable más reciente, standalone, signals, sin
Zone.js) y **PrimeNG**, en la carpeta **`cliente/`** de este mismo repo, con su propio `package.json`. Su única
dependencia del servidor sigue siendo el contrato `openapi/openapi.json`, del que genera su cliente HTTP con
`ng-openapi-gen`. El dueño tomó la decisión el 2026-10-03; falta aceptar el ADR.

## Contexto

- El doc 06 (2026-09-23) recomendó React + Vite + TanStack en un **repo separado**, y dejó dicho que no era vinculante:
  el dueño contemplaba Angular.
- El dueño adelanta la Fase 11 para probar y ajustar el bot desde una pantalla (estilo, mensajes fijos) y prefiere
  Angular.
- La autenticación es una cookie httpOnly `SameSite=Strict` (ADR-0021): el cliente debe servirse desde el **mismo
  origen** que la API.
- El contrato se genera desde el código y se verifica por deriva (ADR-0008, ADR-0010); un cambio de endpoint y su
  cliente generado pueden ir en el mismo commit si viven en el mismo repo.
- Equipo de una o dos personas; un solo pipeline de CI (`npm run ci`).

## Alternativas

**Tecnología**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Angular + PrimeNG** | Preferencia del dueño; framework completo (rutas, formularios, HTTP, DI) sin elegir librerías; PrimeNG trae tabla, editor, diálogos y mensajes listos | Más pesado que React + Vite; dependencia de los ciclos de versión de Angular y PrimeNG |
| B | React + Vite + TanStack (doc 06) | Liviano; ecosistema enorme | Hay que elegir y mantener piezas (rutas, datos, formularios, componentes); el dueño prefiere Angular |
| C | Angular + Angular Material | Componentes oficiales | Menos componentes de back office (tablas con filtros, editores) que PrimeNG |

**Dónde vive**

| | Qué es | Gana | Paga |
|---|---|---|---|
| 1 | **`cliente/` en este repo, `package.json` propio** | Contrato y cliente generado cambian en el mismo commit y la misma CI; un solo lugar para el dueño | Dos árboles de dependencias; la CI tarda más |
| 2 | Repo separado (doc 06) | Aislamiento total | Dos CI, versiones del contrato a sincronizar a mano, dos PRs por cada cambio de endpoint |
| 3 | Monorepo con herramienta (Nx, workspaces de npm) | Caché y tareas compartidas | Herramienta nueva que reorganiza el repo entero; no se justifica por un cliente |

## Decisión (A + 1)

1. **Angular** estable más reciente, componentes standalone, signals, sin Zone.js. Fijado en la Fase 11b (T1,
   2026-10-04): **Angular 22.2.1**, TypeScript 6, Vitest 5 + jsdom como runner de tests; el CLI exige Node ≥ 22.22.3 o
   ≥ 24.15, así que `cliente/package.json` declara `engines.node >=24.15.0`.
2. **PrimeNG** (22.1.2, tema Aura) como librería de componentes.
3. **`cliente/`** en este repo, con su `package.json`, lockfile, lint y tests propios. El servidor no importa nada de
   `cliente/` ni el cliente nada de `src/`, `scripts/` o `test/`.
4. **Cliente HTTP generado** con `ng-openapi-gen` desde `openapi/openapi.json` (`npm run cliente:generar`), commiteado y
   verificado por deriva en CI. Si `ng-openapi-gen` no maneja OpenAPI 3.1, la Fase 11b elige otra herramienta y
   actualiza este ADR. **Verificado en T1: `ng-openapi-gen` 1.1.0 sí maneja el contrato real y es determinista**, así que se
   usa; no hizo falta la alternativa.
5. **Mismo origen**: en desarrollo, `proxy.conf.json` reenvía `/api` a la API local; en producción, el mismo dominio
   (la forma concreta se decide en la 09b).
6. **CI**: `npm run ci` agrega lint, tests, build, auditoría y deriva del cliente; `dependency-cruiser` sigue limitado a
   `src/` y `scripts/`.
7. **Organizado por áreas** (agregado el 2026-10-04): el cliente crece por áreas de negocio en `src/app/areas/<area>/`
   (bot, luego inventario, ventas…), cada una con rutas cargadas en diferido y registrada en `areas/registro/registro.ts`; el
   shell arma rutas y menú desde ese registro. `nucleo/` y `compartido/` son las únicas piezas comunes, y el lint del
   cliente prohíbe los imports entre áreas (detalle en el `design.md` de la Fase 11b, D7, D9 y D10).

## Cómo se agrega un área

1. Carpeta `cliente/src/app/areas/<area>/` con su `area.ts` (título, ícono, roles, entradas del menú y cargador
   diferido de sus rutas) y su `<area>.routes.ts`.
2. Una línea en `areas/registro/registro.ts`. El shell, el menú y `app.routes.ts` no se tocan.
3. Lo que el área necesite de otra área se pide a la API; lo que se repita entre áreas sube a `compartido/` (interfaz)
   o a `nucleo/` (transversal).
4. Sus endpoints llegan por `npm run cliente:generar`, en el mismo commit que cambia el contrato.

## Consecuencias

- **Gana**: un cambio de endpoint, su contrato y su cliente generado se revisan juntos; el dueño trabaja en un solo
  repo; las garantías de la API del doc 06 (permisos en el servidor, RFC 9457, `operationId` estables) siguen igual.
- **Paga**: dos `node_modules`, una CI más larga y actualizaciones de Angular y PrimeNG que atender.
- **Queda prohibido**: importar código entre `cliente/` y el servidor; editar a mano el cliente generado; guardar
  secretos o tokens en el cliente; decidir permisos solo en el cliente.
- **Queda obligatorio**: regenerar el cliente en el mismo commit que cambia el contrato público; que toda llamada a la
  API pase por el código generado; que cada funcionalidad nueva sea un área con rutas diferidas y sin imports de otra
  área.
- **Dashboard App de Chatwoot (P14)**: el mismo cliente se podrá embeber más adelante. Si Chatwoot y el cliente quedan
  en dominios distintos, la cookie `SameSite=Strict` no viaja dentro del iframe y hará falta revisar ADR-0021.
