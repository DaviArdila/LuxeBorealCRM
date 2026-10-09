# Tasks: Fase 12d — Derivar avisa sin silenciar al bot, consentimiento de datos y casos del sistema mínimos

**Estado: aprobada por el dueño el 2026-10-09; en curso desde T1.** La puerta de `luxeboreal-fases` quedó abierta
con `proposal.md`, `specs/`, `design.md` y este archivo. Plan de origen:
`C:\Users\ASUS\.claude\plans\los-casos-de-usos-iridescent-glade.md` y, para las decisiones del 2026-10-09,
`C:\Users\ASUS\.claude\plans\haz-un-an-lisis-del-woolly-mochi.md` §6-8.

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio (regla 6: solo
04/05/06/10); se propone sobre el rango T3-T4 porque cambian la derivación y el consentimiento (R6, R14). Decide el
dueño.

TDD estricto: RED observado → GREEN → REFACTOR. Servidor: Vitest (`npm --prefix servicio test`, `test:integracion`,
`test:e2e`, `evals`); cliente: `npm --prefix cliente run ci`. `npm --prefix servicio run verify` al cerrar cada slice
del servidor. **Cambio de esquema** en T4 y T6: se diseña primero en `MODELO_DATOS.md`; las comprobaciones que Prisma no
expresa (`CHECK`, migración de datos) se escriben a mano y se marcan `[manual]` hasta verlas fallar contra Postgres
real. El esquema es decisión del dueño: aceptó dos columnas en `contacto` y dejar `acepta_contacto` (P68, P69, 2026-10-09).

Ramas: la spec vive en `fase-12d-derivar-sin-silencio` (PR de documentación a `main`). Los slices parten de `main` con
la spec fusionada, uno por tarea, `fase-12d-pK-<tema>`, apilados (`stacked-to-main`, estrategia `auto-chain`, merge
commit, un PR no pasa de ~400 líneas de autoría salvo excepción anticipada abajo). Un commit de unidad de trabajo por
tarea, Conventional Commits (encabezado y cuerpo ≤ 100 caracteres por línea; `npm run commits` antes de subir), sin
atribución de IA. Antes de cada push, la batería completa de `CLAUDE.md`. Cada tarea cita su commit al cerrarse.

## Qué entrega la fase (en términos funcionales)

| Para quién | Resultado |
|---|---|
| Cliente | El bot nunca se calla por «derivar»: sigue informando hasta que entra el asesor. Antes de guardar sus datos, el bot pide aceptar el tratamiento de datos; sin aceptar, responde información general y no guarda nada. |
| Asesor | Un aviso por Telegram **por motivo** (pide una persona, lead caliente, insiste con audios) cuando ocurre, también fuera de horario; el mismo motivo no se repite en la misma sesión bot. Abre el enlace, escribe en Chatwoot y el bot se calla. |
| Back office | Cinco casos del sistema (audio, imagen, falla del modelo, techo de gasto, espera del asesor) con título editable. En las bases existentes, contra entrega, sin cobertura y datos completos fuera de horario pasan a casos de uso normales; desaparecen los dos de traspaso. Una base nueva solo trae «Tratamiento de datos»: los casos de conducta los crea el dueño. |
| Dueño | Lo único fijo en el prompt son seis límites de seguridad; el estilo de respaldo es mínimo y el contexto solo informa hechos. Cómo saluda el bot, cuántas fotos manda, cómo habla del envío o qué pide fuera de horario lo decide él con sus casos y su estilo. |

## Decisiones del dueño (2026-10-09)

