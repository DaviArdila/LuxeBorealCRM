# 0022. Cliente de back office en Angular, dentro de este repo (`cliente/`)

- Estado: propuesta
- Fecha: 2026-10-03
- Enmienda: `docs/analisis/06-cliente-back-office.md` (reemplaza su recomendación de React + Vite en un repo aparte)
- Enmendado por: ADR-0023 (el servidor pasa a `servicio/`; `npm run cliente:generar` y `cliente:deriva` pasan a ser
  `npm --prefix cliente run api:generar` y `api:deriva`, del propio cliente)
- Enmienda 2026-10-05: Angular 21 + PrimeNG 21.1.10 (MIT) en vez de Angular 22 + PrimeNG 22 (ver «Enmienda
  (2026-10-05)» abajo)
- Enmienda 2026-10-05 (segunda): Angular Material + CDK reemplaza a PrimeNG (ver «Enmienda (2026-10-05, Angular
  Material)» abajo)

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

1. **Angular**, componentes standalone, signals, sin Zone.js. Fijado en la Fase 11b (T1, 2026-10-04) en Angular 22,
   bajado a 21.2 el 2026-10-05 por PrimeNG (ver «Enmienda (2026-10-05)») y devuelto ese mismo día a **Angular 22.2.x**
   con Angular Material 22 (ver «Enmienda (2026-10-05, Angular Material)»): TypeScript 6.0, Vitest 5 + jsdom como
   runner de tests. `cliente/package.json` mantiene `engines.node >=24.15.0`, igual que la raíz del repositorio.
2. **Angular Material + CDK** (MIT, versionados junto con Angular) como librería de componentes, con tema Material 3
   y los íconos de Material Symbols (`material-symbols`, Apache-2.0). Hasta el 2026-10-05 fue PrimeNG 21.1.10; ver
   «Enmienda (2026-10-05, Angular Material)».
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
- **Paga**: dos `node_modules`, una CI más larga y actualizaciones de Angular y de su librería de componentes que atender.
- **Queda prohibido**: importar código entre `cliente/` y el servidor; editar a mano el cliente generado; guardar
  secretos o tokens en el cliente; decidir permisos solo en el cliente.
- **Queda obligatorio**: regenerar el cliente en el mismo commit que cambia el contrato público; que toda llamada a la
  API pase por el código generado; que cada funcionalidad nueva sea un área con rutas diferidas y sin imports de otra
  área.
- **Dashboard App de Chatwoot (P14)**: el mismo cliente se podrá embeber más adelante. Si Chatwoot y el cliente quedan
  en dominios distintos, la cookie `SameSite=Strict` no viaja dentro del iframe y hará falta revisar ADR-0021.

## Enmienda (2026-10-05)

- **Cambio**: el cliente baja de Angular 22 + PrimeNG 22.1.2 a **Angular 21.2.x + PrimeNG 21.1.10**, con
  `@primeuix/themes` 2.0.3 y `primeicons` 7.0.0. TypeScript pasa a 5.9 y Vitest a 4, que son los que exige
  `@angular/build` 21.
- **Motivo**: `primeng` 22, `@primeuix/themes` 3 y `primeicons` 8 dejaron la licencia MIT y pasaron a la «PrimeUI
  License», comercial. Su modalidad gratuita exige una clave, sin ella el cliente muestra el aviso «Invalid PrimeUI
  License», y la licencia prohíbe quitar ese mecanismo. Hasta `primeng` 21.1.10, `@primeuix/themes` 2.0.3 y
  `primeicons` 7.0.0 la licencia es MIT (la de `primeng` 21 cubre con MIT las versiones de la comunidad; las `-lts`
  tienen licencia aparte y no se usan).
- **Lo que se paga**: no hay versiones nuevas de PrimeNG con licencia MIT. El cliente queda en la línea 21 de Angular y
  PrimeNG; cuando Angular 21 deje de recibir parches de seguridad, hay que revisar este ADR (pagar la licencia, cambiar
  de librería de componentes o seguir sin parches).
- **Sin cambios de código**: la API usada por el cliente (`providePrimeNG({ theme: { preset: Aura } })`, componentes
  standalone, el builder `@angular/build`) es la misma en 21; el lint, los tests, el build y la deriva del cliente
  generado pasan igual.
- Decisión del dueño, 2026-10-05 (seguimiento en `odd/tasks/cliente-primeng-mit.md`). Esta sección se agrega sin
  borrar el razonamiento original de la Decisión.

## Enmienda (2026-10-05, Angular Material)

- **Cambio**: el cliente deja PrimeNG y usa **Angular Material + CDK** (alternativa C de la tabla), con tema
  Material 3 que sigue el modo claro u oscuro del sistema y los íconos de Material Symbols (paquete
  `material-symbols`, Apache-2.0). Se quitan `primeng`, `@primeuix/themes` y `primeicons`. Después, el cliente
  sube a Angular 22.2 con Material y CDK 22.2, TypeScript 6.0 y Vitest 5.
- **Motivo**: la enmienda anterior dejó el cliente atado a Angular 21, porque PrimeNG 21 es la última versión MIT y
  exige Angular 21. Angular 21 deja de recibir parches de seguridad alrededor de mayo de 2027. Angular Material es MIT,
  lo mantiene el equipo de Angular y sale con cada versión del framework (`ng update` lo actualiza junto con Angular),
  así que el cliente puede volver a la versión vigente. Migrar ahora cuesta cuatro vistas; más adelante costaría
  mucho más.
- **Lo que se paga**:
  - Apariencia más genérica (Material Design) en vez del tema Aura.
  - No hay tabla avanzada lista (filtros, columnas configurables, exportar): `mat-table` es una tabla de datos simple;
    lo que falte se arma sobre el CDK o con otra pieza que pase por un ADR.
  - Material no trae un mensaje en línea: el cliente tiene el suyo, `compartido/aviso.component.ts`.
  - La fuente de íconos pesa unos 4 MB (se descarga una vez y queda en caché; no cuenta en el paquete inicial). Se
    mantiene la fuente en vez de registrar íconos SVG propios, que quitarían ese peso a cambio de mantener su código
    (decisión del dueño, 2026-10-05).
- Decisión del dueño, 2026-10-05 (seguimiento en `odd/tasks/cliente-angular-material.md`). Esta sección se agrega sin
  borrar la enmienda anterior ni el razonamiento original.
