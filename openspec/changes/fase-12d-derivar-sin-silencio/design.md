# Design: Fase 12d — Derivar avisa sin silenciar al bot, consentimiento de datos y casos del sistema mínimos

- Change: `fase-12d-derivar-sin-silencio` · Fecha: 2026-10-08 · Estado: **aprobada (2026-10-09)**
- Proposal: `proposal.md` · Specs (deltas): `privacidad` (R14, PRV1), `conversaciones` (CNV3, CNV8, CNV11-CNV15), `agente` (R12, AGT1,
  AGT3, AGT4, AGT8, AGT10-AGT14, AGT24-AGT28; quita AGT2 y AGT15), `asistente` (CAS4, CAS6-CAS8, CAS12-CAS14; quita CAS11),
  `catalogo` (CAT10, CAT11, IMP7), `cliente` (SHL10, SHL12), `leads` (R10, R11, LDS2-LDS4), `notificaciones` (NTF3, NTF6, NTF8),
  `configuracion-negocio` (CFG6)
- Decisiones del dueño del 2026-10-09 incorporadas: P65 (tope 20), P66, P67, P70 (un aviso por motivo), P71, P72
  (`seguridad.v1.md`), P73 (`estilo.v4.md`, sin `sinEmojis`), P74 (fuera de fase), P75 y «ningún caso de negocio sembrado» (D13).
- ADR: [0027](../../../docs/adr/0027-derivar-avisa-sin-silenciar-al-bot.md) nuevo (`propuesta`); se apoya en 0016 (agente
  implementa el puerto de conversaciones) y 0024 (casos del asistente).

## Technical Approach

Una idea manda sobre el diseño: **un aviso no es un estado**. El turno puede pedir «avisar al asesor» sin que la máquina de
estados (R6) cambie; el estado `handoff_pendiente` queda solo para cuando el bot **no puede** seguir.

| | Antes | Después |
|---|---|---|
| Pide una persona, audio repetido, lead caliente | `handoff_pendiente`, el bot se calla, texto de traspaso | Aviso por Telegram, la conversación sigue en `bot`, el bot responde |
| Falla del modelo, techo de gasto, argumentos inválidos, plazo agotado | `handoff_pendiente` + texto de cortesía | Igual |
| Tope de turnos | `handoff_pendiente` + texto de traspaso, a los 12 turnos | `handoff_pendiente` + texto «Espera del asesor», a los 20 turnos (Q1) |
| Avisos repetidos | — | Uno por conversación y motivo (persona, lead, audios) en cada sesión bot (Q6) |
| Prompt fijo | `reglas.v4.md` con reglas de negocio y manual de herramientas; `estilo.v3.md` con prohibiciones | `seguridad.v1.md` con seis límites; `estilo.v4.md` mínimo; el contexto solo trae hechos (D13) |
| Primer mensaje | El código antepone `aviso_datos` | Sin aviso; el bot pide el consentimiento antes de tomar datos |
| Guardar datos / registrar lead | Siempre | Solo si el contacto aceptó (puerta en código) |
| Casos del sistema | 11 | 5; en las bases existentes cuatro pasan a casos de uso y dos se eliminan |
| Casos de negocio sembrados | Contra entrega | Ninguno; solo «Tratamiento de datos» (privacidad) |

```
cliente escribe ──▶ MotorTurno ──▶ políticas (no textuales → tope → pide persona) ──▶ ContenidoLlm + bucle de herramientas
                        │                 │ (pide persona: "seguir" con aviso pedido)            │ derivar_a_asesor → efecto avisar-asesor
                        │                 │                                                      │ guardar_datos / lead → puerta de consentimiento
                        ▼                                                                        ▼
                  RespuestaTurno { pasos, handoff? | aviso? }  ──────────────▶  ProcesarTurno (conversaciones)
                                                                                 1) envía los pasos por el punto único (R5)
                                                                                 2) handoff → transiciona (R6) y avisa (NTF6)
                                                                                    aviso   → marca atómica «asesor avisado» (CNV14)
                                                                                              → observadores de aviso (NTF8, R11); sin cambio de estado
                                                      asesor abre / escribe en Chatwoot ──▶ CNV5: pasa a `humano` y borra la marca
```

Lo que **no** cambia: la máquina de estados y sus orígenes (R6, R7, CNV5), el punto único de salida (R5), la escala de leads
(R9, LDS1), el encolado por outbox y el enlace de Chatwoot (NTF1, NTF4, NTF5), el bucle del LLM (AGT5), el techo de gasto
(LLM9) y las reglas R1, R2.

