# Proposal: Fase 12d — Derivar avisa sin silenciar al bot, consentimiento de datos y casos del sistema mínimos

- Change: `fase-12d-derivar-sin-silencio` · Fase de la hoja de ruta: **12d** · Rama de la spec: `fase-12d-derivar-sin-silencio`
- Fecha: 2026-10-08 (decisiones del dueño incorporadas el 2026-10-09) · Estado: **aprobada por el dueño el 2026-10-09** («procede con la implementación»)
- Depende de: **Fase 12 cerrada** (casos del asistente), 08d (avisos con enlace) y 07b/08 (herramientas y leads), todas fusionadas en `main`.
- ADR: [0027](../../../../docs/adr/0027-derivar-avisa-sin-silenciar-al-bot.md) (`propuesta`). Se apoya en 0016 y 0024.
- Plan de origen: `C:\Users\ASUS\.claude\plans\los-casos-de-usos-iridescent-glade.md` (decisiones del 2026-10-08) y
  `C:\Users\ASUS\.claude\plans\haz-un-an-lisis-del-woolly-mochi.md` §6-8 (decisiones del 2026-10-09).

> **Resumen.** Hoy, cuando el bot «deriva», la conversación pasa a `handoff_pendiente` y el bot se calla. Esta fase cambia
> el paradigma: **derivar es avisar**. El asesor recibe un aviso por Telegram (uno por motivo), el bot sigue atendiendo y solo
> se calla cuando el asesor abre o escribe en Chatwoot (CNV5). El aviso fijo de datos del primer mensaje (R14) pasa a ser un
> **consentimiento**: sin aceptar, el bot no guarda datos ni registra leads. Los casos del sistema bajan de once a cinco. Y el
> código deja de fijar conducta de negocio: el prompt fijo queda en **seis límites de seguridad**, el contexto informa
> **hechos** y la conducta la define el dueño con sus casos de uso y su estilo.

## Intent

Cuatro problemas del comportamiento actual, todos de cara al cliente o al dueño:

1. **El bot se calla al derivar.** Pedir una persona, repetir un audio o ser un lead caliente mueve la conversación a
   `handoff_pendiente` (CNV8, CNV11). Si el asesor tarda, el cliente queda sin respuesta aunque el bot podría seguir
   informando precios, envíos y políticas.
2. **El aviso de datos es una regla fija del código.** El primer mensaje antepone `aviso_datos` (AGT2, R14), pero el
   cliente nunca acepta nada: el sistema guarda sus datos con solo haberle avisado.
3. **Once casos del sistema están bloqueados.** Entre ellos hay textos que el LLM podría manejar con criterio (contra
   entrega, sin cobertura, cierre de captura) y dos textos de traspaso que dejan de tener sentido si derivar no cambia
   el estado.
4. **La conducta del bot vive en el código.** `reglas.v4.md`, `estilo.v3.md` y el contexto del turno fijan cómo saludar,
   cuántas fotos mandar, cómo hablar del envío o qué pedir fuera de horario. El dueño no puede cambiarlo sin desplegar (R15).

Éxito: el cliente que pide un asesor recibe respuesta en el mismo turno y el asesor recibe **un aviso por motivo**; el cliente
que no acepta el tratamiento de datos sigue informándose pero no deja ningún dato guardado; el back office muestra cinco casos
del sistema con título editable y los demás como casos de uso normales; y lo único fijo en el prompt son los límites de
seguridad.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Qué es derivar | Notificar al asesor sin cambiar el estado; el bot sigue hasta que el asesor entra | Dueño, 2026-10-08 |
| Aviso de datos | Se reemplaza por consentimiento: caso de uso «Tratamiento de datos»; sin aceptar no se guardan datos ni leads | Dueño, 2026-10-08 |
| Casos del sistema | Quedan solo los textos que el código envía cuando el LLM no puede hablar (5) | Dueño, 2026-10-08 |
| Qué sigue yendo a `handoff_pendiente` | `fallo-llm`, `techo-gasto`, `argumentos-invalidos`, `plazo-agotado` y `tope-turnos` | Dueño, 2026-10-08 y 2026-10-09 (P65) |
| Título de los casos del sistema | Se vuelve editable | Dueño, 2026-10-08 |
| Ayuda de herramientas bajo «Cuándo aplica» | Solo una ayuda visual en el cliente (fichas que agregan una frase al texto); sin columna, sin campo de API y sin cambios en el agente; la línea de ayuda dice que son sugerencias y que el bot decide | Dueño, 2026-10-08 y 2026-10-09 (SHL12, `design.md` D12) |
| Control total del dueño sobre la conducta | El código da hechos y límites; no se siembra ningún caso de negocio salvo «Tratamiento de datos» (privacidad, lo necesita la puerta de consentimiento) | Dueño, 2026-10-09 (`design.md` D13) |