| Decisión | Respuesta | Tarea |
|---|---|---|
| Tope de turnos (P65) | Avisa y pasa a espera con «Espera del asesor»; `AGENTE_TOPE_TURNOS` por defecto de 12 a **20** | T3 |
| Aviso fuera de horario (P66) | Sí se envía; el bot sigue atendiendo | T1, T2 |
| Bot ya avisado y el cliente quiere cerrar (P67) | Informa y da precios; no confirma pagos, apartados ni descuentos (AGT28) | T3 |
| Consentimiento (P68, P69) | Dos columnas en `contacto` (`consentimiento_datos_en`, `consentimiento_rechazado_en`); `acepta_contacto` sin tocar | T4 |
| Avisos (P70) | **Uno por motivo**: marca por conversación y motivo; `pide-persona` y `pide-asesor` son el mismo motivo | T1 |
| Presentación como asistente (P71) | En el texto de «Tratamiento de datos», con el pedido de consentimiento | T5 |
| Reglas del prompt (P72) | `seguridad.v1.md` con seis límites; sin negocio ni manual de herramientas | T2 |
| Emojis y estilo de respaldo (P73) | `estilo.v4.md` mínimo y sin prohibiciones; se retira `sinEmojis` | T2 |
| Peso y medidas (P74) | Fuera de fase: `odd/tasks/medidas-en-ficha.md` | — |
| Pie de foto (P75) | No se cambia | — |
| Casos de negocio por defecto | Ninguno; solo «Tratamiento de datos» (privacidad) | T2, T5, T6, T9 |

## Checklist

- [x] T0 — Spec del change, ADR-0027 y preguntas abiertas (documentación; puerta de aprobación del dueño)
- [x] T1 — Efecto `avisar-asesor`: aviso por Telegram sin cambiar de estado, marca «asesor avisado» por motivo y motivo `pide-asesor`
- [ ] T2 — Herramienta `derivar_a_asesor`, `seguridad.v1.md`, `estilo.v4.md` y contexto con hechos
- [ ] T3 — Las políticas que derivan avisan y siguen; tope por defecto 20; se elimina `TextoHandoff`
- [ ] T4 — Consentimiento de datos: esquema, `registrar_consentimiento` y puerta en las herramientas que guardan datos
- [ ] T5 — Se retira el aviso fijo del primer mensaje; nace el caso de uso «Tratamiento de datos»
- [ ] T6 — Contra entrega, sin cobertura y captura completa pasan a casos de uso (migración de datos), la semilla deja de crear casos de negocio y la captura se informa como hecho
- [ ] T7 — `CASOS_DEL_SISTEMA` queda en cinco casos; se ajustan tests y evals
- [ ] T8 — Cliente: título y «cuándo aplica» editables en los casos del sistema y ayuda de herramientas bajo «Cuándo aplica»
- [ ] T9 — Evals, guías de operación (con los casos de ejemplo), `verify-report` y archivo del change

Máximo del change: 10 tareas (T0-T9 = 10).

## Detalle de las tareas

### T0 — Spec del change, ADR-0027 y preguntas abiertas
- **Rama:** `fase-12d-derivar-sin-silencio`. **Sin cambios de producción, sin riesgo de presupuesto.**
- **Entrega:** `proposal.md`, `specs/<dominio>/spec.md` (deltas de privacidad, conversaciones, agente, asistente,
  catalogo, cliente, leads, notificaciones, configuracion-negocio), `design.md`, este archivo,
  `docs/adr/0027-derivar-avisa-sin-silenciar-al-bot.md` (`propuesta`), fila `12d` en `docs/fases/README.md`
  (`spec en revisión`), las preguntas P65-P75 resueltas en `docs/PREGUNTAS_ABIERTAS.md` y la tarea fuera de fase
  `odd/tasks/medidas-en-ficha.md` (P74).
- **Hecho cuando:** el dueño aprueba los cuatro artefactos; solo él pasa el change a `aprobada`.

### T1 — Efecto `avisar-asesor` con marca por motivo
- **Rama:** `fase-12d-p1-avisar-asesor`. **Estimado:** ~450 líneas (`size:exception` anticipada: la marca por motivo suma
  pruebas de integración contra Redis y e2e; se anota en `proposal.md`).
- **Comportamiento:** un turno puede pedir «avisar al asesor» sin pedir traspaso. `conversaciones` encola el aviso de
  Telegram (outbox de `notificaciones`) **sin** pasar a `handoff_pendiente`. Una marca en Redis **por conversación y
  motivo** (`SET NX` sobre el par; `pide-persona` y `pide-asesor` cuentan como el mismo motivo, el cliente pide una persona;
  los otros dos son `lead-caliente` y `audio-repetido`) evita repetir el aviso del mismo motivo; un motivo distinto avisa. Las
  marcas se limpian al pasar a `humano` o volver a `bot`, así que el mismo motivo nunca avisa dos veces en la misma sesión
  bot. El contexto del turno informa que el asesor ya fue avisado (cualquier motivo).
