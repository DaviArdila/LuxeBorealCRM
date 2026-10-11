# Privacidad — Specification

## Purpose

Garantiza que el sistema no exponga datos personales del cliente por descuido: ni en logs, ni en lo
que persiste de los eventos entrantes, ni en el resumen que se genera de un lead. El contenido de
los mensajes no es responsabilidad de este sistema — vive en Chatwoot; aquí solo se guarda lo
mínimo, redactado.

## Requirements

### Requirement: R14 — Datos personales

Antes de guardar datos personales del cliente (nombre completo, dirección, localidad o teléfono alterno) o de registrar un
lead, el sistema MUST contar con la aceptación del tratamiento de datos de ese contacto (PRV1). Sin ella, el bot MUST NOT
conversar con el modelo (PRV7, ADR-0028) y, como defensa en profundidad, las herramientas MUST NOT guardar ningún dato ni registrar ningún lead. Los logs MUST NOT incluir contenido
de mensajes, números de teléfono completos, cédula ni correo. El contenido de los mensajes MUST NOT persistirse en la base
propia (vive en Chatwoot): el inbox de eventos MUST guardar el evento entrante **redactado** — solo ids, tipo de evento y
metadatos, nunca el texto del mensaje ni adjuntos. Al reprocesar un evento, el sistema MUST releer el contenido desde la API
de Chatwoot en vez de leerlo del payload persistido. El resumen de un lead (`lead.resumen`) MUST NOT incluir datos personales
(teléfono, cédula, correo ni dirección).

(Previously: sin aceptación el bot seguía respondiendo información general y solo bloqueaba guardar datos; antes de eso, el primer mensaje del bot MUST incluir un aviso de que es un asistente automatizado y de cómo se usan los datos;
el cliente no aceptaba nada y sus datos se guardaban igual.)

Fase que lo implementa: todas; 12d (consentimiento en lugar del aviso fijo); consentimiento-obligatorio (barrera previa al modelo)

#### Scenario: Sin aceptar no se guardan datos personales

- Dado un contacto que todavía no aceptó el tratamiento de datos,
- Cuando una herramienta intenta guardar su nombre y su dirección,
- Entonces no se guarda ningún dato y la herramienta devuelve que falta el consentimiento (la barrera de PRV7 ya impide que el modelo converse con él).

#### Scenario: Con la aceptación los datos se guardan

- Dado un contacto que aceptó el tratamiento de datos,
- Cuando el bot guarda su nombre y su dirección,
- Entonces los datos quedan guardados en el contacto.

#### Scenario: El primer mensaje ya no lleva un aviso pegado por el código

- Dado que el bot inicia una conversación con un cliente nuevo,
- Cuando envía el primer mensaje,
- Entonces el texto es el que produce el turno, sin un aviso antepuesto por el sistema.

#### Scenario: El inbox guarda el evento redactado

- Dado que se registra un evento entrante en el inbox,
- Cuando se persiste,
- Entonces el payload guardado contiene solo ids, tipo de evento y metadatos — nunca el texto del
  mensaje, adjuntos ni datos personales.

#### Scenario: Reprocesar relee el contenido de Chatwoot

- Dado que un evento del inbox necesita reprocesarse,
- Cuando se reprocesa,
- Entonces el contenido se relee de la API de Chatwoot en vez de leerse del payload redactado que
  quedó persistido.

#### Scenario: El resumen de un lead no lleva datos personales

- Dado que se genera el resumen de un lead,
- Cuando se guarda,
- Entonces `lead.resumen` no incluye teléfono, cédula, correo ni dirección.

#### Scenario: Redacción en logs

- Dado que se escribe cualquier log del sistema,
- Cuando ese log incluiría contenido de mensajes, un número de teléfono completo, cédula o correo,
- Entonces esos datos se redactan (el número de teléfono se registra solo con sus últimos 4
  dígitos).

### Requirement: PRV1 — El consentimiento se registra por contacto, con su fecha

El sistema MUST guardar, por contacto, si aceptó o rechazó el tratamiento de datos y cuándo. La fecha MUST salir del `Clock`
inyectado y el contacto MUST salir del contexto del turno, nunca de lo que escriba el cliente o el modelo. Un contacto
nuevo MUST empezar sin respuesta (ni aceptó ni rechazó). Aceptar MUST reemplazar un rechazo anterior y rechazar MUST
reemplazar una aceptación anterior; nunca coexisten los dos estados. El consentimiento MUST valer para todas las
conversaciones del contacto, presentes y futuras. Registrarlo MUST NOT escribir el contenido del mensaje ni datos
personales en logs (R14). Esta fase guarda solo el último estado, no un historial.