## Decisiones del dueño del 2026-10-09 (antes con valor por defecto)

| Decisión | Respuesta del dueño | Pregunta | Dónde se implementa |
|---|---|---|---|
| Tope de turnos | Avisa y pasa a espera con «Espera del asesor»; el valor por defecto de `AGENTE_TOPE_TURNOS` sube de **12 a 20** | Q1 (P65) | T3 |
| Aviso por Telegram fuera de horario | Sí se envía; el bot sigue atendiendo | Q2 (P66) | T1, T2 |
| Bot ya avisado y el cliente quiere cerrar | Sigue informando y dando precios, pero no confirma pagos, apartados ni descuentos (AGT28 tal como está) | Q3 (P67) | T3 |
| Dónde se guarda el consentimiento | Campos nuevos en `contacto`; `acepta_contacto` no se reutiliza | Q4 (P68) | T4 |
| Qué pasa con `acepta_contacto` | Se deja como está (opt-in de campañas futuras) | Q5 (P69) | T4 |
| Alcance de la marca «asesor avisado» | **Un aviso por motivo** (persona, lead caliente, audios repetidos), no uno por conversación; el mismo motivo no avisa dos veces en la misma sesión bot | Q6 (P70) | T1 |
| Presentación como asistente automatizado | En el texto del caso «Tratamiento de datos», junto con el pedido de consentimiento | Q7 (P71) | T5 |
| Reglas del prompt | `reglas.v4.md` se reemplaza por `seguridad.v1.md`: seis límites del modelo y de los datos, sin negocio ni manual de herramientas | Q8 (P72) | T2 |
| Emojis y estilo de respaldo | `estilo.v4.md` mínimo y sin prohibiciones; se retira la aserción `sinEmojis` (AGT15) | Q9 (P73) | T2 |
| Peso y medidas en la ficha | Sí, como `medidas_texto` desde las mismas columnas que usa `cotizar_envio`; **fuera de esta fase** (`odd/tasks/medidas-en-ficha.md`) | Q10 (P74) | Fuera de fase |
| Pie de foto y orden texto-imagen | No se cambian; queda como idea futura | Q11 (P75) | — |

## Scope

### In Scope

1. **Aviso sin traspaso** (`conversaciones`, `notificaciones`, `leads`, `agente`): efecto `avisar-asesor`, campo `aviso` en la
   respuesta del turno, marca «asesor avisado» **por conversación y motivo** en Redis y motivo nuevo `pide-asesor`. Pedir una
   persona, audio repetido y lead caliente avisan y el bot sigue.
2. **Herramienta `derivar_a_asesor`**, con descripción técnica neutra; la parte fija del prompt solo la nombra en la regla del
   dato que falta y los casos de uso del dueño dicen cuándo más usarla. Se elimina `TextoHandoff`.
3. **Consentimiento de datos**: esquema propuesto (campos en `contacto`), herramienta `registrar_consentimiento`, puerta
   determinista en `guardar_datos_contacto` y `marcar_lead_caliente`, y contexto del turno con el estado. Se retiran el aviso
   del primer mensaje (AGT2) y `agente/dominio/aviso-datos.ts`.
4. **Casos del sistema de 11 a 5** (`asistente`): audio, imagen, falla del modelo, techo de gasto y «Espera del asesor». En las
   bases existentes, «Contra entrega», «Sin cobertura de envío» y «Datos completos fuera de horario» pasan a casos de uso
   normales y «Aviso de datos» pasa a «Tratamiento de datos»; los dos de traspaso se eliminan. Migración de datos que respeta el
   `CHECK` de la Fase 12. La semilla de una base nueva crea solo los cinco del sistema y «Tratamiento de datos».
   `cotizar_envio` deja de adjuntar textos.
5. **Hechos, no conducta** (`agente`, `leads`): `seguridad.v1.md` reemplaza a `reglas.v4.md`; `estilo.v4.md` mínimo reemplaza a
   `estilo.v3.md`; el contexto del turno informa hechos (producto de entrada, nombre, captura pendiente) sin ordenar qué decir;
   la captura fuera de horario se informa con un solo hecho compartido; se retira `sinEmojis` (AGT15).
