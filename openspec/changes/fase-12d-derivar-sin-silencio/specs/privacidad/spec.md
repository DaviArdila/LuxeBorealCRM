# Delta for Privacidad

El aviso fijo del primer mensaje (R14) se reemplaza por un **consentimiento explícito** antes de guardar datos personales.
El detalle de cómo el agente lo pide, lo registra y lo hace cumplir está en `agente` (AGT25-AGT27); este dominio fija la
regla y el dato.

## MODIFIED Requirements

### Requirement: R14 — Datos personales

Antes de guardar datos personales del cliente (nombre completo, dirección, localidad o teléfono alterno) o de registrar un
lead, el sistema MUST contar con la aceptación del tratamiento de datos de ese contacto (PRV1). Sin ella, el bot MUST seguir
respondiendo información general y MUST NOT guardar ningún dato ni registrar ningún lead. Los logs MUST NOT incluir contenido
de mensajes, números de teléfono completos, cédula ni correo. El contenido de los mensajes MUST NOT persistirse en la base
propia (vive en Chatwoot): el inbox de eventos MUST guardar el evento entrante **redactado** — solo ids, tipo de evento y
metadatos, nunca el texto del mensaje ni adjuntos. Al reprocesar un evento, el sistema MUST releer el contenido desde la API
de Chatwoot en vez de leerlo del payload persistido. El resumen de un lead (`lead.resumen`) MUST NOT incluir datos personales
(teléfono, cédula, correo ni dirección).

(Previously: el primer mensaje del bot MUST incluir un aviso de que es un asistente automatizado y de cómo se usan los datos;
el cliente no aceptaba nada y sus datos se guardaban igual.)

Fase que lo implementa: todas; 12d (consentimiento en lugar del aviso fijo)

#### Scenario: Sin aceptar no se guardan datos personales

- Dado un contacto que todavía no aceptó el tratamiento de datos,
- Cuando el bot intenta guardar su nombre y su dirección,
- Entonces no se guarda ningún dato, el bot recibe que falta el consentimiento y sigue respondiendo información general.

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

## ADDED Requirements

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