- **Toca:** `agente/dominio/efectos.ts`, `conversaciones/puertos/generador-respuesta.ts` (`MotivoHandoff` y la
  respuesta del turno), `conversaciones/aplicacion/procesar-turno.ts`, una marca nueva junto a
  `infraestructura/redis/marca-espera-handoff.ts` (`adquirir`/`liberar` por par, `limpiar`, `estaAvisado`),
  `notificaciones/aplicacion/aviso-traspaso.ts` (el `Record` exhaustivo exige el motivo `pide-asesor`) y
  `notificaciones/dominio/armar-aviso.ts`.
- **RED primero:** unitarias del procesador (aviso sin cambio de estado, aviso único por motivo, motivo distinto avisa),
  integración de la marca contra Redis real, e2e por webhook con LLM falso.
- **Hecho cuando:** dos peticiones seguidas de asesor generan **un** aviso y el estado sigue en `bot`; después, un lead
  caliente en la misma sesión genera un **segundo** aviso; el eco humano pasa la conversación a `humano` y limpia todas las
  marcas.

### T2 — Herramienta `derivar_a_asesor`, `seguridad.v1.md`, `estilo.v4.md` y contexto con hechos
- **Rama:** `fase-12d-p2-herramienta-derivar`. **Estimado:** ~480 líneas (`size:exception` anticipada: el retiro de
  `sinEmojis` en ~30 casos JSON y el borrado de `reglas.v4.md` y `estilo.v3.md` son eliminaciones mecánicas; se anota en
  `proposal.md`).
- **Comportamiento:**
  - El LLM puede llamar `derivar_a_asesor({ motivo })`. Dentro y fuera de horario emite el efecto de T1 y devuelve
    `{ derivado: true }`; el bot sigue respondiendo en el mismo turno. El motivo escrito por el modelo no se registra en
    logs (R14). Su descripción solo dice qué hace y qué devuelve.
  - `reglas.v4.md` se reemplaza por **`seguridad.v1.md`** (AGT13): seis límites del modelo y de los datos, sin manual de
    herramientas ni reglas de negocio. Las descripciones de `herramientas/*.ts` quedan como contrato técnico neutro (se
    revisan para quitar criterio de negocio). Las líneas de negocio de `reglas.v4.md` (5, 17, 23, 24-25, 27, 31, 33) **no
    se mueven a ningún lado**.
  - `estilo.v3.md` se reemplaza por **`estilo.v4.md`** («Eres un asistente de atención por chat. Responde en español, con
    mensajes cortos y claros.»), sin prohibiciones; solo rige sin secciones de estilo en la base. El estilo que siembra
    `casos:sembrar` (`servicio/prisma/datos/estilo-inicial.md`, EST-D6) pasa al mismo texto mínimo (decisión del dueño,
    2026-10-09); solo se siembra con la tabla vacía, así que no pisa un estilo ya publicado.
  - El contexto del turno pasa a hechos (AGT12): `armar-contexto-inicial.ts:42-43` dice «El cliente llegó desde el producto
    X (id: …)» y `:49` dice «El cliente se llama X». Se elimina «No asumas que quiere lo mismo que la última vez»: no es un
    límite (el contexto no trae intereses anteriores) y la regla 1 de seguridad ya prohíbe inventar (`design.md` D13).
  - Se retira AGT15: la aserción `sinEmojis` de `test/evals/soporte/aserciones.ts` y `esquema-caso.ts`, su uso en los
    casos JSON y el caso negativo `neg-emojis`.
- **Toca:** `agente/aplicacion/herramientas/derivar-a-asesor.ts` (nueva), `agente/agente.module.ts`,
  `agente/aplicacion/herramientas/*.ts` (descripciones), `agente/prompts/seguridad.v1.md` (nueva; se borra
  `reglas.v4.md`), `agente/prompts/estilo.v4.md` (nueva; se borra `estilo.v3.md`),
  `agente/infraestructura/prompts/cargador-prompts.ts`, `agente/aplicacion/ensamblar-prompt.ts`,
  `agente/aplicacion/armar-contexto-inicial.ts` (producto de entrada y nombre), `contenido-llm.ts`,
  `test/integracion/agente/prompts-build.spec.ts`, `test/evals/soporte/{aserciones,esquema-caso}.ts` y los casos de
  `test/evals/casos/sinteticos/`, `prisma/datos/estilo-inicial.md` y las pruebas que lo leen
  (`agente/dominio/{estilo-inicial,secciones-estilo}.spec.ts`, `ensamblar-prompt.spec.ts`,
  `test/integracion/agente/sembrar-estilo.spec.ts`, `test/integracion/persistencia/estilo-secciones-migracion.spec.ts`).