6. **Cliente**: título y «cuándo aplica» editables en los casos del sistema, y **ayuda de herramientas** bajo «Cuándo
   aplica» de los casos de intención: siete fichas con lo que sabe hacer el bot que, al tocarlas, agregan una frase al texto
   (SHL12). Lo guardado sigue siendo texto plano.
7. Specs, ADR-0027, guías de operación (con los casos de ejemplo que el dueño puede crear), evals y contrato al día en el mismo
   trabajo.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Revocar el consentimiento (el cliente pide borrar sus datos) | Posterior, sin fase asignada | Pide una pantalla o un comando de borrado de datos de un contacto; esta fase solo registra aceptar o rechazar |
| Historial de consentimientos (varias aceptaciones o rechazos con fecha) | Posterior | Solo se guarda el último estado (P68) |
| Reusar o eliminar `acepta_contacto` | P69 | Es el opt-in de campañas; no se toca |
| Pantalla de «avisos al asesor» o de contactos con su consentimiento | Posterior | No es necesaria para que el flujo funcione |
| Cambiar el aviso de Telegram a otro canal o agregar etiquetas de Chatwoot por motivo | Posterior | El aviso reutiliza `AvisoTraspaso` y el outbox tal como están |
| Cambiar el bucle del LLM, el debounce o la máquina de estados (R6) | — | Solo cambia qué turnos piden traspaso y cuáles solo avisan |
| Corrida de evals reales (EVL3), aviso real en Telegram y tomar el control desde Chatwoot | Dueño (`[manual]`, T9) | Necesitan su clave, su bot de Telegram y su Chatwoot |
| Etiquetas de herramientas guardadas por caso, con pista al modelo en el índice de casos (idea de una «fase 12e») | Descartada por ahora | La ayuda del cliente basta; se retoma solo si las evals muestran que el modelo ignora los casos |
| Crear los casos de conducta (Fotos, Costo del envío, Ubicación compartida, Saludo, Captura fuera de horario, Contra entrega, Sin cobertura) | El dueño, desde «Casos de uso» | Decisión del dueño (D13): la guía los lista como ejemplos; no se cargan solos |
| Reemplazar el estilo ya publicado en una base existente | El dueño, desde la pantalla de estilo | `casos:sembrar` solo siembra con la tabla vacía; T2 cambia `estilo-inicial.md` al texto mínimo (decisión del dueño, 2026-10-09), pero no pisa lo publicado |
| Peso y medidas en la ficha (`medidas_texto`) | `odd/tasks/medidas-en-ficha.md` (P74) | Trabajo fuera de fase, rama `feat/medidas-en-ficha` |
| Pie de foto editable y orden texto-imagen | P75 | El dueño decidió no cambiarlo |

## Qué se migra del prototipo

Ninguna pieza nueva del prototipo entra en esta fase. Se rediseñan piezas que las fases 07a-12 ya migraron, sin tocar
`../ChatLuxeCRM`.

| Pieza actual | Decisión | Motivo |
|---|---|---|
| Handoff total (`handoff_pendiente`) por pedir persona, audio repetido y lead caliente (CNV8, CNV11, LDS3) | rediseñar | Decisión del dueño: derivar es avisar. El traspaso queda solo para fallas del bot y el tope (R6, R13) |
| `TextoHandoff` y los casos `mensaje_handoff` / `mensaje_handoff_fuera_horario` | descartar | Ya no hay traspaso que anunciar; el LLM redacta qué decir al avisar (ADR-0024: el LLM decide con casos de uso) |
| Aviso de datos del primer mensaje (AGT2, `aviso_datos`, `aviso-datos.ts`) | rediseñar | Pasa a consentimiento explícito antes de guardar datos (R14) |
| Textos adjuntos por `cotizar_envio` (`contra_entrega`, `mensaje_fuera_cobertura`) y `asegurarMensajeLiteral` | rediseñar | El LLM consulta el caso con `consultar_caso` (CAS8); `cotizar_envio` devuelve solo datos (R1, R2) |
| Casos `contra_entrega`, `mensaje_fuera_cobertura`, `mensaje_captura_completa` como claves del sistema | rediseñar | Son criterio del LLM, no textos que el código deba enviar cuando el LLM no habla; las filas existentes conservan el texto del dueño |
| `reglas.v4.md` (reglas de negocio y manual de herramientas) y `estilo.v3.md` (prohibiciones) | rediseñar | Pasan a `seguridad.v1.md` (seis límites) y `estilo.v4.md` (mínimo); la conducta es del dueño (R15, D13) |
| Instrucciones del contexto del turno (saludar, ofrecer la ficha, guion de captura) | rediseñar | Quedan solo los hechos (AGT12, LDS4) |
| Las cinco claves restantes (audio, imagen, error, techo, espera) | conservar | Siguen siendo los textos que el código envía cuando el LLM no puede (AGT3, AGT6, CNV3) |
| Marca de espera en Redis (`marca-espera-handoff`, CNV3, CNV12) | conservar | La marca «asesor avisado» es nueva y sigue el mismo patrón sin reemplazarla |
| Aviso por Telegram con enlace (NTF1, NTF5, NTF6) | conservar | Se reutiliza el mismo encolado, solo cambia cuándo se dispara |

