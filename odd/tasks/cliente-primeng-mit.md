# Cliente con PrimeNG MIT y maquetación con sus componentes

Trabajo fuera de fase (ODD). Rama `fix/cliente-primeng-mit`, apilada sobre `ccr-51a2b6d0-2fsxtk`
(PR #82, separación `servicio/` + `cliente/`); su PR apunta a esa rama y se reapunta a `main` cuando
#82 se fusione.

## Problema

1. **Licencia.** `primeng` 22, `@primeuix/themes` 3 y `primeicons` 8 ya no son MIT: usan la «PrimeUI
   License» (comercial, con una modalidad gratuita que exige una clave). Sin la clave, el cliente
   muestra el aviso «Invalid PrimeUI License», y la licencia prohíbe quitar ese mecanismo. Hasta
   `primeng` 21.1.10, `@primeuix/themes` 2.0.3 y `primeicons` 7.0.0, todos eran MIT.
2. **Maquetación.** Las pantallas usan HTML suelto (`<form>` y `<label>` en una sola línea) y
   `styles.css` está vacío: no hay tipografía ni disposición de página.

## Decisión del dueño (2026-10-05)

Opción B: bajar el cliente a Angular 21 + PrimeNG 21 (MIT), sin claves de licencia. Se enmienda
ADR-0022. Lo que se paga: no hay versiones nuevas de PrimeNG con licencia MIT.

## Alcance

- Versiones del cliente: Angular 21.2.x, `primeng` 21.1.10, `@primeuix/themes` 2.0.3,
  `primeicons` 7.0.0, TypeScript ~5.9 y Vitest ^4, más lo que exija la compatibilidad (`angular-eslint`,
  `@angular/build`).
- Las pantallas (inicio de sesión, shell, Estilo del bot, Mensajes fijos) usan componentes de
  PrimeNG para formularios y disposición; el CSS propio se limita a una base global (tipografía y
  márgenes).
- Fuera de alcance: identidad visual propia, pantallas nuevas y cambios en la API.

## Tareas

- [x] T1 — Bajar dependencias a las versiones MIT, ajustar el código que cambie entre 22 y 21 y
      enmendar ADR-0022 (delegada: varios archivos y lockfile). Quedó Angular 21.2.25, `primeng`
      21.1.10, `@primeuix/themes` 2.0.3, `primeicons` 7.0.0, TypeScript 5.9.3, Vitest 4.1.11 y
      `angular-eslint` 21.4.0; el código no necesitó cambios. `cliente ci` en verde (65 tests,
      20 de herramientas, build y deriva), `auditoria:cliente` en verde y ningún paquete instalado
      con la «PrimeUI License».
- [x] T2 — Maquetar las pantallas con componentes de PrimeNG y una base de CSS global (delegada).
      Inicio de sesión en `p-card` con `p-password`; shell con `p-toolbar` y `p-menu`; Estilo y
      Mensajes fijos con `p-card`, `p-table`, `p-tag` y `p-dialog`; `styles.css` con fuente del
      sistema, márgenes y colores de los tokens de Aura (sigue el modo oscuro del sistema). Sin
      cambios de comportamiento ni de specs. Sin RED aplicable (solo presentación): `cliente ci` en
      verde (65 tests, 20 de herramientas, build 658.93 kB contra el aviso de 700 kB, deriva) y
      capturas de escritorio y móvil del inicio de sesión sin el aviso de licencia. Las pantallas
      detrás del inicio de sesión no se capturaron porque la base no tiene usuarios.

## Checks

- `npm --prefix cliente run ci` (lint, tests, herramientas, build, deriva) y `npm run auditoria:cliente`.
- Ninguna dependencia resuelta del cliente con la «PrimeUI License».
- Captura en el navegador sin el aviso de licencia y con las pantallas maquetadas.

## Progreso

Pendiente.