## Módulos tocados y dependencias

Solo se importa lo exportado por el barril de cada módulo (`index.ts`).

| Módulo | Cambio | Depende de |
|---|---|---|
| `conversaciones` | `RespuestaTurno.aviso`, `MotivoAviso`, marca «asesor avisado» por conversación y motivo, registro de observadores de aviso, puerto de lectura de la marca, texto de espera para el tope | `plataforma` (redis, reloj) |
| `agente` | Efecto `avisar-asesor`; herramientas `derivar_a_asesor` y `registrar_consentimiento`; puerta de consentimiento; políticas que avisan y siguen; contexto del turno con hechos (D13); se borran `TextoHandoff`, `aviso-datos.ts`, `reglas.v4.md` y `estilo.v3.md`; nacen `seguridad.v1.md` y `estilo.v4.md` | `conversaciones`, `asistente`, `leads`, `plataforma` |
| `notificaciones` | Observador `AvisoSinTraspaso` (motivos `pide-persona`, `pide-asesor`, `audio-repetido`); `AvisoTraspaso` queda con los cinco motivos de handoff; textos de aviso nuevos | `conversaciones` (observadores) |
| `leads` | El aviso de `lead-caliente` se dispara desde el observador de aviso; `RegistrarPidePersona` y la evaluación exigen consentimiento; la respuesta de captura de `evaluar-propuesta-lead.ts` pasa a ser el mismo hecho que el contexto (LDS4) | `conversaciones` |
| `asistente` | `CASOS_DEL_SISTEMA` con 5 casos; un solo caso inicial de intención («Tratamiento de datos»); semilla; migración de datos | `plataforma`, `compartido/texto` |
| `plataforma/config` | `AGENTE_TOPE_TURNOS` por defecto pasa de 12 a 20 (P65); `ASESOR_AVISADO_TTL_H` nuevo | — |
| `catalogo` | `cotizar_envio` deja de pedir textos; sale la dependencia de `TEXTOS_ASISTENTE` | — |
| `cliente/` | `casos.component.ts`: título y «cuándo aplica» editables para casos del sistema | cliente HTTP generado (sin cambios) |

`asistente` sigue sin importar de `agente`, `conversaciones`, `catalogo` ni `llm`. `notificaciones` y `leads` no se importan
entre sí: ambos se enganchan a `conversaciones` por observadores, como ya hacen con el handoff (D7 de la Fase 08).

## Architecture Decisions

### D1: el aviso viaja en la respuesta del turno, no como estado ni como llamada directa

**Choice**: `RespuestaTurno` admite `aviso?: { motivo: MotivoAviso }` junto a `handoff?`. `MotivoAviso` es
`'pide-persona' | 'pide-asesor' | 'lead-caliente' | 'audio-repetido'` y `MotivoHandoff` baja a
`'tope-turnos' | 'fallo-llm' | 'techo-gasto' | 'argumentos-invalidos' | 'plazo-agotado'`. Si una respuesta trae las dos, gana el
handoff y el aviso se descarta (CNV11). `ProcesarTurno` envía los pasos, y después avisa (aviso) o transiciona (handoff).
**Alternatives**: (a) que la herramienta llame al aviso en medio del turno (el aviso saldría antes que la respuesta y se
rompería «efectos al final», AGT4); (b) conservar `handoff` con una bandera «sin transición» (mezcla dos cosas distintas en un
tipo y dilata R6).
**Rationale**: reutiliza el patrón ya probado (pasos primero, efecto después, observadores) y separa por tipo lo que cambia
el estado de lo que no. El plan ubicaba `pide-asesor` dentro de `MotivoHandoff`; se separa en `MotivoAviso` para que el
compilador impida traspasar por un motivo de aviso.

### D2: un solo aviso por turno, con prioridad fija

**Choice**: el motor suma a la respuesta final el aviso que pidió una política (pide persona) y el que emitió el bucle
(`avisar-asesor` de `derivar_a_asesor`, de un lead confirmado o de un audio repetido). Si hay más de uno, gana el de mayor
prioridad: `lead-caliente` > `pide-persona` > `pide-asesor` > `audio-repetido`. El efecto `lead-derivado` pasa a ser
`avisar-asesor` con motivo `lead-caliente` y `ContenidoLlm` **deja de reemplazar** el texto del modelo.
**Alternatives**: una lista de avisos por turno (dos mensajes de Telegram en el mismo segundo por un solo turno); dejar gana
el primero (un `pide-persona` de política taparía siempre al lead).
**Rationale**: el asesor necesita saber del lead caliente antes que de un pedido genérico de persona. Como la marca es por
motivo (D3), el motivo que perdió en ese turno no queda marcado y avisa si vuelve a aparecer en un turno posterior.

