# CI con el historial de secretos, `.env` en el CLI de Prisma y cierre de PrimeNG

Trabajo fuera de fase (ODD). Rama `fix/ci-secretos-y-prisma-env` sobre `main` (`7602ea8`). Sale de las novedades que
dejó la verificación de la migración a Angular Material (`odd/tasks/cliente-angular-material.md`).

## Problema

1. **`prisma:aplicar` falla en local con `P1000`**: `prisma.config.ts` lee `process.env.DATABASE_URL`, pero Prisma 7
   con `prisma.config.ts` ya no carga `.env` solo. Sin la variable cae en la URL de relleno `generar:generar` y la base
   la rechaza. La app sí conecta porque `main.ts` llama a `cargarArchivoEntorno()`.
2. **`secretos:historial` no corre en `ci`**: D8 de la Fase 00b y `CLAUDE.md` dicen que el escaneo del historial
   completo corre en CI (atrapa un secreto agregado y borrado en el mismo push). El script `ci` del servicio nunca lo
   incluyó, desde `77f78a4`.
3. **Cierre de PrimeNG**: tres documentos históricos siguen nombrando PrimeNG como la librería vigente, y la decisión
   sobre la fuente de íconos queda sin registrar.

## Decisiones

- Íconos: se mantiene la fuente `material-symbols` (unos 4 MB, en caché y fuera del bundle inicial), recomendación
  aceptada por el dueño al pedir resolver las novedades (2026-10-05).
- Los documentos históricos no se reescriben: ganan una nota corta que apunta a la enmienda de ADR-0022.

## Tareas

- [ ] T1 — `prisma.config.ts` carga `.env` con `cargarArchivoEntorno()` (mismo mecanismo que `main.ts`). Ruta: inline
      (un archivo, mecanismo ya existente).
- [ ] T2 — `ci` del servicio corre `secretos:historial`. Ruta: inline (una línea).
- [ ] T3 — Notas de Angular Material en `docs/PREGUNTAS_ABIERTAS.md` (P14), `docs/fases/README.md` (fila 11b) y
      `docs/analisis/06-cliente-back-office.md`; decisión de íconos en ADR-0022. Ruta: inline (notas mecánicas).

## Checks

- T1: RED = `npm --prefix servicio run prisma:aplicar` con `P1000`; GREEN = migraciones al día. Más `prisma:generar`
  sin `.env` sigue funcionando (valor de relleno) y la batería del servicio.
- T2: `npm --prefix servicio run secretos:historial` en verde antes de encadenarlo; `npm run ci` completo.
- T3: lectura estructural.

## Progreso

Pendiente.
