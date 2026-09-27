# Verify report: Fase 03 - Importador y medios

- Change: `fase-03-importador-medios` - Rama: `fase-03-importador-medios` - Fecha de verificacion: 2026-09-26
- Verificado contra: proposal.md, specs/catalogo/spec.md (IMP1-IMP13), specs/medios/spec.md (MED1-MED9), design.md, tasks.md (T1-T10, las 10 marcadas [x])
- Commits verificados (rama, en orden): 6184871, 0616557, ecfde9d, 17d3abc, 312f2c3, 74f8526, af86ab4, ece9719, 76b4aa7, 858e596, 5e1db77, dfe2c6b

## 1. Cobertura de escenarios (IMP1-IMP13, MED1-MED9, 59 escenarios)

Verificado corriendo `npm test --reporter=verbose` y `npm run test:integracion --reporter=verbose` y
cruzando cada titulo de Scenario contra el nombre exacto de un test. Resultado: los 59 escenarios
tienen un test con su titulo exacto y pasan, distribuidos asi:

- IMP1(2), IMP2(2), IMP3(4), IMP4(3), IMP5(2), IMP6(3), IMP7(5), IMP8(2), IMP9(3), IMP10(3), IMP11(6),
  IMP12(1), IMP13(3): todos presentes y en verde, en validar-catalogo.spec.ts, resolver-lugar.spec.ts,
  fuente-catalogo-directorio.spec.ts, fuente-catalogo-sheets.spec.ts, importar-catalogo.spec.ts,
  repositorio-importacion.spec.ts y scripts/importar-catalogo.spec.ts, tal como los asigno tasks.md.
- MED1(3), MED2(2), MED3(1), MED4(3), MED5(3), MED6(2), MED7(1), MED8(2), MED9(3): todos presentes y en
  verde, en almacenamiento-minio.spec.ts (integracion, MinIO real via Testcontainers),
  descarga-drive.spec.ts (unitario + integracion para MED4), procesar-fotos.spec.ts,
  importar-catalogo.spec.ts (MED7) y collage.spec.ts.

Hallazgo nuevo, no listado por el usuario, menor y ya autodocumentado en el codigo: el test
"IMP13 - --solo-validar reporta los errores de validacion y de fotos inaccesibles sin escribir nada"
(src/modulos/catalogo/aplicacion/importar-catalogo.spec.ts, linea 290) lleva el titulo exacto del
escenario y pasa, pero no verifica la clausula "Entonces" completa: el escenario pide que el comando
reporte "ambos problemas" (error de validacion de una fila mas foto inaccesible de otra); la asercion
real es `expect(reporte.erroresFotos).toEqual([])`, con un comentario explicito arriba (lineas 281-289)
que documenta por que: `validarCatalogoCompleto` devuelve `datos: null` en cuanto hay un error de fila,
asi que `ProcesarFotos` nunca llega a ejecutarse y no puede reportar una foto inaccesible en la misma
corrida. Esto es exactamente la desviacion que el enunciado de esta verificacion pide marcar como
abierta (item 4 de la lista del usuario), confirmada aqui con la evidencia exacta del archivo: el test
no esta roto ni miente sobre su nombre, pero el escenario tal como lo redacto specs/catalogo/spec.md no
queda demostrado punto por punto; queda demostrado el comportamiento real y documentado de la
arquitectura (aborta en el primer error de fila, D6/D7 de design.md, IMP10).

Tambien se confirmo una segunda auto-desviacion documentada honestamente en codigo, no listada por el
usuario y de severidad SUGERENCIA: `ImportarCatalogo` (importar-catalogo.ts, lineas 56-62) documenta que
`FUENTE_CATALOGO` no se registra como provider fijo en `catalogo.module.ts` porque el adaptador (Sheets
vs. Directorio) depende de un flag de CLI en tiempo de ejecucion que solo conoce
`scripts/importar-catalogo.ts` (T10); el modulo expone el token para que el contexto de aplicacion del
CLI lo provea. No afecta ningun escenario ni el criterio de salida; es una decision de cableado
correctamente razonada y visible, no un defecto oculto.

## 2. Criterio de salida de la fase (docs/fases/README.md fila 03)

No se pudo ejecutar `npm run catalogo:importar -- --dir <fixtures>` como proceso de shell
independiente: el clasificador de modo automatico de esta sesion denego la invocacion directa de
`npm run catalogo:importar` (accion marcada "peligrosa" sin mas detalle). Esto es una limitacion del
entorno de esta verificacion, no un hallazgo sobre la fase.

En su lugar se verifico el mismo camino de codigo de forma equivalente:

- `scripts/cli.ts` (lineas 76-78) reenvia el caso `catalogo:importar` literalmente a
  `importarCatalogo(resto)`, sin transformar los argumentos; es exactamente lo que invocaria
  `npm run catalogo:importar -- <flags>`.