- **Evals que cambian (conducta que ya no da el código):** `r13-una-foto` se reescribe creando el caso «Fotos» en su
  preparación; `r12-ubicacion` se reescribe creando el caso «Ubicación compartida»; `neg-emojis` se retira; `saludo` y
  `entrada-sku-valido` solo pierden `sinEmojis` (no prueban el saludo). Las de contra entrega y cobertura van en T6.
- **RED primero:** spec de la herramienta, `ensamblar-prompt` (la seguridad no trae negocio ni títulos de casos; el respaldo
  es el texto mínimo), `armar-contexto-inicial` (solo hechos), evals guionadas con el caso «el cliente pide un asesor».
- **Hecho cuando:** en evals, la petición de un asesor produce la llamada a la herramienta y un aviso; el prompt fijo solo
  trae los seis límites; el contexto no ordena saludar ni ofrecer la ficha; ninguna eval usa `sinEmojis`.

### T3 — Las políticas que derivan avisan y siguen
- **Rama:** `fase-12d-p3-politicas-avisan`. **Estimado:** ~400 líneas.
- **Comportamiento:** `pide-persona`, el audio repetido y el lead caliente avisan al asesor y el bot sigue (el lead
  caliente deja de reemplazar el texto del modelo). Con el asesor ya avisado, el bot sigue informando y dando precios, pero no
  confirma pagos, apartados ni descuentos (AGT28, P67). El tope de turnos conserva la espera: avisa y responde con «Espera del
  asesor». **El tope por defecto sube de 12 a 20** (P65). Se borra `TextoHandoff`.
- **Toca:** `agente/aplicacion/politicas/{politica-pide-persona,politica-no-textuales,politica-tope-turnos,contenido-llm}.ts`,
  `agente/aplicacion/texto-handoff.ts` (se elimina), `agente/aplicacion/armar-contexto-inicial.ts` (AGT28);
  `servicio/src/plataforma/config/esquema.ts:178` (por defecto 20), `servicio/src/plataforma/config/cargar-configuracion.spec.ts`,
  `servicio/scripts/generar-contrato.ts:95`, `servicio/test/soporte/configuracion-agente-de-prueba.ts` (revisar si algún
  test depende del 12), `servicio/.env.example` y `docs/operacion/avisos-al-asesor.md:28` («12 por defecto» → 20).
- **RED primero:** specs de cada política, de la configuración (el valor por defecto es 20) y e2e por webhook.
- **Hecho cuando:** las tres derivaciones dejan un aviso y la conversación sigue en `bot`; fallo del LLM y techo de
  gasto siguen llevando a `handoff_pendiente`; sin `AGENTE_TOPE_TURNOS` el tope es 20.

### T4 — Consentimiento de datos
- **Rama:** `fase-12d-p4-consentimiento`. **Estimado:** ~450 líneas (`size:exception` anticipada: esquema, migración y
  pruebas de la puerta; se anota en `proposal.md`).
- **Comportamiento:** el cliente acepta o rechaza el tratamiento de datos. Sin aceptar, `guardar_datos_contacto` y
  `marcar_lead_caliente` no guardan ni registran nada y devuelven `requiereConsentimiento`; el contexto del turno
  informa el estado. La puerta es código, no depende del LLM. La fecha sale del `Clock`; el contacto sale del contexto
  del turno, nunca de los argumentos. La descripción de `registrar_consentimiento` dice que registra la respuesta
  explícita del cliente.
- **Toca:** `MODELO_DATOS.md` primero, `servicio/prisma/schema.prisma` y su migración (`[manual]`), el repositorio de
  contactos, `agente/aplicacion/herramientas/{registrar-consentimiento,guardar-datos-contacto,marcar-lead-caliente}.ts`,
  `agente/agente.module.ts`.
