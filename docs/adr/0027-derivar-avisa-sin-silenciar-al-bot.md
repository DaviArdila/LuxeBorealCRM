# 0027. Derivar avisa al asesor sin silenciar al bot; consentimiento en lugar de aviso fijo

- Estado: aceptada (2026-10-09, el dueño)
- Fecha: 2026-10-08
- Se apoya en: ADR-0016 (el agente implementa el puerto de conversaciones), ADR-0024 (casos de uso del asistente) y ADR-0004
  (outbox). No reemplaza a ninguno; matiza el comportamiento de R6 y R14.
- Aprueba el dueño: el **cambio de reglas de negocio** (qué hace «derivar» y qué exige R14) y el **esquema** del consentimiento
  (columnas en `contacto`) son decisión suya.

## Resumen

«Derivar» deja de ser un cambio de estado: el bot **avisa** al asesor por Telegram y sigue atendiendo hasta que el asesor abre o
escribe en Chatwoot. La conversación solo pasa a `handoff_pendiente` cuando el bot no puede seguir (falla del modelo, techo de
gasto, argumentos inválidos, plazo agotado y tope de turnos). El aviso fijo del primer mensaje se reemplaza por un
**consentimiento** que el bot pide antes de guardar datos, con una puerta en código. Los casos del sistema bajan de once a cinco.
Y el código deja de fijar conducta de negocio: el prompt fijo queda en seis límites de seguridad y el contexto informa hechos
(decisiones del dueño del 2026-10-09).

## Contexto

Hechos del repositorio al 2026-10-08:

- Pedir una persona, repetir un audio y confirmar un lead caliente llevan la conversación a `handoff_pendiente`
  (`PoliticaPidePersona`, `PoliticaNoTextuales`, `ContenidoLlm` con el efecto `lead-derivado`; CNV8, CNV11). En ese estado el
  bot no responde (`ProcesarTurno` descarta el turno si el estado no es `bot`) y solo envía un aviso de espera (CNV3). El asesor puede tardar y el cliente queda sin respuesta.
- El primer mensaje lleva `aviso_datos` pegado por `MotorTurno.conAviso` (AGT2, R14). El cliente no acepta nada y sus datos se
  guardan igual con `guardar_datos_contacto` y `marcar_lead_caliente`.
- La lista cerrada `CASOS_DEL_SISTEMA` tiene once casos (`asistente/dominio/sistema.ts`). Cinco son textos de eventos que el
  código dispara (audio, imagen, falla, techo, espera); los demás son aviso de datos, dos traspasos, captura completa, falta de
  cobertura y contra entrega, que `cotizar_envio` o el contexto del turno adjuntan por código.
- `contacto.acepta_contacto` (`schema.prisma:210`) existe, pero `MODELO_DATOS.md` lo define como opt-in de campañas futuras,
  con `false` por defecto y sin fecha.
- El eco humano o el evento `open` ya pasan la conversación a `humano` (CNV5): el asesor toma el control sin que el bot tenga
  que haber transicionado antes.

## Alternativas

**Qué hace «derivar»**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Avisar y seguir** (efecto `avisar-asesor`, sin cambio de estado) | El cliente nunca queda sin respuesta; el asesor entra cuando puede; R6 intacta | Dos voces a la vez si el asesor escribe mientras el bot responde (lo cubre CNV5/R5); el bot podría cerrar algo que le toca al asesor |
| B | Mantener el silencio actual (`handoff_pendiente`) | Cero cambios; nunca hay dos voces | El bot calla aunque podría informar; es lo que el dueño quiere cambiar |
| C | Un único texto neutro de traspaso que reemplace los dos actuales | Menos casos; sin horario en el texto | Sigue callando al bot; el LLM no redacta qué decir |

**Cómo se exige el consentimiento**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Puerta en código** en las herramientas que guardan datos + herramienta `registrar_consentimiento` + caso «Tratamiento de datos» | Determinista (R14 no depende de que el modelo recuerde); el texto lo edita el dueño | Dos herramientas tocadas y un campo nuevo |
| B | Bloquear toda la conversación hasta aceptar | Máxima protección | El cliente no puede ni preguntar un precio sin aceptar; pierde el bot su valor informativo |
| C | Solo por prompt (el LLM decide cuándo pedirlo, sin puerta) | Sin código nuevo en las herramientas | Un olvido del modelo guarda datos sin consentimiento: es justo lo que R14 quiere evitar |

**Dónde vive el consentimiento** (esquema: decisión del dueño, P68 y P69)

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Dos columnas nulas en `contacto`** (`consentimiento_datos_en`, `consentimiento_rechazado_en`) | Simple; distingue sin respuesta, aceptó y rechazó | Solo el último estado |
| B | Tabla aparte solo con inserciones | Evidencia de cada respuesta | Más piezas para un dato de un solo valor |
| C | Reutilizar `acepta_contacto` | Sin esquema | Mezcla dos consentimientos distintos y no distingue «rechazó» de «no respondió» |

## Decisión