### D3: una marca «asesor avisado» por conversación y motivo, atómica y liberable si el aviso falla

**Decisión del dueño (P70, 2026-10-09): un aviso por motivo**, no uno por conversación. Los motivos de la marca son tres: el
cliente pide una persona (`pide-persona` de la política y `pide-asesor` de `derivar_a_asesor` cuentan como el mismo), lead
caliente y audios repetidos.
**Choice**: `MARCA_ASESOR_AVISADO` (puerto en `conversaciones`) con `adquirir(conversacionId, motivo)` (`SET NX` sobre la clave
`asesor-avisado:<conversación>:<motivo>`), `liberar(conversacionId, motivo)`, `limpiar(conversacionId)` (borra los tres) y
`estaAvisado(conversacionId)` (cierto si hay al menos una), sobre Redis y con un TTL de respaldo `ASESOR_AVISADO_TTL_H` (24 por
defecto; es resiliencia técnica, no un dato del negocio, igual que el TTL de `ProveedorAsistente`). Se limpia donde hoy se
borra la marca de espera (CNV12): al pasar a `humano` y al volver a `bot`, así que el mismo motivo nunca avisa dos veces en la
misma sesión bot. `ProcesarTurno` adquiere el par antes de notificar; si un observador lanza, libera ese par y registra un
`warn`. Si Redis falla, avisa sin marca. `ArmarContextoInicial` lee `estaAvisado` por un puerto exportado (CNV15).
**Alternatives**: una marca por conversación (la que proponía el borrador: un aviso temprano ocultaba uno posterior más
importante, como un lead tras un pedido de persona); columna en `conversacion` (cambia el esquema por un dato efímero; P48 ya
decidió Redis para la espera); deduplicar solo por la clave de idempotencia del outbox (no frena el aviso de leads, que tiene
su propio camino, y cambia con la versión).
**Rationale**: el patrón de `marca-espera-handoff` ya existe y es el que el dueño conoce; el costo de perder la marca es un
aviso repetido, no uno perdido. Por motivo, el asesor recibe a lo sumo tres avisos sin traspaso por sesión bot.

### D4: dos observadores de aviso, uno por camino de notificación

**Choice**: `conversaciones` expone `RegistroObservadoresAviso` (mismo patrón que el de handoff). `notificaciones` registra
`AvisoSinTraspaso` para `pide-persona`, `pide-asesor` y `audio-repetido`, con clave de idempotencia
`aviso:<conversación>:<versión>:<motivo>` y el mismo `EncolarAviso` y enlace que `AvisoTraspaso`; `leads` registra el suyo para
`lead-caliente` y mantiene la ventana por contacto (NTF2). `AvisoTraspaso` conserva un `Record<MotivoHandoff, MotivoTraspaso>`
exhaustivo con los cinco motivos de handoff, y `AvisoSinTraspaso` otro `Record<MotivoAviso, … | null>` (con `lead-caliente` en
`null`): un motivo nuevo no compila hasta que se decide quién lo avisa.
**Alternatives**: un único observador que ramifique (obliga a `notificaciones` a conocer el camino de leads).
**Rationale**: no cambia quién avisa qué; solo cambia de qué evento cuelga.

### D5: `derivar_a_asesor` es una herramienta más, con motivo opaco

**Choice**: `derivar_a_asesor({ motivo })` (zod, `motivo` de 1 a 200 caracteres) devuelve `{ derivado: true }` y emite
`avisar-asesor{pide-asesor}`. El `motivo` ayuda al modelo a decidir y **nunca** se guarda, se registra ni viaja al aviso (el
aviso lleva un texto fijo por motivo, NTF1 y R14). Su descripción dice qué hace y qué devuelve, sin criterio de negocio; la
parte fija del prompt solo la nombra en la regla 4 de `seguridad.v1.md` (falta un dato) y los casos de uso del dueño dicen
cuándo más usarla (D13). La petición explícita de una persona la cubre la política determinista (LDS3).
**Alternatives**: llevar el motivo al aviso (riesgo de datos personales en Telegram); detectar la intención solo por palabras
clave (LDS3 ya lo hace y no cubre «compras al por mayor»).
**Rationale**: la política determinista cubre lo explícito; el LLM cubre lo que un caso de uso indique.

### D6: las políticas pueden pedir un aviso sin cortar el turno