- **Esquema decidido (2026-10-09):** dos columnas nulas en `contacto` y `acepta_contacto` sin tocar (P68, P69).
- **RED primero:** integración contra Postgres real y evals guionadas (sin aceptar no se guarda; con «sí» se registra y
  luego se guarda).
- **Hecho cuando:** sin consentimiento no queda ningún dato personal guardado; el rechazo se registra y no se vuelve a
  insistir en el mismo turno.

### T5 — Se retira el aviso fijo; nace «Tratamiento de datos»
- **Rama:** `fase-12d-p5-tratamiento-datos`. **Estimado:** ~250 líneas.
- **Comportamiento:** el primer mensaje deja de llevar el aviso pegado por el código. «Tratamiento de datos» es el **único**
  caso de uso que se siembra (CAS13): su «cuándo aplica» nombra la señal y su texto presenta al bot como asistente
  automatizado y pide la aceptación (P71). En las bases migradas conserva el texto de `aviso_datos`. La parte fija del prompt
  no lo nombra; el contexto informa el estado del consentimiento como hecho.
- **Toca:** `agente/aplicacion/motor-turno.ts` (`conAviso`), `agente/dominio/aviso-datos.ts` (se elimina),
  `asistente/dominio/semilla.ts` y la constante `CASOS_INICIALES_DE_INTENCION` (una sola entrada).
- **RED primero:** `motor-turno.spec.ts` (el primer mensaje ya no antepone aviso), spec del texto de respaldo (CAS5, se
  presenta y pide la aceptación), evals del flujo de aceptación.
- **Hecho cuando:** ningún mensaje del bot lleva el aviso automático; pedir y registrar el consentimiento ocurre antes
  de guardar cualquier dato; borrar el caso no abre la puerta.

### T6 — Casos que pasan a casos de uso, semilla sin casos de negocio y captura como hecho
- **Rama:** `fase-12d-p6-casos-de-uso`. **Estimado:** ~480 líneas (`size:exception` anticipada: migración de datos y
  ajuste de tests y evals; se anota en `proposal.md`).
- **Comportamiento:**
  - `contra_entrega`, `mensaje_fuera_cobertura` y `mensaje_captura_completa` dejan de ser claves del sistema: en las bases
    existentes pasan a casos de intención normales (editables y borrables) conservando el título y el texto del dueño.
  - `semilla.ts` y `casos:sembrar` dejan de crear casos de negocio: una base nueva solo recibe los cinco del sistema y
    «Tratamiento de datos» (CAS6, CAS13).
  - `cotizar_envio` devuelve solo datos (`cobertura:false`, `contraentregaDisponible`); ninguna parte fija del prompt nombra
    un caso de contra entrega o de cobertura.
  - La captura fuera de horario pasa a **un solo hecho** compartido por `armar-contexto-inicial.ts:63-73` y
    `leads/aplicacion/evaluar-propuesta-lead.ts:30`: «Fuera de horario; el cliente mostró intención de compra y faltan sus
    datos de contacto (…)», sin guion ni texto de cierre (LDS4, R10).
- **Toca:** `catalogo/aplicacion/cotizar-envio.ts`, `agente/aplicacion/herramientas/contrato-modelo.ts`,
  `agente/aplicacion/politicas/contenido-llm.ts` (se quita `asegurarMensajeLiteral` del efecto `sin-cobertura`),
  `agente/aplicacion/armar-contexto-inicial.ts` (captura), `leads/aplicacion/evaluar-propuesta-lead.ts`, una migración de
  datos en `servicio/prisma/migrations/` que respete el `CHECK` de `20261006130000_asistente_casos` (`[manual]`),
  `asistente/dominio/semilla.ts`, `scripts/sembrar-casos.ts`, `test/evals/soporte/sembrar.ts` (deja de sembrar
  `contra_entrega` por defecto).
- **Evals que cambian:** `r2-sin-cobertura` y `r2-recargo-sin-porcentaje` crean su caso («Sin cobertura de envío», «Contra
  entrega») en la preparación y consultan `consultar_caso`; los casos que hoy dan por sembrado `contra_entrega` lo declaran
  en su preparación. No hay eval de la captura fuera de horario guiada: no se crea ninguna (la conducta es del dueño); la de
  LDS4 prueba el hecho.
