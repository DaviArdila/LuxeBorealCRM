# Tasks: Fase 12 — Casos de uso del asistente, estilo desacoplado y configuración del negocio

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio (regla 6: solo
04/05/06/10); se propone sobre el rango T5-T6 porque cambian lo que el LLM lee (R1, R2). Decide el dueño.

TDD estricto: RED observado → GREEN → REFACTOR. Servidor: Vitest (`npm --prefix servicio test`, `test:integracion`,
`test:e2e`, `evals`); cliente: `npm --prefix cliente run ci`. `npm --prefix servicio run verify` al cerrar cada slice del
servidor y `npm --prefix cliente run ci` al cerrar cada slice del cliente. **Cambio de esquema** en T3, T4 y T11: se
diseña primero en `MODELO_DATOS.md` y las comprobaciones de la base que Prisma no expresa (índice único parcial,
`CHECK`) se escriben a mano y se marcan `[manual]` hasta verlas fallar contra Postgres real.

Ramas: la spec vive en `fase-12-casos-del-asistente` (PR de documentación a `main`). Los slices parten de `main` ya
con la spec fusionada, uno por tarea, `fase-12-pK-<tema>`, apilados (`stacked-to-main`, estrategia `auto-chain`, merge
commit, un PR no pasa de ~400 líneas de autoría salvo la excepción anticipada de abajo). Un commit de unidad de
trabajo por tarea, Conventional Commits (encabezado y líneas del cuerpo ≤ 100 caracteres: `npm run commits` antes de
subir), sin atribución de IA. Antes de cada push, la batería completa de `CLAUDE.md`. Cada tarea cita su commit al
cerrarse.

## Partición de la fase

`openspec/config.yaml` limita un change a 10 tareas y esta fase tiene 12, así que se parte en **tres subfases** de
≤ 10 tareas cada una, con una sola spec y una sola aprobación. Si el dueño prefiere tres changes separados
(`fase-12a-…`, `fase-12b-…`, `fase-12c-…`), se copian las tareas tal cual.

| Subfase | Tareas | Qué deja en pie | Sale con… |
|---|---|---|---|
| **12a** Cliente y estilo | T1-T3 | Menú lateral con submódulos, ventana emergente de edición, Estilo al patrón y desacoplado | El dueño ve el menú nuevo, edita el estilo en una ventana y ve quién publicó; el bot responde igual |
| **12b** Casos de uso | T4-T8 | Módulo `asistente`, textos del sistema por un puerto, `consultar_caso`, API y pantalla de casos | El dueño crea el caso «Medios de pago» y el bot lo usa por WhatsApp; edita el de audio y rige |
| **12c** Configuración y cierre | T9-T12 | Configuración del negocio, limpieza total, guía y cierre | El dueño cambia el recargo y la siguiente cotización lo refleja; no queda nada del sistema viejo |

**Resultado: 12 tareas** (12a: 3 · 12b: 5 · 12c: 4).

## Checklist

- [ ] T1 — Menú lateral con submódulos (cliente)
- [ ] T2 — Ventana emergente de edición compartida y «Estilo del bot» al patrón (cliente)
- [ ] T3 — Estilo desacoplado: tabla `version_estilo` y «quién publicó»
- [ ] T4 — Base del asistente: tablas, módulo, puerto de textos y semilla (sin cambiar el comportamiento)
- [ ] T5 — Corte de los textos del sistema al puerto del asistente (sin cambiar el comportamiento)
- [ ] T6 — `consultar_caso`, índice de casos y contra entrega; se borran las políticas de `catalogo`
- [ ] T7 — API de categorías y casos con buscador y contrato
- [ ] T8 — Pantalla «Casos de uso»; se retira «Mensajes fijos»
- [ ] T9 — Configuración del negocio: registro tipado, endpoints e invalidación de cachés
- [ ] T10 — Pantallas de Configuración
- [ ] T11 — Limpieza final: cero referencias al sistema viejo
- [ ] T12 — Guía de operación, cierre documental y tareas `[manual]` del dueño