**Choice**: `PoliticaTurno.evaluar(solicitud, turno)` recibe un `EstadoTurno` interno de `agente` donde una política deja
`avisoPedido`. `PoliticaPidePersona` registra el aviso (y el lead si hay consentimiento) y devuelve `seguir`; `ContenidoLlm`
lee `avisoPedido` para agregar al contexto «el cliente pidió una persona y el asesor fue avisado». `PoliticaNoTextuales`
responde con el texto de audio y pide `audio-repetido` en el segundo audio. `PoliticaTopeTurnos` responde con
`mensaje_espera_handoff` y mantiene el handoff `tope-turnos`; el tope por defecto (`AGENTE_TOPE_TURNOS`) sube de 12 a 20
porque ahora el bot sigue hablando tras avisar y 12 puede cortar una venta completa (P65; era un valor heredado del prototipo).
**Alternatives**: agregar el aviso a `DecisionPolitica` de «seguir» y cambiar el contrato público (`SolicitudTurno` es de
`conversaciones`); inferir el aviso otra vez en `ContenidoLlm` (duplica la detección).
**Rationale**: el cambio queda dentro de `agente`; el contrato con `conversaciones` solo gana `aviso`.

### D7: consentimiento — esquema aprobado por el dueño (Q4, Q5, 2026-10-09)

El esquema es lógica de negocio del dueño. Se diseña primero en `MODELO_DATOS.md` (regla de `openspec/config.yaml`) y el dueño
aceptó la propuesta de este apartado el 2026-10-09 (P68, P69).

| | Qué es | Gana | Paga |
|---|---|---|---|
| A (propuesta) | Dos columnas nulas en `contacto`: `consentimiento_datos_en` y `consentimiento_rechazado_en` (`timestamptz`) | Una lectura, sin tabla nueva; distingue «sin respuesta», «aceptó» y «rechazó» | Solo guarda el último estado, sin historial |
| B | Tabla `consentimiento_contacto` (`id`, `contacto_id`, `acepta`, `registrado_en`), solo inserciones | Evidencia de cada respuesta | Una tabla y una consulta «la última» más; sobra para una sola aceptación |
| C | Reutilizar `acepta_contacto` | Cero esquema | Es el opt-in de campañas (`MODELO_DATOS` §contacto), no tiene fecha y su `false` por defecto no distingue «rechazó» de «no respondió» |

Con A, la restricción `CHECK (consentimiento_datos_en IS NULL OR consentimiento_rechazado_en IS NULL)` no la expresa Prisma:
se escribe a mano en la migración y se marca `[manual]` hasta verla fallar contra Postgres real (PRV1: nunca coexisten). Los
puertos: `RepositorioContactoAgente` gana `consentimientoDe(contactoId)` (`'aceptado' | 'rechazado' | 'pendiente'`) y
`registrarConsentimiento(contactoId, acepta, instante)`; el instante sale del `Clock`.

**La puerta**: un decorador `conConsentimiento(herramienta, contactos)` envuelve `guardar_datos_contacto` y
`marcar_lead_caliente` al componerlas en `agente.module.ts`; sin aceptación devuelve `{ requiereConsentimiento: true }` antes de
ejecutar el cuerpo. Un test enumera las herramientas que escriben datos del cliente y falla si alguna no está envuelta.
**Alcance**: la puerta cubre lo que el bot **captura por herramientas**; el teléfono y el nombre del perfil que Chatwoot ya
entrega al crear el contacto quedan fuera de esta fase (son la identidad del canal).

### D8: el contexto del turno carga tres señales nuevas, todas como hechos

`ArmarContextoInicial` agrega, cada una con su `try/catch` que degrada sin romper el turno (patrón de la captura, LDS4):
(1) estado del consentimiento (aceptó, rechazó o sin respuesta); (2) «el asesor ya fue avisado: no confirmes pagos, apartados ni
descuentos» (AGT28, el único límite de conducta que queda en el contexto, decisión del dueño P67); (3) «el cliente pidió una
persona» cuando la política avisó en este turno. La parte fija del prompt **no** nombra títulos de casos: cada caso lleva su
señal en el «cuándo aplica», así renombrar o borrar un caso no rompe el prompt (D13).

### D9: casos del sistema de 11 a 5 y un solo caso inicial de intención

