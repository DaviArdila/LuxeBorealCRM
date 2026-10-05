# Cliente con Angular Material en vez de PrimeNG

Trabajo fuera de fase (ODD). Rama `fix/cliente-angular-material`, apilada sobre `fix/cliente-primeng-mit`
(PR #84), que a su vez está sobre `ccr-51a2b6d0-2fsxtk` (PR #82). Cada PR se reapunta a `main` cuando se
fusiona el anterior (`stacked-to-main`).

## Problema

PrimeNG 22 y sus paquetes dejaron la licencia MIT. El cliente quedó en Angular 21 + PrimeNG 21.1.10
(enmienda del ADR-0022, PR #84), sin versiones MIT futuras. Angular 21 deja de recibir parches de
seguridad alrededor de mayo de 2027, así que esa línea tiene fecha de vencimiento. Migrar ahora cuesta tres
pantallas; después de la 11c costaría mucho más.

## Decisión del dueño (2026-10-05)

Reemplazar PrimeNG por **Angular Material + CDK**: MIT, mantenido por el equipo de Angular y versionado
junto con Angular (`ng update` lo actualiza con el framework). Volver a la versión vigente de Angular (22).
Se enmienda ADR-0022 otra vez.

## Alcance

- Quitar `primeng`, `@primeuix/themes` y `primeicons`; agregar `@angular/material` y `@angular/cdk`.
- Tema Material 3 en `styles.css` (o `styles.scss`), con modo oscuro según el sistema.
- Las cuatro vistas actuales (inicio de sesión, shell, Estilo del bot, Mensajes fijos) usan componentes de
  Material con el mismo comportamiento; los tests existentes siguen en verde, ajustando solo selectores.
- Subir Angular, Material, CDK y sus herramientas a la línea 22.
- Fuera de alcance: pantallas nuevas, cambios en la API y en el servidor, identidad visual propia.

## Tareas

- [x] T1 — Reemplazar PrimeNG por Angular Material 21 (dependencias, tema M3, pantallas, tests) y
      enmendar ADR-0022. Ruta: delegada (varios archivos no triviales + lockfile).
      Evidencia: `@angular/material` 21.2.14 + `@angular/cdk` 21.2.14 y `material-symbols` 0.47.6 (íconos,
      Apache-2.0); `styles.css` pasa a `styles.scss` con `mat.theme` y `color-scheme: light dark`. Pieza nueva
      `compartido/aviso.component.ts` (Material no trae mensaje en línea; lo usan sesión, shell y las dos pantallas
      del bot) con su spec. Tests: solo cambian el selector de «Cerrar sesión» y los íconos de las áreas de prueba.
      `npm --prefix cliente run ci` en verde (16 archivos de tests de componentes, 20 de herramientas, build y
      deriva); `npm run auditoria:cliente` sin hallazgos; `rg -i "primeng|primeicons|primeuix" cliente/src
      cliente/package.json` sin resultados.
- [x] T2 — Subir el cliente a Angular 22 + Material/CDK 22 con `ng update`. Ruta: delegada (lockfile y
      herramientas).
      Evidencia: `ng update` no pudo instalar su CLI temporal (el npm local bloquea scripts de instalación en
      instalaciones de proyecto), así que las versiones se fijaron a mano —`@angular/*` 22.2.1, Material/CDK 22.2.1,
      `angular-eslint` 22.5.0, TypeScript 6.0, Vitest 5, las mismas que usaba el cliente antes de la enmienda de
      PrimeNG— y las migraciones se corrieron con `ng update <paquete> --migrate-only`. Sin cambios de código; se
      descartó el `strictTemplates: false` y la supresión de diagnósticos que agrega la migración de core, porque el
      build pasa con los valores por defecto de la 22. `npm ci` reproduce el lockfile; `npm --prefix cliente run ci`
      en verde; `npm ls @angular/core @angular/material` muestra 22.2.1.
- [ ] T3 — Actualizar la documentación que nombra PrimeNG (`docs/operacion/cliente-back-office.md` y
      otras referencias vigentes). Ruta: delegada junto con T1-T2 (mismo escritor).

## Test-first

Excepción: es un cambio de librería de presentación sin comportamiento nuevo, así que no hay un RED que observar. La
red de seguridad son los tests de componentes existentes, que siguen en verde ajustando solo selectores.

## Checks

- `npm --prefix cliente run ci` (lint, tests, herramientas, build, deriva) y `npm run auditoria:cliente`.
- Ninguna dependencia resuelta del cliente con licencia distinta de MIT/Apache/BSD/ISC.
- `rg -i primeng cliente/src` sin resultados.

## Entrega

Estrategia `auto-chain` con cadena `stacked-to-main` (CLAUDE.md). Previsión: ~500-700 líneas de autoría
(sin lockfile); se parte por tareas si el conteo real pasa de ~400.

## Progreso

- T1 hecha (commit de unidad de trabajo `fix(cliente): reemplazar PrimeNG por Angular Material`).
- T2 hecha (commit `build(cliente): subir a Angular 22 con Angular Material 22`).