## Mapeo de escenarios por tarea (142 escenarios, 33 requisitos nuevos más R15 y CLT9 modificados)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | SHL1 (3); SHL2 (2); SHL3 (2); SHL4 (3); SHL5 (2); SHL6 (2); SHL7 (2). CLT9 sigue verde | 16 |
| T2 | SHL8 (7); SHL9 sin «autor» (4: publicar, rechazo, restaurar, remite a Casos de uso) | 11 |
| T3 | EST-D1 (3); EST-D2 (4); EST-D3 (4); EST-D4 «conserva el vigente» y «sin estilo» (2); EST-D5 (2); SHL9 «muestra el vigente con su autor» (1) | 16 |
| T4 | CAS1 (3); CAS4 «existen después de sembrar» (1); CAS6 (5); CAS7 «sin fila», «base caída», «sin Redis» (3) | 12 |
| T5 | CAS7 «Editar el caso de un evento cambia la respuesta del siguiente evento» (1) + regresión: evals y e2e actuales sin editar | 1 |
| T6 | CAS8 (9); CAS11 (3); CAS7 «Ningún otro módulo lee un texto desde parametro» (1) | 13 |
| T7 | CAS2 (6); CAS3 (5); CAS4 resto (4); CAS5 (7); CAS9 (4); CAS10 (6) | 32 |
| T8 | SHL10 (8). CLT9 «área `asistente`» | 8 |
| T9 | CFG1 (4); CFG2 (6); CFG3 (3); CFG4 (4); CFG5 (2); CFG6 «fuera del registro» y «tipo equivocado» (2) | 21 |
| T10 | SHL11 (6) | 6 |
| T11 | CFG6 «no quedan textos ni estilo» y «el importador rechaza» (2); EST-D4 «las claves viejas desaparecen» (1); R15 (3) | 6 |
| T12 | (sin escenarios: guía, cierre y pruebas `[manual]`) | 0 |

## Tareas

### T1 — Menú lateral con submódulos (cliente)

- **Alcance**: `EntradaDeMenu` gana `hijos` (`nucleo/definicion-area.ts`); el shell (`shell/`) pasa a un menú lateral con
  grupos desplegables, ítem activo con `aria-current`, filtrado por rol de entradas e hijos, modo compacto con
  preferencia local (con `try/catch`), cajón en teléfono y pie con usuario, rol y «Cerrar sesión». Se arma desde
  `areas/registro/registro.ts`. Colores y espaciados solo con tokens `--mat-sys-*`; repaso de estilos de las pantallas
  existentes.
- **Pruebas**: componentes del shell y del menú en `cliente/src/app/shell/`; `npm --prefix cliente run ci`. RED: el menú
  actual no tiene grupos ni compacto, los 16 escenarios fallan primero.
- **Ruta**: delegada (un escritor, 2+ archivos no triviales). **Slice**: `fase-12-p1-menu-lateral`. **Forecast**: ~450
  líneas (con tests).
- **Docs en el mismo commit**: `docs/operacion/cliente-back-office.md` (menú y cómo registrar un grupo).
- **Evals**: no aplican (sin cambios en el servidor).

### T2 — Ventana emergente de edición compartida y «Estilo del bot» al patrón (cliente)

- **Alcance**: componente `DialogoEdicion` en `compartido/` sobre `MatDialog` (reutiliza `confirmacion` y
  `editor-con-contador`): contador, error del servidor dentro, Guardar/Cancelar, confirmación al cerrar con cambios,
  foco entra y vuelve. La pantalla «Estilo del bot» pasa a modo lectura + «Editar»; el historial y restaurar no cambian;
  se agrega el aviso que remite a «Casos de uso». Test de estructura que prohíbe formularios de edición fijos en las áreas.
- **Pruebas**: `compartido/dialogo-edicion.component.spec.ts` y `areas/bot/estilo/estilo.component.spec.ts` (el área
  se llama aún `bot`; T8 la renombra). RED: tests de la ventana y reescritura de los de la pantalla.
- **Ruta**: delegada. **Slice**: `fase-12-p2-ventana-edicion`. **Forecast**: ~400 líneas.
- **Docs**: sección «Edición en ventana emergente» en `cliente-back-office.md`.
- **Evals**: no aplican.

### T3 — Estilo desacoplado: tabla `version_estilo` y «quién publicó»