`CASOS_DEL_SISTEMA` conserva `mensaje_pedir_texto_audio`, `mensaje_imagen_no_procesada`, `mensaje_error_llm`,
`mensaje_techo_gasto` y `mensaje_espera_handoff` (título nuevo «Espera del asesor» y descripción que cubre falla, techo y tope).
Una constante `CASOS_INICIALES_DE_INTENCION` en `asistente/dominio` declara un solo caso, «Tratamiento de datos» (CAS13), con
categoría, modo `guia`, «cuándo aplica» y texto de respaldo (presentación como asistente automatizado y pedido de aceptación,
P71); la semilla lo crea solo si no existe un caso con ese título normalizado. Contra entrega, sin cobertura y captura **no**
se siembran (D13): solo existen donde la migración de D10 los convierte. `ClaveSistema` ya se
deriva de la lista (`as const`), así que quitar una entrada hace que el compilador marque cada uso pendiente.
`cotizar-envio.ts`, `contrato-modelo.ts` y `contenido-llm.ts` dejan de leer textos; el efecto `sin-cobertura` se queda sin
`mensaje` (lo sigue usando `marcar_lead_caliente`, AGT11) y se borra `asegurarMensajeLiteral`.
**Trade-off aceptado**: un texto de política que antes salía del backend ahora lo cita el modelo, y en una base nueva no
existe hasta que el dueño lo crea. Mitigaciones: modo `literal`, validación CAS5 (sin pesos ni SKU, así R2 no se rompe), reglas 1
y 4 de `seguridad.v1.md` (sin caso no se inventa la política) y evals que crean los dos casos en su preparación.

### D10: migración de datos que respeta el `CHECK` de la Fase 12

La migración `servicio/prisma/migrations/<timestamp>_casos_del_sistema_minimos/migration.sql` se escribe a mano. La restricción
`caso_asistente_evento_requiere_sistema_check` (`20261006130000_asistente_casos`) exige clave del sistema a todo caso de
disparador `evento`, así que **quitar la clave sin cambiar el disparador la violaría**: ambos cambian en la misma sentencia. Los
campos normalizados se calculan en SQL con el mismo algoritmo que `normalizarTexto` (minúsculas, NFD, sin marcas combinantes,
espacios colapsados, recorte), que en Postgres 16 se escribe con `normalize(…, NFD)` y `regexp_replace`.

```sql
-- (1) Tres casos dejan de ser del sistema: clave y disparador cambian a la vez; contra_entrega ya era de intención.
UPDATE "caso_asistente"
SET "clave_sistema" = NULL, "disparador" = 'intencion', "actualizado" = CURRENT_TIMESTAMP,
    "categoria_id" = COALESCE((SELECT "id" FROM "categoria_caso" WHERE "nombre_normalizado" = 'politicas'), "categoria_id")
WHERE "clave_sistema" IN ('mensaje_fuera_cobertura', 'mensaje_captura_completa', 'contra_entrega');

-- (2) aviso_datos pasa a «Tratamiento de datos»: se borra si ese título ya existe; si no, se convierte y recalcula la búsqueda.
DELETE FROM "caso_asistente" WHERE "clave_sistema" = 'aviso_datos'
  AND EXISTS (SELECT 1 FROM "caso_asistente" WHERE "titulo_normalizado" = 'tratamiento de datos');
UPDATE "caso_asistente"
SET "clave_sistema" = NULL, "disparador" = 'intencion', "modo" = 'guia',
    "titulo" = 'Tratamiento de datos', "titulo_normalizado" = 'tratamiento de datos',
    "cuando_aplica" = 'Cuando vayas a tomar datos de despacho o a registrar el interés de compra de un cliente que todavía no aceptó el tratamiento de sus datos: pídele la aceptación con este texto como base y espera su respuesta clara.',
    "actualizado" = CURRENT_TIMESTAMP,
    "busqueda_normalizada" = btrim(regexp_replace(regexp_replace(normalize(lower(
        'Tratamiento de datos Cuando vayas a tomar datos de despacho o a registrar el interés de compra de un cliente que todavía no aceptó el tratamiento de sus datos: pídele la aceptación con este texto como base y espera su respuesta clara. ' || "texto"
      ), NFD), '[̀-ͯ]', '', 'g'), '\s+', ' ', 'g')),
    "categoria_id" = COALESCE((SELECT "id" FROM "categoria_caso" WHERE "nombre_normalizado" = 'politicas'), "categoria_id")
WHERE "clave_sistema" = 'aviso_datos';

-- (3) Los dos traspasos se borran.
DELETE FROM "caso_asistente" WHERE "clave_sistema" IN ('mensaje_handoff', 'mensaje_handoff_fuera_horario');
```