1. **Derivar es avisar.** El turno puede traer un `aviso` (`pide-persona`, `pide-asesor`, `lead-caliente`, `audio-repetido`) sin
   `handoff`. `conversaciones` envía los pasos y avisa por observadores, con una marca atómica «asesor avisado» **por conversación
   y motivo** (P70: persona —`pide-persona` y `pide-asesor`—, lead caliente, audios repetidos) que se borra al pasar a `humano`
   o volver a `bot`: el mismo motivo no avisa dos veces en una sesión bot y un motivo distinto sí avisa. La conversación sigue en
   `bot`.
2. **`handoff_pendiente` queda para cuando el bot no puede seguir:** `fallo-llm`, `techo-gasto`, `argumentos-invalidos`,
   `plazo-agotado` y `tope-turnos` (P65). El tope responde con «Espera del asesor» y su valor por defecto sube de 12 a 20.
3. **Herramienta `derivar_a_asesor({ motivo })`:** su descripción solo dice qué hace y qué devuelve; la parte fija del prompt la
   nombra solo ante un dato que falta y los casos de uso del dueño dicen cuándo más usarla. El motivo escrito por el modelo no se
   guarda ni viaja al aviso (R14).
4. **Con el asesor avisado, el bot no confirma pagos, apartados ni descuentos:** informa y dice que el asesor lo confirma
   (instrucción de contexto, sin puerta de código).
5. **El aviso de datos se reemplaza por consentimiento.** R14 pasa a «consentimiento antes de guardar datos personales». El bot
   pide la aceptación con el caso «Tratamiento de datos»; `registrar_consentimiento` la registra con la fecha del `Clock`;
   `guardar_datos_contacto` y `marcar_lead_caliente` no guardan nada sin ella. Sin aceptar, el bot sigue dando información general.
6. **Casos del sistema: cinco** (audio, imagen, falla del modelo, techo de gasto, espera del asesor), con título editable. En las
   bases existentes, «Contra entrega», «Sin cobertura de envío» y «Datos completos fuera de horario» pasan a casos de uso normales
   (conservan el texto del dueño) y «Aviso de datos» pasa a «Tratamiento de datos»; los dos traspasos se eliminan. Una base nueva
   solo siembra «Tratamiento de datos» (privacidad): **ningún caso de negocio se siembra**. `cotizar_envio` devuelve solo datos.
7. **Esquema propuesto:** columnas `consentimiento_datos_en` y `consentimiento_rechazado_en` en `contacto`, con una restricción
   a mano que impide que las dos tengan valor (`[manual]`). `acepta_contacto` no se toca.
8. **El código da hechos y límites; la conducta es del dueño** (P72, P73). `reglas.v4.md` se reemplaza por `seguridad.v1.md`
   (seis límites del modelo y de los datos, sin negocio ni manual de herramientas); `estilo.v3.md` por `estilo.v4.md`, mínimo y
   sin prohibiciones; el contexto del turno informa hechos (producto de entrada, nombre, captura pendiente) sin ordenar qué
   decir. Las reglas de negocio que salen del código no se mueven a ningún lado: el dueño crea los casos que quiera.

## Consecuencias

**Gana el proyecto**

- El cliente siempre recibe respuesta mientras entra el asesor; el asesor recibe un aviso por motivo y toma el control con el
  flujo que ya existe (CNV5).
- R14 se cumple por código: sin aceptación no hay datos ni leads guardados.
- Menos casos bloqueados; el dueño puede editar o borrar los textos de contra entrega, cobertura, cierre y tratamiento de datos.
- El dueño gobierna toda la conducta del bot desde la pantalla, sin desplegar (R15).

**Paga**

- Un texto que hoy sale del backend (cobertura, contra entrega) pasa a citarlo el modelo: se mitiga con el modo `literal`, la
  validación de casos (sin pesos ni SKU) y evals. Si el dueño borra el caso, el bot informa con sus palabras sin inventar la
  política.
- La regla «no confirmar cierres» es de conducta del modelo: solo se verifica con evals guionadas y la corrida real (EVL3).
- El asesor puede recibir hasta tres avisos sin traspaso por sesión bot, uno por motivo (P70).
- El bot ya no se presenta como asistente automatizado en el primer mensaje: lo dice el texto del caso «Tratamiento de datos» al
  pedir la aceptación (P71).
- Hasta que el dueño cree sus casos, el bot pierde conducta que daban las reglas (una sola foto, envío aproximado, contra
  entrega una vez, ubicación, captura guiada) y las evals que la probaban crean el caso en su preparación o se retiran.
- Una migración de datos sin vuelta fácil en los dos casos de traspaso (con reversa documentada) y una migración de esquema.

**Queda obligatorio o prohibido**

- Prohibido que un aviso (`MotivoAviso`) cambie el estado de la conversación; solo un `handoff` transiciona (R6).
- Prohibido guardar en logs, base o aviso el motivo que escribe el modelo en `derivar_a_asesor` (R14).
- Obligatorio que toda herramienta que escriba datos del cliente pase por la puerta de consentimiento; un test lo verifica.
- Prohibido que `cotizar_envio` o cualquier herramienta de consulta adjunte textos al cliente: los textos son casos de uso (ADR-0024).
- Prohibido que la parte fija del prompt o el contexto del turno lleven reglas de negocio o nombren títulos de casos: solo
  límites de seguridad y hechos.
- Fuera de alcance: revocar el consentimiento, historial de aceptaciones y gobernar el teléfono y el nombre de perfil que Chatwoot
  entrega al crear el contacto.