- `test/integracion/catalogo/importar-catalogo-cli.spec.ts` llama a esa misma funcion
  `importarCatalogo(['--dir', RUTA_FIXTURES, ...])` contra Postgres/Redis/MinIO reales (Testcontainers)
  y un servidor HTTP local que sirve las fotos del fixture (nunca la red real ni Google Drive). Sus dos
  tests, "--solo-validar reporta un catalogo valido sin escribir nada" y "--dir deja productos, fotos y
  collage listos en MinIO, sin tocar la red real", pasan, confirmando: catalogo valido reportado sin
  escribir nada con `--solo-validar`; con importacion completa, 2 productos (SKU-0001 con 6 fotos +
  collage, SKU-0002 con 1 foto + collage), 2 tarifas, 1 zona sin cobertura, 3 parametros, 2 excepciones
  de horario, y los objetos (foto-1.jpg, collage.jpg) confirmados existentes en MinIO real via
  `HeadObjectCommand`.
- `scripts/importar-catalogo.spec.ts` (unitario) confirma el parseo de argumentos: exactamente uno de
  `--sheet-id`/`--dir` exigido, `--solo-validar` detectado en cualquier posicion.

Hallazgo ambiental real, diagnosticado y resuelto durante esta verificacion: la primera corrida de
`npm run test:integracion` (suite completa) fallo en `importar-catalogo-cli.spec.ts` con
"EADDRINUSE: address already in use 127.0.0.1:47850" y, en cascada, "Cannot read properties of
undefined (reading 'cerrar')" en su `afterAll`. Diagnostico: un proceso Node huerfano (PID 6596, linea
de comando confirmada: un servidor HTTP ad-hoc identico al de `test/fixtures/catalogo/servidor-fotos.ts`,
con el mismo puerto fijo 47850) habia quedado corriendo desde una verificacion manual anterior de esta
misma fase (probablemente una corrida manual del criterio de salida durante `sdd-apply`, nunca cerrada).
El puerto es fijo por diseno documentado (`servidor-fotos.ts`, lineas 6-13: el CSV del fixture
referencia ese puerto literal, sin mecanismo de plantillas). Se termino el proceso huerfano y se repitio
la suite completa: 80/80 tests de integracion en verde, incluidos los 2 de
`importar-catalogo-cli.spec.ts`. Esto no es la contencion de Testcontainers que anticipaba el enunciado
de esta verificacion (Postgres/Redis/MinIO arrancaron sin problema en todas las corridas); es un puerto
HTTP fijo del fixture de fotos quedando ocupado por un proceso de una sesion anterior sin cerrar. Se
reporta como hallazgo ambiental de esta maquina/sesion, no como fallo de la fase: el codigo de la fase
no tiene ningun defecto que lo cause; ejecutar la suite en una maquina/sesion limpia no lo reproduciria.

## 3. Puertas de calidad

Todas ejecutadas realmente, no asumidas:

| Comando | Resultado |
|---|---|
| `npm test` (proyecto unit) | OK: 56 archivos, 286 tests, todos en verde |
| `npm run test:integracion` (tras resolver el hallazgo ambiental de la seccion 2) | OK: 20 archivos, 80 tests, todos en verde |
| `npm run lint` | OK: sin salida, sin errores |
| `npm run typecheck` | OK: sin salida, sin errores |
| `npm run fronteras` | OK: no dependency violations found (171 modules, 378 dependencies cruised) |
| `npm run contrato:deriva` | OK: ambos documentos (openapi.json, openapi.interno.json) coinciden byte a byte; consistente con design.md, esta fase no toca el contrato OpenAPI |
| `npm run verify` (secuencia completa) | OK: verde de punta a punta tras resolver el hallazgo de la seccion 2: 76 archivos, 366 tests, exit code 0 |