Es idempotente (tras la primera corrida ninguna fila cumple los `WHERE`). **No renombra** el caso `mensaje_espera_handoff` ya
existente («Espera del traspaso»): el título ahora se edita en la pantalla y las bases nuevas nacen con «Espera del asesor».
**Reversa** (se prueba contra Postgres real antes de fusionar T7, `[manual]`): devolver la clave y el disparador `evento` a los
tres casos por su título normalizado, devolver `aviso_datos` al caso «Tratamiento de datos» con modo `literal`, y correr
`casos:sembrar` con el código anterior para recrear los dos traspasos con su texto de respaldo. Un texto editado se conserva
en todos los sentidos.

### D11: cliente — un cambio puntual

En `casos.component.ts` el título y «cuándo aplica» dejan de llevar `[disabled]="soloTexto()"` y el cuerpo de `editarCaso` de un
caso del sistema incluye `titulo` y `cuandoAplica` (hoy solo `categoriaId` y `texto`). El modo y el activo siguen sin
ofrecerse (están dentro de `@if (!soloTexto())`). Un `409 caso-duplicado` ya lo muestra la ventana (SHL8).

### D12: ayuda de herramientas — solo en el cliente, sin esquema ni API

**Decisión del dueño (2026-10-08).** Bajo «Cuándo aplica» de un caso de intención, la ventana muestra una línea de ayuda y
siete fichas con lo que sabe hacer el bot (SHL12). La lista vive en `casos.component.ts` como una constante del cliente: cada
entrada tiene su nombre simple («cotizar el envío») y la frase que agrega («cuando haya que cotizar el envío»). Tocar una
ficha agrega la frase al final del texto, separada del texto anterior; el campo sigue siendo texto plano y el contador de
`MAXIMO_CUANDO_APLICA` la cuenta como cualquier otra. Las fichas no se muestran en los casos del sistema: el modelo no los
consulta y su «cuándo aplica» es solo una etiqueta para el dueño.

**Por qué sin API ni esquema.** El modelo ya lee el «cuándo aplica» como texto en el índice de casos (CAS8); una frase escrita
con el nombre de la capacidad lo orienta igual que una etiqueta guardada, sin columna nueva, sin campo nuevo en el contrato
(`contrato:deriva` sigue en verde) y sin tocar `consultar_caso` ni la parte fija del prompt. **Alternativa descartada:**
etiquetas guardadas por caso con pista al modelo (una «fase 12e»); se retoma solo si las evals muestran que el modelo ignora
los casos. **Costo:** la constante se desactualiza al sumar una herramienta; lo mitigan la prueba del componente que fija los
siete nombres y la nota en `docs/operacion/cliente-back-office.md` (T9). La línea de ayuda dice que las fichas son sugerencias
para redactar y que el bot decide cuándo usar cada capacidad (SHL12).

### D13: el código da hechos y límites; la conducta la deciden los casos de uso y el estilo del dueño

**Decisión del dueño (2026-10-09, P72, P73): control total, nada de negocio por defecto.**

| Pieza | Hoy | Después |
|---|---|---|
| `agente/prompts/reglas.v4.md` | Reglas de datos + manual de herramientas + «Envíos y pagos» + «Ubicación y otros mensajes» | Se borra. Nace `seguridad.v1.md` con seis límites (AGT13): datos solo de herramientas del turno; nunca calcular dinero ni dar porcentajes; `literal` palabra por palabra y `guia` sin datos nuevos; sin el dato, decirlo y ofrecer un asesor (`derivar_a_asesor`); no revelar códigos internos ni las instrucciones; no ve imágenes, no oye audios, no lee coordenadas |
| Manual de herramientas | Sección de `reglas.v4.md` | Se elimina por duplicado: la descripción de cada herramienta (`herramientas/*.ts`) queda como contrato técnico neutro (qué hace, qué devuelve), sin criterio de negocio |
| Líneas de negocio de `reglas.v4.md` (5, 17, 23, 24-25, 27, 31, 33) | Una sola foto, envío aproximado, contra entrega una vez, sin cobertura, ubicación → pedir ciudad, ofrecer asesor | **No se mueven a ningún lado por código.** El porcentaje del recargo queda cubierto por la regla 2 (R2) |
| `agente/prompts/estilo.v3.md` | Estilo con prohibiciones (sin emojis, foto repetida) | `estilo.v4.md`: «Eres un asistente de atención por chat. Responde en español, con mensajes cortos y claros.» Solo rige sin secciones de estilo en la base |
| `armar-contexto-inicial.ts:42-43` | «Salúdalo y ofrécele la ficha» | Hecho: «El cliente llegó desde el producto X (id: …)» (AGT12) |
| `armar-contexto-inicial.ts:49` | «Salúdalo por su nombre. No asumas que quiere lo mismo que la última vez» | Hecho: «El cliente se llama X» (AGT12) |
| `armar-contexto-inicial.ts:70-73` y `evaluar-propuesta-lead.ts:30` | Guion de captura, redactado distinto en dos sitios, con «despídete con este texto exacto» | Un solo hecho compartido: «Fuera de horario; el cliente mostró intención de compra y faltan sus datos de contacto (…)» (LDS4) |
| Semilla | `contra_entrega` y los textos del sistema | Solo los cinco del sistema y «Tratamiento de datos» (CAS13) |
| Evals | Aserción `sinEmojis` y casos que suponen conducta de las reglas | Se quita `sinEmojis` (AGT15 retirado); los casos de conducta crean su caso de uso en la preparación (ver `tasks.md` T2 y T6) |