- **Alcance**: `MODELO_DATOS.md` primero (decisión del dueño, P62); `version_estilo` (versión, texto, vigente, fecha,
  `publicado_por`) con índice único parcial de la vigente `[manual]`; migración que **copia** el estilo y su historial
  de `parametro` conservando números; nuevo `RepositorioEstiloPrisma` detrás del puerto sin tocar `RepositorioEstilo`;
  `publicadoPor` en `obtenerEstilo` y `listarHistorialEstilo` (contrato y cliente generado); el comando
  `prompt:estilo` publica con autor nulo; la pantalla muestra el autor (cierra SHL9).
- **Pruebas**: `agente/infraestructura/prisma/` (integración con Postgres real), `agente/interfaz/estilo.controller.spec.ts`,
  los tests de AGT18-AGT23 **sin editar sus escenarios**, `npm --prefix servicio run test:integracion`, `contrato:deriva`,
  cliente `api:deriva`. RED: la tabla y el campo no existen.
- **Ruta**: delegada. **Slice**: `fase-12-p3-estilo-desacoplado`. **Forecast**: ~400 líneas (migración y cliente
  generado no cuentan como autoría).
- **Docs**: `MODELO_DATOS.md`, `docs/operacion/estilo-del-bot.md`, ADR-0024 (estado).
- **Evals**: `npm --prefix servicio run evals` en verde sin cambios (el estilo se aplica igual).
- Las claves `prompt_estilo*` de `parametro` **se conservan** hasta T11 (rollback).

### T4 — Base del asistente: tablas, módulo, puerto de textos y semilla (sin cambiar el comportamiento)

- **Alcance**: `MODELO_DATOS.md` primero; tablas `categoria_caso` y `caso_asistente` con sus restricciones (título único
  insensible a acentos, un solo caso por clave del sistema, `CHECK` de disparador y modo `[manual]`); módulo
  `servicio/src/modulos/asistente/` con dominio (`sistema.ts` con los once casos del sistema y su respaldo, validación
  de CAS5), puertos y repositorios Prisma, `TextosAsistente` + `ProveedorTextos` (copia por versión Redis, patrón de
  `ProveedorEstilo`) y `npm run casos:sembrar` (categorías «Sistema» y «Políticas», casos del sistema y una política por
  cada `politica_<tema>`, retirando de `parametro` las filas que copió). **Nada lo consume todavía.**
- **Pruebas**: `asistente/**` (unit), integración con Postgres y Redis reales, semilla idempotente. RED: el módulo no
  existe.
- **Ruta**: delegada. **Slice**: `fase-12-p4-base-asistente`. **Forecast**: ~550 líneas (`size:exception` anticipada
  en `proposal.md`: esquema y ~60 % de tests).
- **Docs**: `MODELO_DATOS.md`, ADR-0024, `openspec/specs/asistente/spec.md` (se fusiona al cerrar).
- **Evals**: sin cambios.

### T5 — Corte de los textos del sistema al puerto del asistente (sin cambiar el comportamiento)

- **Alcance**: `agente`, `conversaciones`, `catalogo` y `llm` piden sus textos a `TextosAsistente`; se borran sus
  lectores sueltos de `parametro` para textos (`repositorio-parametro-conversaciones-prisma`, la parte de texto de
  `catalogo/infraestructura/repositorio-parametro-prisma`, `llm/.../repositorio-parametro-llm-prisma` y
  `repositorio-parametro-agente-prisma`); `TEXTOS_FIJOS_*` de cada módulo pasan a la lista única de `asistente`. El
  módulo `mensajes-fijos` queda como adaptador delgado sobre `asistente` (mismo contrato HTTP) para que la pantalla
  actual siga editando lo que el bot lee hasta T8. Dependencia nueva permitida en `dependency-cruiser`: módulo →
  `asistente` (solo por su barril).
- **Pruebas**: e2e `agente-politicas.e2e-spec.ts`, `agente-llm.e2e-spec.ts` y las evals guionadas **sin editar sus
  aserciones**; escenario nuevo de CAS7 (editar el caso de audio cambia la respuesta). `npm run fronteras`. RED:
  el e2e nuevo falla mientras el audio lea de `parametro`.
- **Ruta**: delegada (mapea 4 módulos). **Slice**: `fase-12-p5-corte-textos-sistema`. **Forecast**: ~350 líneas.
- **Docs**: spec de `conversaciones` y `llm` (el texto viene del puerto), ADR-0024.
- **Evals**: `evals` en verde, 100 %.

