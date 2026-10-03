# Delta for Notificaciones

## MODIFIED Requirements

### Requirement: NTF1 — El aviso al asesor sale por un puerto y por el outbox

El sistema MUST enviar los avisos a los asesores por un puerto propio `Notificador` implementado con
Telegram, y MUST encolarlos en el outbox (ADR-0004); nadie MUST llamar a la API de Telegram de forma
directa. El texto del aviso MUST decir el **motivo** en claro y MUST llevar, cuando existan, la temperatura,
las señales, el resumen y el producto de interés por su nombre (NTF5), y MUST NOT llevar el teléfono, la
cédula, el correo, la dirección ni el nombre del cliente (**R14**). El texto MUST ser plano, sin `parse_mode`.

(Previously: el texto llevaba el resumen del lead —temperatura, señales y resumen— sin motivo ni producto.)

Fase que lo implementa: 08; 08d (motivo y producto)

#### Scenario: El aviso se encola en el outbox y se publica por Telegram

- Dado un lead derivado,
- Cuando se avisa al asesor,
- Entonces hay una fila de outbox de tipo `notificacion.telegram` que el publicador entrega con una
  llamada a `sendMessage` del bot configurado.

#### Scenario: El aviso no lleva datos personales completos

- Dado un lead cuyo contacto tiene nombre, teléfono y dirección,
- Cuando se arma el aviso,
- Entonces el texto no contiene el nombre, el teléfono ni la dirección y ningún log los contiene.

#### Scenario: El aviso dice el motivo y el producto

- Dado un lead caliente de la «Regadera fija con brazo» derivado por una señal fuerte,
- Cuando se arma el aviso,
- Entonces el texto dice que es un lead caliente, nombra el producto y no contiene su SKU.

### Requirement: NTF2 — Límite de avisos: por contacto para leads, por instancia para el resto

El sistema MUST NOT enviar un segundo aviso de **lead** para un contacto cuyo último aviso (`notificado_en`
de cualquiera de sus leads) fue hace menos de `LEADS_VENTANA_NOTIFICACION_H` horas (24 por defecto). La
comprobación y la marca MUST ser atómicas: dos derivaciones simultáneas del mismo contacto MUST producir
un solo aviso. Los avisos de **traspaso sin lead** (NTF6) y de **cliente esperando** (NTF7) MUST NOT depender de
esa ventana: se limitan a uno por instancia (una vez por traspaso y motivo; una vez por espera), de modo que un
motivo distinto siempre llega aunque el contacto ya haya sido avisado.

(Previously: la ventana de 24 h por contacto se aplicaba a todo aviso.)

Fase que lo implementa: 08; 08d (límite por instancia)

#### Scenario: Ventana de 24 horas por contacto

- Dado un contacto avisado hace 3 horas por un lead,
- Cuando otro lead suyo se deriva,
- Entonces no se encola un segundo aviso.

#### Scenario: Pasada la ventana se vuelve a avisar

- Dado un contacto avisado hace 25 horas,
- Cuando otro lead suyo se deriva,
- Entonces se encola el aviso.

#### Scenario: Dos derivaciones simultáneas avisan una sola vez

- Dado dos derivaciones concurrentes del mismo contacto,
- Cuando ambas intentan avisar,
- Entonces se encola un solo aviso.

#### Scenario: Un motivo distinto llega aunque el contacto ya fue avisado

- Dado un contacto avisado hace 2 horas por un lead caliente y cuya conversación vuelve a `bot`,
- Cuando la conversación pasa a un asesor por tope de turnos,
- Entonces se encola un aviso de traspaso aunque no hayan pasado 24 horas.

## ADDED Requirements

### Requirement: NTF5 — Todo aviso lleva un enlace a la conversación en Chatwoot

El sistema MUST incluir en cada aviso un enlace con la forma `<base>/app/accounts/<cuenta>/conversations/<id>`,
donde `<base>` es `CHATWOOT_URL_PUBLICA` (con respaldo en `CHATWOOT_URL`), `<cuenta>` es `CHATWOOT_ACCOUNT_ID` e
`<id>` es el identificador de la conversación en Chatwoot. El enlace MUST ir como texto plano en una línea propia,
para que Telegram lo vuelva tocable sin `parse_mode`, y MUST NOT contener datos personales del cliente. Si no se
puede armar el enlace (conversación sin identificador de Chatwoot), el aviso MUST salir igual sin la línea y
quedar registrado un `warn` sin datos del cliente.

Fase que lo implementa: 08d

#### Scenario: El aviso trae el enlace de la conversación

- Dado una conversación con id 2 en Chatwoot, cuenta 1 y `CHATWOOT_URL_PUBLICA=https://chat.ejemplo.co`,
- Cuando se arma cualquier aviso de esa conversación,
- Entonces el texto contiene, en una línea propia, `https://chat.ejemplo.co/app/accounts/1/conversations/2`.