Fase que lo implementa: 12d

#### Scenario: Un contacto nuevo no tiene respuesta de consentimiento

- Dado un contacto recién creado,
- Cuando se consulta su consentimiento,
- Entonces no aceptó ni rechazó.

#### Scenario: Aceptar guarda la fecha del reloj

- Dado un contacto sin respuesta y un `Clock` fijo a las 10:00,
- Cuando acepta el tratamiento de datos,
- Entonces el contacto queda con la aceptación fechada a las 10:00 y sin rechazo.

#### Scenario: Rechazar guarda el rechazo y ningún dato

- Dado un contacto sin respuesta,
- Cuando rechaza el tratamiento de datos,
- Entonces el contacto queda con el rechazo fechado y sin aceptación, y no se guarda ningún otro dato suyo.

#### Scenario: Aceptar después de rechazar reemplaza el rechazo

- Dado un contacto que rechazó,
- Cuando más tarde acepta,
- Entonces queda con la aceptación y sin rechazo.

#### Scenario: El consentimiento vale en una conversación nueva

- Dado un contacto que aceptó en una conversación anterior,
- Cuando abre una conversación nueva,
- Entonces el bot no vuelve a pedirle la aceptación.

#### Scenario: Registrar el consentimiento no deja datos en los logs

- Dado un contacto que acepta,
- Cuando se inspeccionan los logs del turno,
- Entonces no contienen el texto de su mensaje ni su teléfono completo.

### Requirement: PRV7 — Sin aceptar el tratamiento de datos, el contacto no conversa con el modelo

Todo contacto con consentimiento pendiente o rechazado MUST recibir un texto fijo de autorización y MUST NOT llegar al modelo
hasta aceptar. Un contacto pendiente MUST recibir el aviso, que lo presenta como asistente automatizado, informa para qué se usan
sus datos y pide responder SÍ o NO; uno que rechazó MUST recibir un recordatorio con la misma pregunta. Un SÍ MUST registrar la
aceptación (PRV1) y confirmar; un NO MUST registrar el rechazo y decir que sin autorización no se puede continuar; cualquier otra
respuesta MUST repetir el aviso o el recordatorio y no registrar nada. Quien rechazó MAY aceptar después con un SÍ. Si no se puede
leer o registrar el estado, el sistema MUST fallar cerrado: responde el recordatorio y no llama al modelo. Los audios, imágenes y
stickers MUST seguir resolviéndose por R12 sin llegar al modelo. Los textos MUST ser casos del sistema editables (R15) y la
barrera MUST NOT escribir contenido de mensajes en logs (R14). Es la primera línea de defensa; la puerta de AGT26 se conserva.

Fase que lo implementa: consentimiento-obligatorio (ADR-0028)

#### Scenario: Un contacto nuevo recibe el aviso y no llega al modelo

- Dado un contacto sin respuesta de consentimiento,
- Cuando escribe cualquier mensaje distinto de SÍ o NO,
- Entonces recibe el aviso con la pregunta «Responde SÍ o NO» y el modelo no se llama.

#### Scenario: Un sí registra la aceptación y confirma

- Dado un contacto sin respuesta,
- Cuando responde «sí», «acepto» o «1»,
- Entonces queda con la aceptación fechada, recibe la confirmación y el siguiente mensaje sigue el flujo normal.

#### Scenario: Un no registra el rechazo y no continúa

- Dado un contacto sin respuesta,
- Cuando responde «no» o «2»,
- Entonces queda con el rechazo fechado y recibe que sin su autorización no se puede continuar.

#### Scenario: Quien rechazó recibe el recordatorio y puede aceptar después

- Dado un contacto que rechazó,
- Cuando vuelve a escribir algo distinto de SÍ,
- Entonces recibe el recordatorio y el modelo no se llama; si responde «sí», queda con la aceptación y sin rechazo.

#### Scenario: Una respuesta ambigua repite el aviso

- Dado un contacto sin respuesta,
- Cuando responde «claro, pero antes dime el precio»,
- Entonces no se registra nada y recibe de nuevo el aviso.

#### Scenario: Si falla la lectura del estado no pasa al modelo

- Dado que leer el consentimiento del contacto falla,
- Cuando el contacto escribe,
- Entonces recibe el recordatorio y el modelo no se llama.

#### Scenario: Un contacto que ya aceptó pasa al modelo

- Dado un contacto que aceptó,
- Cuando escribe,
- Entonces la barrera lo deja pasar sin escribir nada.
