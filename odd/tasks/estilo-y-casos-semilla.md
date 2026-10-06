# Estilo del bot y casos de la semilla (grifería, accesorios de baño y lavaplatos)

- Objetivo: que el bot hable como un buen asistente de atención del segmento real (grifos, accesorios de
  baño y lavaplatos de acero inoxidable de calidad; sin sanitarios, porcelana ni cerámica) y que una base
  nueva traiga categorías y casos de uso útiles.
- Estado: **aprobado** por el usuario (2026-10-06) con la propuesta de este documento. Trabajo fuera de
  fase: solo ODD, rama `chore/estilo-y-casos-semilla`.
- Alcance autorizado: el estilo nuevo como **semilla en la base** (`servicio/prisma/datos/estilo-inicial.md`,
  versión 1 de `version_estilo` solo si la tabla está vacía; corrección del usuario, T4: el archivo
  `estilo.v3.md` NO se reemplaza y sigue como respaldo); el JSON de casos de
  `servicio/datos-desarrollo/asistente/`; los tests y documentos que lo citan.
  Los 11 casos del sistema y los 3 casos de desarrollo existentes no se tocan.
- Supuestos (el usuario no los contradijo): tratamiento «usted» por defecto, «tú» si el cliente tutea
  primero; Devoluciones 8 días y Garantía 1 año como están en los datos de desarrollo; lavaplatos de
  acero inoxidable. Lo legal (retracto, habeas data, factura electrónica) viene de fuentes secundarias y
  debe validarlo el dueño o su abogado.
- TDD: el estilo es texto validado por `validar-estilo.ts` y el JSON por `validar-caso.ts`; RED = un test
  que falle con el archivo nuevo ausente o inválido. Runner Vitest.

## Tareas

- [x] T1 Estilo v4: `estilo.v4.md`, `VERSION_ESTILO`, tests y documentos que citan `estilo.v3`
      (reemplazada por T4: el `.md` se restauró y el texto pasó a ser semilla de la base).
- [x] T2 Casos: 5 categorías y 15 casos de intención nuevos en el JSON de desarrollo, más el de
      «Derecho de retracto» en Políticas; test de que el archivo pasa `validar-caso` y la semilla es
      idempotente.
- [x] T3 Verificación completa y cierre (spot check del padre: 13 archivos / 144 tests unit en verde;
      pendiente fuera de alcance: `test:e2e` y publicar v4 en bases con un estilo ya publicado).

- [x] T4 Corrección del usuario: restaurar `estilo.v3.md` y `VERSION_ESTILO = 'v3'`; mover el texto v4 a
      `prisma/datos/estilo-inicial.md` y sembrarlo como versión 1 en `version_estilo` solo con la tabla vacía
      (`casos:sembrar`, caso de uso `SembrarEstilo`, EST-D6).
- [x] T5 Estilo inicial mejorado con saludo, formato de producto (el texto no repite el pie de la foto que
      arma el backend), cierre, empatía y razones por regla. Ruta: inline (un archivo de datos y su test).
      RED: `estilo-inicial.spec.ts` (5 de 7 fallaban); el primer borrador pasaba de 4000 caracteres y el test
      lo atrapó; GREEN con 3.9k caracteres. Unit 198 archivos / 1574 tests, integración de la semilla 5/5,
      lint y typecheck limpios. Fuera de alcance, a decidir: formato del pie (`producto.ts:67`), botones o
      listas en el adaptador, y el texto de imagen del sistema que pide el SKU.

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
- T4: delegado (un escritor). Commits: `36e5070` (restaura `estilo.v3.md`, `VERSION_ESTILO = 'v3'`, deshace las
  ediciones de T1 en tests, `estilo-del-bot.md` y la spec del agente; `git mv` del texto v4 a
  `prisma/datos/estilo-inicial.md`) y el de la semilla (`SembrarEstilo`, extensión de `casos:sembrar`,
  EST-D6 en la spec del agente, CAS6, `estilo-del-bot.md`, `MODELO_DATOS.md`). Sin cambio de esquema:
  `publicado_por_id` ya es nullable y la semilla publica sin autor, como el comando. El archivo se lee
  desde `prisma/datos/` con `resolverRaizServicio()` (patrón de `divipola.json`), así que no hace falta
  copiarlo al build. Pruebas: unit de `SembrarEstilo` y del reporte del comando; integración con
  Testcontainers (tabla vacía → v1; segunda corrida → nada; estilo del usuario → nada; solo una versión
  retirada → nada). La base de desarrollo del usuario (versión 2) no se tocó.