#### Scenario: Sin URL pública se usa la de Chatwoot

- Dado `CHATWOOT_URL_PUBLICA` vacía y `CHATWOOT_URL=http://localhost:3001`,
- Cuando se arma un aviso,
- Entonces el enlace empieza por `http://localhost:3001/app/accounts/`.

#### Scenario: Una barra final en la URL base no duplica la barra

- Dado `CHATWOOT_URL_PUBLICA=https://chat.ejemplo.co/`,
- Cuando se arma el enlace,
- Entonces el resultado no contiene `//app`.

#### Scenario: Sin identificador de Chatwoot el aviso sale sin enlace

- Dado una conversación sin identificador de Chatwoot,
- Cuando se arma el aviso,
- Entonces el aviso se encola sin la línea del enlace y queda un `warn` sin datos del cliente.

### Requirement: NTF6 — Todo traspaso a una persona avisa, con su motivo

Cuando una conversación pasa a una persona por **cualquier** motivo de handoff (`lead-caliente`, `pide-persona`,
`tope-turnos`, `fallo-llm`, `techo-gasto`, `audio-repetido`, `argumentos-invalidos`, `plazo-agotado`), el sistema
MUST encolar un aviso al asesor **después** de confirmar la transición (NTF3). Cada motivo MUST decirse con un
texto propio en claro. Los motivos que nacen de un lead (`lead-caliente`, `pide-persona`) siguen el camino de
leads (NTF2 por contacto); los demás MUST avisar una sola vez por instancia de traspaso (conversación, motivo y
versión de la conversación) y MUST NOT crear un lead.

Fase que lo implementa: 08d

#### Scenario: El tope de turnos avisa

- Dado una conversación que llega al tope de turnos y pasa a `handoff_pendiente`,
- Cuando la transición queda confirmada,
- Entonces hay una fila de outbox `notificacion.telegram` cuyo texto dice que el bot llegó al tope de turnos y trae
  el enlace de la conversación.

#### Scenario: Cada motivo tiene su texto

- Dado un traspaso por falla del LLM y otro por techo de gasto,
- Cuando se arman los avisos,
- Entonces los dos textos son distintos y ninguno contiene teléfono ni nombre del cliente.

#### Scenario: Un reintento del mismo traspaso no duplica el aviso

- Dado un traspaso por tope de turnos ya avisado,
- Cuando el mismo evento de handoff se procesa de nuevo,
- Entonces no se encola un segundo aviso.

#### Scenario: Un traspaso posterior, con otra versión de la conversación, avisa de nuevo

- Dado una conversación que vuelve a `bot` y llega otra vez al tope de turnos,
- Cuando pasa a un asesor por segunda vez,
- Entonces se encola un aviso nuevo.

#### Scenario: Una transición fallida no avisa

- Dado un traspaso cuya transición falla o cuya conversación ya no está en el estado esperado,
- Cuando se intenta avisar,
- Entonces no se encola ningún aviso.

### Requirement: NTF7 — Un cliente que espera respuesta provoca un aviso

Cuando un cliente escribe mientras su conversación está en `humano` o `handoff_pendiente` y **ningún asesor
responde** en `ESPERA_CLIENTE_MIN` minutos (10 por defecto), el sistema MUST encolar **un** aviso de «cliente
esperando» con el enlace de la conversación y hace cuánto escribió. El aviso MUST NOT repetirse mientras dure esa
espera: una respuesta del asesor, el regreso de la conversación a `bot` o su cierre MUST cancelar la espera. El
sistema MUST NOT interpretar el contenido del mensaje para decidir si avisa (R14).

Fase que lo implementa: 08d

#### Scenario: El cliente escribe y nadie responde

- Dado una conversación en `humano` y un mensaje del cliente hace 11 minutos sin respuesta de un asesor,
- Cuando corre el barrido de esperas,
- Entonces se encola un aviso de cliente esperando con el enlace y «hace 11 min».

#### Scenario: Una respuesta del asesor cancela la espera

- Dado un mensaje del cliente en `humano` y un asesor que responde a los 4 minutos,
- Cuando corre el barrido de esperas pasados 15 minutos,
- Entonces no se encola ningún aviso.

#### Scenario: Una espera avisa una sola vez

- Dado una espera ya avisada,
- Cuando corre otro barrido y el cliente sigue sin respuesta,
- Entonces no se encola un segundo aviso.

#### Scenario: Un mensaje nuevo tras responder abre otra espera

- Dado una espera cancelada por una respuesta del asesor,
- Cuando el cliente vuelve a escribir y nadie responde en `ESPERA_CLIENTE_MIN` minutos,
- Entonces se encola un aviso nuevo.

#### Scenario: Una conversación que ya volvió a bot no avisa

- Dado un mensaje del cliente en `humano` y una conversación que vence y vuelve a `bot` con origen `ttl`,
- Cuando corre el barrido de esperas,
- Entonces no se encola ningún aviso.
