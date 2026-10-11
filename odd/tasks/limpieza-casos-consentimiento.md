# Limpieza de casos tras la barrera de consentimiento

Rama: `chore/limpieza-casos-consentimiento` (desde `feat/botones-whatsapp`). Trabajo fuera de fase (ODD).
Continúa `odd/tasks/consentimiento-obligatorio.md` y `odd/tasks/botones-whatsapp.md`.

## Objetivo
Retirar la semilla del caso de intención «Tratamiento de datos» (decisión aprobada por el dueño): la barrera
`PoliticaConsentimiento` impide que un contacto pendiente o rechazado llegue al modelo, así que el caso no puede
dispararse, gasta tokens del índice del prompt y puede contradecir `consentimiento_aviso`. El aviso de la barrera queda
como fuente única. Se conserva la herencia del texto legado `aviso_datos` hacia `consentimiento_aviso`.

## Alcance autorizado
`servicio/src/modulos/asistente/**`, comentario de `politica-no-textuales.ts`, `servicio/scripts/sembrar-casos*`,
`servicio/test/**`, spec `asistente`, `docs/operacion/casos-del-asistente.md`, ADR-0027 y ADR-0028. Sin cambios al esquema.

## Tareas
- [x] L1 Quitar «Tratamiento de datos» de la semilla (TDD), ajustar tests, evals y el informe de `casos:sembrar`.
  Commit `e4a7740`; corrección `5239b47` (el aviso retira `aviso_datos` de `parametro` al heredarlo, CFG6).
- [x] L2 Documentación y comentarios: spec CAS6/CAS13/CAS14, `casos-del-asistente.md`, comentarios de `sistema.ts`,
  `sembrar-casos.ts`, `politica-no-textuales.ts` y notas en ADR-0027/0028. Commit `ebefe26` (el comentario de
  `politica-no-textuales.ts` va en `e4a7740`).
- [x] L3 Batería local completa y este documento.

## Ruta
Delegada: un writer. Disparador: más de 2 archivos no triviales y lectura previa a la escritura.

## Evidencia
- RED observado: 12 pruebas unitarias fallaban (`semilla.spec`, `sembrar-casos.spec`, `casos-desarrollo.spec`) antes de
  tocar `semilla.ts`; luego GREEN.
- La batería encontró una regresión real (`limpieza-parametro.spec`, CFG6): sin el caso, nadie retiraba la fila
  `aviso_datos` de `parametro`. Corregido en `5239b47`: el aviso la retira cuando hereda de ella, con prueba unitaria
  e integración.
- Batería desde `servicio/` (Docker y base locales activos): `lint` sin errores; `typecheck` sin errores; `fronteras` 0
  violaciones; `contrato:deriva` coincide byte a byte; `commits` 6 commits válidos; Vitest `unit` 1766/1766;
  `integracion` 496/496; `e2e` 122/122; `evals` 49 pasan, 1 omitida, veredicto APROBADA.
- Revisión nativa: tier no evaluado en esta sesión de writer; pendiente para el orquestador (`gentle-ai review assess`).

## Pendiente del dueño
- Borrar desde el back office («Casos de uso») la fila «Tratamiento de datos» que ya existe en la base local; no por SQL.
- `motor-turno.ts:17` (fuera de la superficie autorizada) aún cita el caso «Tratamiento de datos» en un comentario.