### T6 — `consultar_caso`, índice de casos y contra entrega; se borran las políticas de `catalogo`

- **Alcance**: herramienta `consultar_caso({ titulo })` (reemplaza `consultar_politica`), índice de casos de intención
  activos en el prompt con tope de 60 casos y 6.000 caracteres, modos `literal` y `guia`, `reglas.v4.md` (la regla de
  cita literal y cuándo consultar un caso), `cotizar_envio` adjunta el caso `contra_entrega` (CAS11); se borran
  `catalogo/dominio/politica.ts`, `ConsultarPolitica` y su repositorio; test estático de «ningún módulo lee un texto de
  `parametro`» (CAS7).
- **Pruebas**: `agente/aplicacion/herramientas/consultar-caso.spec.ts`, armado del prompt, evals guionadas nuevas
  (`literal`, `guia`, índice grande, caso inexistente), e2e con un caso creado por caso de uso. RED: ninguna herramienta
  `consultar_caso`.
- **Ruta**: delegada. **Slice**: `fase-12-p6-consultar-caso`. **Forecast**: ~450 líneas.
- **Docs**: spec de `agente` (AGT8 modificado), `openspec/specs/catalogo/spec.md` (CAT12 retirado al archivar).
- **Evals**: `evals` en verde 100 % con los casos nuevos. **Tarea para el dueño en T12**: corrida real (EVL3), porque
  cambia lo que lee el LLM.

### T7 — API de categorías y casos con buscador y contrato

- **Alcance**: `AsistenteController` con las diez operaciones de CAS9 (solo `admin`), casos de uso de categorías y casos,
  conflicto por `actualizado` (`caso-modificado`), búsqueda con `q` sin acentos ni mayúsculas, filtros y paginación por
  cursor (API5), errores RFC 9457 con los códigos de CAS9, `openapi/openapi.json` regenerado y cliente HTTP generado.
- **Pruebas**: `asistente/interfaz/*.spec.ts`, integración (búsqueda y cursor contra Postgres), `contrato:deriva`,
  `contrato:lint`, cliente `api:deriva`. RED: las rutas no existen.
- **Ruta**: delegada. **Slice**: `fase-12-p7-api-casos`. **Forecast**: ~600 líneas (`size:exception` anticipada: contrato
  y cliente generados, ~60 % tests).
- **Docs**: `docs/operacion/` (rutas), contrato.
- **Evals**: sin cambios.

### T8 — Pantalla «Casos de uso»; se retira «Mensajes fijos»

- **Alcance**: el área `bot` pasa a `asistente` con «Casos de uso» y «Estilo del bot» (movida); lista por categoría con
  contador, buscador con retardo de 300 ms, filtros, ventana de caso, etiqueta «Sistema» sin borrar ni desactivar,
  gestión de categorías, estado vacío. Se borran la pantalla «Mensajes fijos», el módulo `mensajes-fijos` del servidor
  (con sus endpoints) y `npm run mensajes:sembrar`; contrato y cliente regenerados.
- **Pruebas**: componentes de `areas/asistente/casos/`, fronteras del lint, `npm --prefix cliente run ci`, `npm run ci` en
  la raíz. RED: la pantalla no existe.
- **Ruta**: delegada. **Slice**: `fase-12-p8-pantalla-casos`. **Forecast**: ~550 líneas (`size:exception` anticipada).
- **Docs**: `docs/operacion/cliente-back-office.md`, `docs/operacion/casos-del-asistente.md` (nueva).
- **Evals**: `evals` en verde.

### T9 — Configuración del negocio: registro tipado, endpoints e invalidación de cachés

- **Alcance**: módulo `configuracion` con el registro tipado de claves de `parametro` (Zod por clave), grupos Horario,
  Envíos y Gasto del LLM (CFG1-CFG4), horario por día escrito en siete claves explícitas, excepciones sobre
  `excepcion_horario`, invalidación de la caché del catálogo tras guardar (CFG5), contrato y cliente generado. T9
  verifica primero que el lector de `horario/` acepta claves de un solo día.
- **Pruebas**: unit del registro y de la serialización del horario, integración con Postgres y Redis, `contrato:deriva`.
  RED: ninguna ruta de configuración.