- **RED primero:** integración de la migración contra Postgres real, specs de `cotizar-envio`, de la semilla (una base
  nueva sin casos de negocio) y del hecho de captura, evals de contra entrega y sin cobertura.
- **Hecho cuando:** las filas existentes conservan su texto y quedan editables y borrables; una base nueva no tiene casos
  de negocio; el contexto y la herramienta dicen el mismo hecho de captura.

### T7 — `CASOS_DEL_SISTEMA` queda en cinco
- **Rama:** `fase-12d-p7-sistema-minimo`. **Estimado:** ~300 líneas.
- **Comportamiento:** la lista cerrada queda con audio, imagen, falla del modelo, techo de gasto y espera del asesor.
  Se eliminan `mensaje_handoff`, `mensaje_handoff_fuera_horario` y `aviso_datos` de la lista y de la base (migración de
  datos). `ClaveSistema` se deriva de la lista, así que el compilador marca cada uso pendiente.
- **Toca:** `asistente/dominio/sistema.ts`, `asistente/aplicacion/proveedor-textos.ts` y su puerto,
  `asistente/infraestructura/prisma/repositorio-casos-prisma.ts`, las fakes `test/fakes/textos-asistente-en-memoria.ts`
  y `test/soporte/textos-asistente.ts`, los tests que fijan «once casos» (`semilla.spec.ts`,
  `scripts/sembrar-casos.spec.ts`, `test/integracion/asistente/asistente.spec.ts`), `test/evals/soporte/sembrar.ts`.
- **Hecho cuando:** `npm run casos:sembrar` deja cinco casos del sistema; ningún código lee las claves eliminadas.

### T8 — Cliente: título editable en los casos del sistema y ayuda de herramientas
- **Rama:** `fase-12d-p8-titulo-editable`. **Estimado:** ~220 líneas (~120 del título editable y ~100 de la ayuda de
  herramientas).
- **Comportamiento:**
  - En un caso del sistema se editan texto, categoría, título y «cuándo aplica» (CAS4 ya lo permite); siguen bloqueados
    borrar, desactivar y el modo.
  - **Ayuda de herramientas** (decisión del dueño, 2026-10-08; SHL12, `design.md` D12): bajo «Cuándo aplica» de un caso de
    intención aparecen una línea de ayuda, que dice que las fichas son **sugerencias** y que **el bot decide** cuándo usar
    cada capacidad, y siete fichas con lo que sabe hacer el bot (buscar productos, ver la ficha, cotizar el envío, enviar
    fotos, guardar los datos del cliente, marcar un lead, avisar a un asesor). Tocar una ficha agrega su frase al texto del
    campo; lo guardado sigue siendo texto plano y el contador de `MAXIMO_CUANDO_APLICA` cuenta la frase. No aparece en los
    casos del sistema. Sin columna, sin campo de API y sin cambios en el agente.
- **Toca:** `cliente/src/app/areas/asistente/casos/casos.component.ts` (los `[disabled]="soloTexto()"` del título y de
  «cuándo aplica», el cuerpo del `PATCH`, y la constante con las capacidades del bot y su frase) y
  `casos.component.spec.ts`.
- **RED primero:** spec del componente (el título del caso del sistema se edita y viaja en el `PATCH`; las fichas aparecen
  solo en los casos de intención, con los siete nombres y la línea de ayuda; tocar una agrega su frase y el `PATCH` no lleva
  campos nuevos).
- **Hecho cuando:** `npm --prefix cliente run ci` en verde, el título se guarda desde la ventana de edición y una ficha
  agrega su frase al «cuándo aplica» de un caso de intención. La nota «al sumar una herramienta, agregar su ficha» queda en
  `docs/operacion/cliente-back-office.md` en T9.

### T9 — Evals, guías y cierre
- **Rama:** `fase-12d-p9-cierre`. **Estimado:** ~200 líneas más documentación.
- **Entrega:** evals nuevas (derivación, consentimiento, avisos por motivo), guías `docs/operacion/avisos-al-asesor.md`
  (un aviso por motivo, tope 20) y `cliente-back-office.md` al día (esta última con la ayuda de herramientas y la nota «al
  sumar una herramienta al agente, agregar su ficha en el cliente»), y una sección de **casos de ejemplo** que el dueño puede
  crear —Fotos, Costo del envío, Ubicación compartida, Saludo, Captura fuera de horario, Contra entrega, Sin cobertura—, con
  la aclaración de que no se cargan solos y de que hasta crearlos el bot no tiene esa conducta. También deltas fusionados en
  `openspec/specs/`, `MODELO_DATOS.md` y `docs/migracion/inventario.md` al día, `verify-report.md` con su sección «Qué
  aprendimos que cambia las fases siguientes», change archivado y `docs/fases/README.md` en `cerrada`.