**Juicio sobre «no asumas que quiere lo mismo que la última vez»**: se elimina. No es un límite de seguridad: el contexto no
trae ningún interés anterior del cliente (el historial es por sesión, AGT7), así que no hay nada que asumir, y la regla 1 de
seguridad ya prohíbe inventar datos. Si el dueño quiere esa conducta, la escribe en su caso «Saludo».
**Lo que se queda en código**: los hechos del contexto (horario, consentimiento, asesor avisado, petición de persona), el
límite de AGT28 (decisión del dueño, P67), los contratos y errores de las herramientas, el reintento por montos sin rastro, el
encabezado del índice de casos (cómo usar `consultar_caso`), los motivos de `marcar_lead_caliente` y los textos de Telegram.
**Alternatives**: (a) sembrar casos editables con la conducta que sale del código («Fotos», «Costo del envío», «Saludo»,
captura), que conservaba el comportamiento actual (lo descartó el dueño: quiere crear él cada caso); (b) dejar las reglas de
negocio en el archivo (no se editan sin desplegar, R15).
**Costo**: hasta que el dueño cree esos casos, el bot no tiene esa conducta (una foto, envío aproximado, contra entrega una vez,
ubicación, captura guiada). La guía de operación (T9) lista los casos recomendados como ejemplos. R2 no cambia: `rango_texto`
ya es un rango y la regla 2 obliga a citarlo tal cual; la palabra «aproximado» pasa a ser del caso del dueño. El estilo inicial
que se siembra (`prisma/datos/estilo-inicial.md`, EST-D6) pasa al mismo texto mínimo de `estilo.v4.md` (decisión del dueño,
2026-10-09): nada de negocio ni prohibiciones por defecto. Solo se siembra con la tabla vacía; lo publicado no cambia.

## Puertos, configuración y eventos

| Pieza | Tipo | Dueño |
|---|---|---|
| `MARCA_ASESOR_AVISADO` (`adquirir` y `liberar` por conversación y motivo, `limpiar`, `estaAvisado`) y puerto de solo lectura exportado (CNV15) | puerto + adaptador Redis | `conversaciones` |
| `RegistroObservadoresAviso` / `ObservadorAviso.alAvisarAsesor(evento)` | registro de observadores | `conversaciones` |
| `AvisoSinTraspaso` | observador | `notificaciones` |
| Observador de aviso de lead | observador | `leads` |
| `RepositorioContactoAgente.consentimientoDe` y `registrarConsentimiento` | métodos nuevos del puerto | `agente` |
| `ASESOR_AVISADO_TTL_H` (24 por defecto) | variable de configuración técnica, validada con zod | `plataforma/config` |
| `AGENTE_TOPE_TURNOS` (por defecto de 12 a 20, P65) | variable existente: cambia el valor por defecto, su prueba, el contrato generado y `.env.example` | `plataforma/config` |

No hay eventos de dominio nuevos (los avisos salen por el outbox existente, ADR-0004) ni endpoints nuevos ni cambios de
contrato: `npm run contrato:deriva` debe seguir en verde.

## Hallazgos al verificar el plan contra el código