- **Ruta**: delegada. **Slice**: `fase-12-p9-configuracion-api`. **Forecast**: ~500 líneas (`size:exception` anticipada).
- **Docs**: `docs/operacion/configuracion-del-negocio.md` (nueva), spec de `configuracion-negocio` (se fusiona al cerrar).
- **Evals**: `evals` en verde (el recargo sigue calculándose en código, R1).

### T10 — Pantallas de Configuración

- **Alcance**: área `configuracion` con «Horario», «Envíos» y «Gasto del LLM» en el menú lateral, solo `admin`, con la
  ventana de edición, motivo de cada campo en el `422` y el aviso de que rige desde el siguiente mensaje.
- **Pruebas**: componentes del área; `npm --prefix cliente run ci`. RED: el área no existe.
- **Ruta**: delegada. **Slice**: `fase-12-p10-configuracion-pantallas`. **Forecast**: ~550 líneas (`size:exception`
  anticipada).
- **Docs**: `cliente-back-office.md`.
- **Evals**: no aplican.

### T11 — Limpieza final: cero referencias al sistema viejo

- **Alcance**: migración que borra de `parametro` las claves `prompt_estilo*` (ya copiadas en T3); el importador rechaza
  las filas de texto de `parametros.csv` (CFG6) y los textos de desarrollo pasan a un archivo para `casos:sembrar`
  (`servicio/datos-desarrollo/asistente/`); se retiran los restos (`TEXTOS_FIJOS_*` huérfanos, tipos y tests muertos);
  `rg` confirma cero referencias a `mensajes-fijos`, `politica_`, `consultar_politica` y a lectores sueltos de
  `parametro` para textos.
- **Pruebas**: integración (parametro sin claves de texto ni estilo), test de fronteras, `npm run ci` completo. RED: el
  test de «sin claves» falla mientras existan.
- **Ruta**: inline si es mecánico; delegada si el barrido supera los 3 archivos no triviales. **Slice**:
  `fase-12-p11-limpieza`. **Forecast**: ~300 líneas (en su mayoría borrados).
- **Docs**: `MODELO_DATOS.md`, `CLAUDE.md` (comandos: se quita `mensajes:sembrar`, se agrega `casos:sembrar`).
- **Evals**: `evals` en verde.

### T12 — Guía de operación, cierre documental y tareas `[manual]` del dueño

- **Alcance**: fusionar los delta specs en `openspec/specs/` (`asistente` nuevo; `configuracion-negocio`, `cliente`,
  `agente`, `catalogo` actualizados), `docs/operacion/casos-del-asistente.md` y `configuracion-del-negocio.md`
  completos, `docs/fases/README.md`, ADR-0024 a la espera de aceptación, `verify-report.md` con «Qué aprendimos que
  cambia las fases siguientes», archivar el change.
- **`[manual]` del dueño**: (1) corrida de evals reales con su clave (límite de 2 USD, P32/P40) tras el índice de casos;
  (2) prueba por WhatsApp: crear el caso «Medios de pago», preguntarlo y editar el caso de audio; (3) recorrido real del
  menú, la ventana de edición, el estilo y la configuración; (4) comprobar a mano los `CHECK` y el índice único parcial
  de T3 y T4 contra Postgres.
- **Ruta**: inline (documentos). **Slice**: `fase-12-p12-cierre`. **Forecast**: ~200 líneas documentales.
- Las tareas `[manual]` pendientes se listan al cerrar y no bloquean lo que no dependa de ellas.

## Entrega

- Estrategia: `auto-chain` con cadena `stacked-to-main` (CLAUDE.md «Publicar y encadenar fases»). Slices: p1-p12, uno
  por tarea, apilados; la subfase 12a (p1-p3) es independiente del servidor de casos y puede publicarse primero.
- Excepciones `size:exception` **anticipadas** (motivadas en `proposal.md`, Risks): T4, T7, T8, T9 y T10. Se aplican
  automáticamente al cerrarlas, anotando las líneas reales en la tarea.
- El orden dentro de cada subfase es obligatorio; entre subfases, 12a puede ir primero y en paralelo a 12b mientras
  no comparten archivos (la excepción es el cliente generado: se rebasa).
- Una desviación de la spec se anota en este archivo o en `design.md` antes de seguir; si cambia un criterio de
  aceptación, se avisa al dueño.