- **Evals retiradas o reescritas en la fase (resumen):** retirada `neg-emojis` (T2); reescritas con su caso en la preparación
  `r13-una-foto`, `r12-ubicacion` (T2), `r2-sin-cobertura`, `r2-recargo-sin-porcentaje` (T6); `sinEmojis` fuera de todos los
  casos (T2).
- **Tareas `[manual]` del dueño (se listan al cerrar, no bloquean):** un aviso real en Telegram, tomar el control desde
  Chatwoot, corrida de evals reales (EVL3, ahora con `seguridad.v1.md` y sin casos de conducta sembrados), prueba por WhatsApp
  del flujo de consentimiento, y crear en «Casos de uso» los casos de ejemplo que quiera.

## Slices de PR (`stacked-to-main`)

| Slice | Tareas | Líneas estimadas |
|---|---|---|
| Documentación | T0 | solo documentos |
| p1 | T1 | ~450 (excepción anticipada) |
| p2 | T2 | ~480 (excepción anticipada) |
| p3 | T3 | ~400 |
| p4 | T4 | ~450 (excepción anticipada) |
| p5 | T5 | ~250 |
| p6 | T6 | ~480 (excepción anticipada) |
| p7 | T7 | ~300 |
| p8 | T8 | ~220 |
| p9 | T9 | ~200 + documentación |

## Registro de ejecución (se llena al implementar)

| Tarea | Ruta (inline / delegada) y evidencia | Commit | PR | Tier de review y resultado |
|---|---|---|---|---|
| T0 | inline (documentación, sin código). Hook `pre-push` en verde con Docker; el CI cayó en `auditoria:cliente` por un aviso crítico de `handlebars` ajeno al cambio y se corrigió aparte | `fe4a818` | #117 (fusionado `ba014f9`); arreglo de CI en #118 (`08e3714`) | passive: revisión estructural |
| T1 | delegada: un writer, RED observado primero. Disparador: 2+ archivos no triviales y lectura que prepara la escritura. Batería completa en verde: lint, typecheck, fronteras, deriva del contrato, unit 1654, integración 460, e2e 114, evals 41 + 1 omitida. Spot check del padre: lint, typecheck y unit repetidos | `bc0b433` | pendiente | medio, `slice_budget_reached`; revisión nativa concedida por el dueño: aprobada, 0 hallazgos, autoridad quemada |
| T2 | pendiente | — | — | — |
| T3 | pendiente | — | — | — |
| T4 | pendiente | — | — | — |
| T5 | pendiente | — | — | — |
| T6 | pendiente | — | — | — |
| T7 | pendiente | — | — | — |
| T8 | pendiente | — | — | — |
| T9 | pendiente | — | — | — |

## Notas de ejecución

### T1 (commit `bc0b433`)
- **Tamaño real:** 1727 líneas agregadas en 31 archivos; **432 de producción** (la estimación era ~450), 1278 de pruebas y
  fakes (50 escenarios en tres niveles: unitario, integración con Redis real y e2e por webhook) y 17 de documentación.
  Cae dentro de la `size:exception` anticipada; la excepción vale por las pruebas, no por lógica.
- **Se deja para T3 (deliberado, fuera de las superficies de T1):**
  - `MotivoHandoff` conserva `audio-repetido`, `lead-caliente` y `pide-persona` como transitorios: las políticas del
    agente y `leads` todavía los emiten. CNV8 («solo cinco motivos») se cumple al cerrar T3.
  - Nada consume aún un aviso `lead-caliente`: el observador de `leads` es de T3. El caso «un lead caliente después de
    pedir un asesor genera un segundo aviso» se probó en e2e con `audio-repetido` como segundo motivo.
  - `ContenidoLlm` traduce `avisar-asesor` a `aviso` sin prioridad entre efectos (D2 es de T3).
  - El agente consumirá el puerto de lectura `ASESOR_AVISADO` (CNV15) para AGT28 en T3.