## Preguntas abiertas

Registradas en `docs/PREGUNTAS_ABIERTAS.md` como P65 (Q1) a P75 (Q11). **Todas quedaron resueltas el 2026-10-09** (P68 y P69
aceptando la recomendación; las demás con la respuesta del dueño de la tabla de arriba). Ninguna bloquea la fase; la puerta
que queda es la aprobación de los cuatro artefactos.

| Id | Pregunta | Respuesta del dueño (2026-10-09) | Bloquea |
|---|---|---|---|
| **Q1** (P65) | ¿El tope de turnos avisa y pasa a espera, o solo avisa y el bot sigue? | Avisa y pasa a espera; el tope por defecto sube de 12 a 20 | No |
| **Q2** (P66) | ¿El aviso por Telegram sale también fuera de horario? | Sí; el bot sigue atendiendo | No |
| **Q3** (P67) | ¿Con el asesor avisado el bot puede confirmar pagos, apartados o descuentos? | No: informa y da precios, y dice que el asesor lo confirma | No |
| **Q4** (P68) | ¿Dónde vive el consentimiento: campos en `contacto`, tabla aparte con historial o `acepta_contacto`? Es esquema | Campos en `contacto` | No |
| **Q5** (P69) | ¿Qué se hace con `acepta_contacto`: se deja, se renombra o se elimina? Es esquema | Se deja sin tocar | No |
| **Q6** (P70) | ¿Un aviso por conversación o uno por clase de motivo (persona, lead, audio)? | Uno por motivo | No |
| **Q7** (P71) | ¿Dónde se presenta el bot como asistente automatizado ahora que el primer mensaje no lleva el aviso? | En el texto del caso «Tratamiento de datos», con el pedido de consentimiento | No |
| **Q8** (P72) | ¿Qué reglas quedan en el código? | Solo seguridad del modelo y de los datos (`seguridad.v1.md`); nada de negocio | No |
| **Q9** (P73) | ¿Se mantienen prohibidos los emojis? | Sin prohibiciones en el estilo de respaldo; se retira `sinEmojis` | No |
| **Q10** (P74) | ¿Se exponen peso y medidas en la ficha? | Sí, fuera de esta fase (`odd/tasks/medidas-en-ficha.md`) | No |
| **Q11** (P75) | ¿Pie de foto y orden texto-imagen editables? | No se cambian | No |

## Risks

