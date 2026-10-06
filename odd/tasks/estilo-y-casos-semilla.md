# Estilo del bot y casos de la semilla (grifería, accesorios de baño y lavaplatos)

- Objetivo: que el bot hable como un buen asistente de atención del segmento real (grifos, accesorios de
  baño y lavaplatos de acero inoxidable de calidad; sin sanitarios, porcelana ni cerámica) y que una base
  nueva traiga categorías y casos de uso útiles.
- Estado: **aprobado** por el usuario (2026-10-06) con la propuesta de este documento. Trabajo fuera de
  fase: solo ODD, rama `chore/estilo-y-casos-semilla`.
- Alcance autorizado: `estilo.v4.md` (reemplaza a `v3`) y su versión en `cargador-prompts.ts`; el JSON de
  casos de `servicio/datos-desarrollo/asistente/`; los tests y documentos que citan `estilo.v3`.
  Los 11 casos del sistema y los 3 casos de desarrollo existentes no se tocan.
- Supuestos (el usuario no los contradijo): tratamiento «usted» por defecto, «tú» si el cliente tutea
  primero; Devoluciones 8 días y Garantía 1 año como están en los datos de desarrollo; lavaplatos de
  acero inoxidable. Lo legal (retracto, habeas data, factura electrónica) viene de fuentes secundarias y
  debe validarlo el dueño o su abogado.
- TDD: el estilo es texto validado por `validar-estilo.ts` y el JSON por `validar-caso.ts`; RED = un test
  que falle con el archivo nuevo ausente o inválido. Runner Vitest.

## Tareas

- [x] T1 Estilo v4: `estilo.v4.md`, `VERSION_ESTILO`, tests y documentos que citan `estilo.v3`.
- [x] T2 Casos: 5 categorías y 15 casos de intención nuevos en el JSON de desarrollo, más el de
      «Derecho de retracto» en Políticas; test de que el archivo pasa `validar-caso` y la semilla es
      idempotente.
- [ ] T3 Verificación completa y cierre.

## Ruta por tarea

- T1, T2: delegado (un escritor): 2+ archivos no triviales y lectura previa para escribir.

## Evidencia

- T1: RED observado (`ensamblar-prompt.spec.ts`, el estilo v3 no menciona grifos) y luego GREEN con
  `estilo.v4.md` (validado por `validarEstilo`); `estilo.v3.md` borrado, `VERSION_ESTILO = 'v4'`;
  nombres de archivo actualizados en `estilo-del-bot.md`, `openspec/specs/agente/spec.md` y
  `prompts-build.spec.ts`. Unit de agente: 27 archivos, 249 tests en verde; lint y typecheck limpios.
  Se conservan sin cambio las menciones históricas (changes archivados, ADR-0020, fases/README).
  Commit: `eb405e8`.
- T2: RED observado (`casos-desarrollo.spec.ts`, 2 fallos con el JSON de 3 casos) y luego GREEN con 6
  categorías y 17 casos nuevos (16 de la tabla en modo guía más «Derecho de retracto»; la propuesta
  decía 5 y 15, pero su tabla lista 6 y 16, y se siguió la tabla). Los 3 casos existentes quedan
  intactos (0 líneas borradas). `semilla.spec.ts` ahora comprueba solo que los 3 abren el archivo.
  Verificación: lint, typecheck, fronteras limpios; unit 196 archivos / 1560 tests; integración
  416 de 417 (el de geografía falló una vez bajo carga y pasa solo); evals 41 pasados;
  `npm run commits` válido. `casos:sembrar` 1.ª corrida: 31 insertados, 3 ya existían; 2.ª: 0
  insertados, 31 ya existían.