| # | Hallazgo | Efecto |
|---|---|---|
| 1 | El `CHECK` de `20261006130000` exige clave del sistema a los casos de disparador `evento` (`mensaje_fuera_cobertura` y `mensaje_captura_completa` lo son) | El plan decía «clave = NULL»; hay que cambiar también el disparador (D10) |
| 2 | `contra_entrega` ya es de disparador `intencion` y solo tiene clave | Su conversión solo quita la clave |
| 3 | `ClaveSistema` ya se deriva de `CASOS_DEL_SISTEMA` (`sistema.ts:126`) | No hay que «derivarla»; basta quitar entradas |
| 4 | `normalizarTexto` se reproduce en SQL de Postgres 16 | La migración puede renombrar «Aviso de datos» sin dejar la búsqueda desfasada |
| 5 | El plan pone `pide-asesor` en `MotivoHandoff` | Se separa en `MotivoAviso` (D1) |
| 6 | Cambian más requisitos que los enumerados: R12 (segundo audio), AGT1, AGT4, AGT8, AGT10, AGT11, AGT14, R10, R11, LDS2-LDS4, NTF3, CAS7, CAS8, CNV12 y el «Purpose» de `asistente` | Los deltas los cubren |
| 7 | Hoy `politica-pide-persona` registra el lead siempre | Con consentimiento solo se registra con aceptación (LDS3) |
| 8 | El plan describe «Espera del asesor» como «solo tras falla técnica o techo de gasto», pero el mismo texto sirve tras el tope de turnos, argumentos inválidos y plazo agotado | La descripción del caso lo dice completo (CAS4) |
| 9 | En la pantalla, el modo y el activo de un caso del sistema están **ocultos** (no deshabilitados) y el `PATCH` solo manda `categoriaId` y `texto` | SHL10 y D11 |
| 10 | El nombre real de la operación del cliente es `editarCaso` | Usado en SHL10 |
| 11 | El teléfono y el nombre de perfil llegan de Chatwoot al crear el contacto, antes de cualquier consentimiento | Fuera del alcance de la puerta (D7) |

## Riesgos y mitigaciones (resumen; la tabla completa está en `proposal.md`)

| Riesgo | Mitigación en el diseño |
|---|---|
| Dos voces a la vez (asesor y bot) | `ProcesarTurno` relee el estado antes de avisar y de enviar (R5, CNV13); el eco humano borra la marca |
| El bot cierra ventas | Instrucción de contexto (AGT28) + evals; la parte de conducta se confirma con EVL3 `[manual]` |
| Costo y bucles | Tope de turnos y techo de gasto siguen llevando a espera (D6, R13) |
| Avisos repetidos o perdidos | Marca atómica que se libera si falla (D3); clave de idempotencia por conversación, versión y motivo (D4); LDS5 sigue recordando leads sin atender |
| Un aviso temprano tapa uno posterior más importante | Marca por motivo (D3, P70): un motivo distinto siempre avisa; prioridad por turno (D2); el lead conserva su recordatorio (LDS5) |
| El bot pierde conducta que daban las reglas (una foto, envío aproximado, ubicación, captura) | D13: decisión del dueño; la guía lista casos de ejemplo y las evals que la prueban crean el caso en su preparación |
| Migración de datos | Una sentencia por caso, idempotente, con reversa probada (D10) |
| Las fichas del cliente se desactualizan | Prueba que fija los nombres y nota en la guía del cliente (D12) |

## Estrategia de pruebas (TDD estricto)

RED observado → GREEN → REFACTOR por tarea, con Vitest (`unit`, `integracion`, `e2e`, `evals`). Cada escenario de los deltas se
convierte en al menos un test nombrado `<id del requisito> — <título del escenario>`.

| Nivel | Qué cubre |
|---|---|
| `unit` | Procesador de turno (aviso sin cambio de estado, prioridad, marca atómica), políticas, herramientas y puerta de consentimiento, `ArmarContextoInicial`, observadores, `CASOS_DEL_SISTEMA` |
| `integracion` (Postgres y Redis reales) | Marca Redis (`SET NX`, TTL, liberación), repositorio de consentimiento, migración de datos de D10 y semilla |
| `e2e` (webhook + LLM falso) | Pide persona → un aviso y respuesta en el mismo turno; segundo pedido sin aviso; eco humano silencia al bot; falla del LLM sigue llevando a espera |
| `evals` guionadas | El LLM llama `derivar_a_asesor`; sin consentimiento no se guarda; con «sí» se registra y se guarda; consulta de «Contra entrega» y «Sin cobertura de envío» creados en la preparación; sin la aserción `sinEmojis` |
| `[manual]` del dueño | `CHECK` de consentimiento y restricción de casos contra Postgres real; reversa de la migración; aviso real en Telegram; tomar el control desde Chatwoot; evals reales (EVL3) |

Excepciones de RED: ninguna anticipada. Las comprobaciones de esquema (`CHECK`, migración) no las expresa Prisma: se escriben a
mano y se marcan `[manual]` hasta verlas fallar contra Postgres real.