- **Decisiones del writer a revisar:**
  - TTL de respaldo de la marca: constante de 24 h en el adaptador, sin variable `ASESOR_AVISADO_TTL_H` (la
    configuración quedó fuera de las superficies). Es resiliencia técnica, no un dato del negocio.
  - Se creó `AvisoAsesorModule` dentro de `conversaciones.module.ts`; conviene moverlo a su propio archivo cuando se
    toque ese módulo en T3.
  - `openspec/specs/conversaciones/spec.md` no se tocó: los deltas se fusionan al archivar (T9).

## Mapeo de escenarios por tarea

Cada escenario de los deltas de `specs/` se convierte en al menos un test nombrado `<id del requisito> — <título del
escenario>`. Total: **243 escenarios** en 9 deltas (agente 69, asistente 50, conversaciones 35, leads 24, cliente 18,
notificaciones 18, privacidad 13, catalogo 12, configuracion-negocio 4); los títulos son únicos dentro de cada delta. Los
escenarios que dependen del consentimiento viven en T4 (AGT11 y LDS3) y T5 (LDS4); los del hecho de captura, en T6 (LDS4 y R10),
aunque su requisito aparezca también en T3.

| Tarea | Requisitos (id: escenarios) | Escenarios |
|---|---|---|
| T0 | Ninguno: documentación (deltas, ADR-0027, preguntas) | 0 |
| T1 | CNV13: 4 · CNV14: 8 · CNV15: 3 · CNV11: 4 · CNV12: 7 · CNV8: 6 · NTF3: 4 · NTF6: 5 · NTF8: 9 | 50 |
| T2 | AGT24: 6 · AGT4: 6 · AGT13: 7 · AGT12: 3; elimina AGT15 | 22 |
| T3 | R12: 7 · AGT1: 4 · AGT3: 3 · AGT14: 2 · AGT11: 3 · AGT28: 4 · LDS3: 4 · LDS4: 4 · R10: 1 · R11: 3 · CNV3: 3; elimina `TextoHandoff` | 38 |
| T4 | PRV1: 6 · AGT25: 5 · AGT26: 5 · AGT10: 3 · LDS2: 7 · AGT11: 1 (sin consentimiento) · LDS3: 1 (sin consentimiento) | 28 |
| T5 | R14: 7 · AGT27: 5 · LDS4: 1 (consentimiento pendiente) · CAS13: 2 (validación y texto de «Tratamiento de datos»); elimina AGT2 | 15 |
| T6 | CAS12: 6 · CAS13: 3 · CAS14: 8 · CAS6: 7 · AGT8: 5 · CAT10: 4 · CAT11: 2 · IMP7: 6 · CFG6: 4 · LDS4: 2 (hecho de captura) · R10: 1 (hecho de captura); elimina CAS11 | 48 |
| T7 | CAS4: 8 · CAS7: 6 · CAS8: 10 | 24 |
| T8 | SHL10: 13 · SHL12: 5 (ayuda de herramientas) | 18 |
| T9 | Sin escenarios propios: cierra con las evals guionadas de AGT24, AGT26, AGT27, CAS12 y AGT28, las guías de operación y el `verify-report` | 0 |
| **Total** | 9 dominios · 48 requisitos tocados (31 modificados, de ellos 4 renombrados: CNV11, LDS2, LDS3 y NTF3; 14 nuevos; 3 eliminados: AGT2, AGT15 y CAS11) | **243** |

Requisitos por dominio: `privacidad` R14, PRV1 · `conversaciones` CNV3, CNV8, CNV11 (renombrado), CNV12, CNV13-CNV15 ·
`agente` R12, AGT1, AGT3, AGT4, AGT8, AGT10-AGT14, AGT24-AGT28, quita AGT2 y AGT15 · `asistente` CAS4, CAS6-CAS8,
CAS12-CAS14, quita CAS11 · `catalogo` CAT10, CAT11, IMP7 · `cliente` SHL10, SHL12 · `leads` R10, R11, LDS2 y LDS3
(renombrados), LDS4 · `notificaciones` NTF3 (renombrado), NTF6, NTF8 · `configuracion-negocio` CFG6.
