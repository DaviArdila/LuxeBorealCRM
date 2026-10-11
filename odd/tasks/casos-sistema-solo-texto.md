# Casos del sistema: solo el texto es editable

Rama: `fix/casos-sistema-solo-texto` (desde `main`). Trabajo fuera de fase (ODD).

## Objetivo
Decisión del dueño: en un caso con clave del sistema solo se edita el **texto**. Título, categoría, «cuándo aplica» y
modo quedan fijos, porque el código dispara esos casos por una clave fija y todos son literales. Los títulos de botones
siguen la misma regla (solo texto, con su tope de 20 caracteres).

## Alcance autorizado
`servicio/src/modulos/asistente/aplicacion/administrar-casos.ts` y sus tests, controlador/DTO del asistente si hace falta,
`cliente/src/app/areas/asistente/casos/**`, spec `openspec/specs/asistente/spec.md` (CAS4 y escenario de edición),
`docs/operacion/cliente-back-office.md` y `docs/operacion/casos-del-asistente.md`, comentario de `sistema.ts`.
Sin cambios al esquema de datos.

## Tareas
- [x] S1 Servicio + spec (TDD): `editar` rechaza con `invalido` cambiar título, categoría, «cuándo aplica» o modo de un
  caso con clave; un valor igual al actual se tolera. Actualiza CAS4. Commit `1d405ca`.
- [x] S2 Cliente + docs: el diálogo de edición deshabilita esos cuatro campos cuando el caso tiene `claveSistema`;
  ajusta la documentación operativa y el comentario de `sistema.ts`. Commit `5907b2e`.
- [x] S3 Batería local completa y este documento.

## Ruta
Delegada: un writer. Disparador: 2+ archivos no triviales (servicio, cliente, spec) y lectura previa a la escritura.

## Evidencia
RED observado: 2 tests unitarios de `editar` fallaban antes del cambio; 2 tests del componente fallaban antes del cambio.
Observado en `servicio/` (todo en verde salvo la nota):
- `npm run lint`, `typecheck`, `fronteras`, `contrato:deriva` (contrato sin cambios), `commits`: exit 0.
- `vitest --project unit`: 207 archivos, 1767 tests pasan. `--project e2e`: 122 pasan. `--project evals`: 49 pasan, 1 omitido.
- `vitest --project integracion`: la primera corrida completa tuvo 1 falla en una aserción de tiempo (`duracionMs < 500`,
  ajena al cambio, bajo carga); la segunda corrida completa pasó 496/496.
Desde la raíz: `npm --prefix cliente run ci` (lint, tests, herramientas, build, api:deriva): exit 0.
Ajuste a tests existentes: CAS5 (modo guía en un caso del sistema) ahora recibe el motivo de CAS4; se reemplazaron los
tests de edición de título/«cuándo aplica» del sistema (cliente y servicio) por los de solo texto.