| Riesgo | Efecto | Mitigación |
|---|---|---|
| **Dos voces a la vez**: el asesor escribe mientras el bot responde | Mensajes cruzados al cliente | CNV5: el eco humano pasa a `humano` y `ProcesarTurno` relee el estado antes de enviar (R5, R8); escenarios e2e del eco mientras el generador corre |
| **El bot cierra ventas** que le tocan al asesor | Promesas de pago, apartado o descuento | Instrucción en el contexto cuando el asesor ya fue avisado (AGT28) y evals guionadas; la parte de conducta es de prompt, no determinista: se confirma con la corrida real (EVL3, `[manual]`) |
| **Costo y bucles**: el bot sigue hablando tras avisar, ahora con un tope de 20 turnos | Gasto de LLM sin que nadie entre | Se conservan el tope de turnos (R13) y el techo de gasto; el tope sigue llevando a espera |
| **Avisos repetidos o perdidos** | Spam al asesor, o un lead caliente sin aviso | Marca atómica por conversación y motivo (SET NX) que se libera si el encolado falla: a lo sumo tres avisos sin traspaso por sesión bot; recordatorio de leads sin atender (LDS5) intacto |
| **Sin casos de negocio sembrados** | Hasta que el dueño cree sus casos, el bot no manda una sola foto por defecto, no dice que el envío es aproximado, no limita la contra entrega a una vez, no tiene guion para la ubicación ni para la captura fuera de horario | Decisión del dueño (D13). Los límites de seguridad (R1, R2, R14) siguen en código; la guía de operación lista los casos de ejemplo; las evals que prueban esa conducta crean su caso en la preparación |
| **El texto de sin cobertura o contra entrega ya no sale del backend** | El LLM parafrasea una política | Los casos convertidos conservan su modo `literal` (cita palabra por palabra, CAS8); sin montos en pesos por validación (CAS5); sin caso, las reglas 1 y 4 de seguridad impiden inventarla |
| **Migración de datos** de los casos del sistema | Texto editado perdido o `CHECK` violado | La migración cambia `disparador` y `clave_sistema` en la misma sentencia; solo borra los dos casos de traspaso; comprobación `[manual]` contra Postgres real y reversa documentada en `design.md` |
| **Sin consentimiento no se guarda nada** y el cliente lo rechaza | Pedido que no se puede tomar | El bot sigue informando; el asesor puede tomarlo desde Chatwoot. Si el dueño borra «Tratamiento de datos», la puerta sigue cerrada |
| **T1 pasa de ~400 líneas** (marca por motivo con sus pruebas unitarias, de integración contra Redis y e2e) | PR grande | **Excepción anticipada aquí**: más de la mitad son pruebas; `size:exception` automática en `tasks.md` |
| **T2 pasa de ~400 líneas** (`seguridad.v1.md`, `estilo.v4.md`, hechos del contexto, herramienta nueva y retiro de `sinEmojis` en ~30 casos JSON) | PR grande | **Excepción anticipada aquí**: el retiro de `sinEmojis` y el borrado de `reglas.v4.md` y `estilo.v3.md` son eliminaciones mecánicas; `size:exception` automática en `tasks.md` |
| **T4 pasa de ~400 líneas** (esquema, migración, herramienta y puerta con sus pruebas de integración) | PR grande | **Excepción anticipada aquí**: la migración y ~60 % de las líneas son pruebas contra Postgres real, no autoría de lógica; `size:exception` automática en `tasks.md` |
| **T6 pasa de ~400 líneas** (migración de datos, semilla, `cotizar_envio`, hecho de captura y ajuste de los tests que fijan «once casos») | PR grande | **Excepción anticipada aquí**: gran parte son aserciones y datos de prueba que cambian de forma mecánica; `size:exception` automática en `tasks.md` |
| El dueño cambia una decisión tras aprobar | Retrabajo de una tarea | Cada decisión está aislada en una tarea (P65 y P67 en T3, P68-P69 en T4, P70 en T1, P72-P73 en T2); se revisa la spec antes de implementar esa tarea |
| **La lista de fichas del cliente se desactualiza** al sumar una herramienta al agente | Quien redacta un caso no ve la capacidad nueva | Nota en `docs/operacion/cliente-back-office.md` (T9) y una prueba del cliente que fija los nombres de la lista (SHL12); la lista no cambia la lógica del bot |
| La fase toca más requisitos de los que el plan enumeró | Specs desactualizadas si se omiten | Los deltas cubren también R12, AGT1, AGT4, AGT10-AGT13, AGT14, LDS2-LDS4, NTF6, CAS7 y CAS8, que el código obliga a ajustar (ver `design.md`, «Hallazgos al verificar el plan») |

## Rollback

- **Cada slice es un commit revertible.** T1 solo agrega: sin T3 nada llama al aviso, así que revertir T3-T8 deja el bot como en
  la Fase 12.
- **T2 reemplaza archivos del prompt** (`reglas.v4.md` → `seguridad.v1.md`, `estilo.v3.md` → `estilo.v4.md`) y el contexto del
  turno. Revertir el commit los devuelve; no toca datos. El estilo publicado en la base no cambia en ningún sentido.
- **T3 cambia el tope por defecto a 20.** Revertir lo devuelve a 12; quien quiera otro valor lo fija en `AGENTE_TOPE_TURNOS`.
- **T4 agrega columnas nulas** a `contacto`. Revertir el código deja las columnas sin uso; no hay pérdida ni bloqueo. La
  puerta de consentimiento se va con el commit.
- **T6 y T7 son los únicos puntos sin vuelta fácil**: la migración de datos borra los dos casos de traspaso y desasocia la
  clave de otros cuatro. El texto de los casos convertidos **no se pierde** (sigue en `caso_asistente`). Para revertir
  hay una sentencia de reversa documentada en `design.md` (D10) que devuelve su clave a los cuatro casos convertidos y
  `casos:sembrar` recrea los dos de traspaso con su texto de respaldo. Con el código viejo, un caso sin fila rige su texto
  de respaldo (CAS7), así que el bot nunca queda mudo mientras tanto. La semilla nueva no borra nada: solo deja de crear casos.
- La reversa se prueba contra Postgres real antes de fusionar T7 (`[manual]`).