`npm run verify` mostro en su salida un error no bloqueante de un subproceso ("npm error code
EALLOWSCRIPTS ... --allow-scripts is not allowed in project-scoped installs"), disparado por el paso de
commits/git-cliff dentro de la cadena de scripts de npm. No afecto el resultado final (exit code 0,
366/366 tests en verde) y no es un hallazgo de esta fase; no se investigo mas a fondo porque cae fuera
del alcance de catalogo/medios.

## 4. Decisiones de design.md, seccion Open Questions (D3, D5, D6, D7, D11, D12)

Todas confirmadas implementadas exactamente como las fijo el diseno, leyendo el codigo real (no solo
los tests):

- D3 (bucket publico, sin URL firmada): `AlmacenamientoMinio.obtenerUrl` construye la URL publica de
  forma sincrona envuelta en `Promise.resolve`, sin `getSignedUrl`. Confirmado por los 3 tests de MED1
  en verde contra MinIO real.
- D5 (catalogo depende de modulos/geografia, sin ampliar RepositorioGeografia):
  `resolver-geografia-importacion.ts` inyecta `REPOSITORIO_GEOGRAFIA` y compone `listarDepartamentos()`
  con `listarCiudadesDe()`; `resolver-lugar.ts` (dominio) no importa nada de geografia, solo
  `compartido/texto`; confirmado leyendo ambos archivos y por `npm run fronteras` en verde (la regla
  dominio-aislado no se violo).
- D6 (transaccion abierta dentro del repositorio, no por un servicio generico):
  `RepositorioImportacionPrisma.escribirTodoONada` abre `this.prisma.$transaction(...)` internamente;
  `ImportarCatalogo` nunca importa Prisma. Confirmado por el escenario de rollback de IMP11 en verde
  contra Postgres real.
- D7 (fotos antes de la transaccion; borrado de sobrantes despues de que confirma):
  `importar-catalogo.ts` (lineas 92-155) muestra el orden exacto: `leerEstadoActualPorSku`, luego
  `ProcesarFotos.ejecutar`, luego `escribirTodoONada`, y solo entonces
  `ALMACENAMIENTO.eliminar(clave)` por cada foto sobrante. Confirmado por el test de MED7 en verde.
- D11 (CLI en scripts/, no en src/): `scripts/importar-catalogo.ts` existe con el patron de
  `NestFactory.createApplicationContext` de `scripts/sembrar-geografia.ts`; `scripts/cli.ts` tiene el
  caso `catalogo:importar`.
- D12 (collage.ts en medios/aplicacion/, no en medios/dominio/): confirmado por la ruta real del
  archivo y por `npm run fronteras` en verde.

## 5. Hallazgos abiertos (no resueltos por esta fase, para que el usuario decida)

Los cuatro que pidio el enunciado, confirmados con evidencia directa del repositorio en esta sesion:

1. Imagen de MinIO: `docker-compose.yml` (linea 58) y `test/soporte/contenedores.global-setup.ts`
   (linea 63) usan `bitnamilegacy/minio:latest`, no `minio/minio`; ambos archivos documentan en
   comentario extenso el motivo (Docker Hub retiro la imagen oficial gratuita en 2025,
   `quay.io/minio/minio` exige login). Es una decision de infraestructura tomada por necesidad durante
   `sdd-apply`, no aprobada explicitamente por el usuario. Abierto.
2. `.env.example` sin las 8 variables MINIO_*/CATALOGO_SHEET_ID: no se pudo verificar directamente el
   contenido de `.env.example` en esta sesion de verificacion; el permiso de sandbox de esta sesion
   bloquea leer archivos `.env*`, igual que documento `sdd-apply` durante toda la fase. Se toma como
   cierto lo que reportaron las tareas: sigue pendiente. Abierto.
3. `ResultadoImportacion.productosActivados`: confirmado en `repositorio-importacion-prisma.ts`
   (linea 200): `productosActivados: datos.productos.length`; cuenta el total de productos importados
   en esta corrida, no los que quedan `activo=true` despues de la escritura. Ningun escenario de las
   specs depende de este valor (es solo un contador informativo del resultado), asi que no bloquea
   ningun test. Abierto, no bloqueante.
4. IMP13 combinado no demostrado punto por punto: confirmado en la seccion 1 de arriba con la ubicacion
   exacta del test y el comentario que lo documenta. Abierto, no bloqueante (comportamiento real y
   consistente con design.md, no oculto).

## 6. Veredicto

- Las 10 tareas de tasks.md estan marcadas como completas, cada una con su commit de unidad de trabajo
  verificado en git log.
- Los 59 escenarios de las specs delta tienen un test con su titulo exacto y pasan (con la desviacion
  documentada del item 4 de la seccion 5, ya conocida y aceptada por diseno).
- El criterio de salida de la fase (docs/fases/README.md fila 03) queda demostrado por la via
  equivalente de `importar-catalogo-cli.spec.ts` (la invocacion directa de shell fue bloqueada por el
  entorno de esta verificacion, no por la fase).
- `npm run lint`, `npm run typecheck`, `npm run fronteras`, `npm run contrato:deriva` y `npm run verify`
  completo estan en verde (366/366 tests), tras resolver un hallazgo ambiental de esta maquina (proceso
  huerfano en un puerto fijo), no de la fase.
- Las decisiones D3/D5/D6/D7/D11/D12 de design.md estan implementadas tal como el usuario las acepto al
  decir "procede".
- Quedan 4 hallazgos abiertos (seccion 5), todos ya conocidos, ninguno bloqueante para el codigo ni los
  tests.

Recomendacion: la fase esta lista para sdd-archive. Los hallazgos abiertos de la seccion 5 no son
defectos de codigo sin resolver; son decisiones de infraestructura/negocio pendientes de una
confirmacion explicita del usuario (imagen de MinIO, variables de .env.example) o comportamientos
menores ya documentados y aceptados (contador informativo, escenario combinado no demostrable con el
contrato actual). Ninguno impide fusionar los delta specs ni cerrar la fase; se recomienda que el
usuario los revise en la sesion de aprobacion de archivo, no que bloqueen sdd-archive.
