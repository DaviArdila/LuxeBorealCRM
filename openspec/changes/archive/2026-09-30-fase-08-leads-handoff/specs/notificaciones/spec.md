# Delta for Notificaciones

## ADDED Requirements

### Requirement: NTF1 — El aviso al asesor sale por un puerto y por el outbox

El sistema MUST enviar los avisos a los asesores por un puerto propio `Notificador` implementado con
Telegram, y MUST encolarlos en el outbox (ADR-0004); nadie MUST llamar a la API de Telegram de forma
directa. El texto del aviso MUST llevar el resumen del lead (temperatura, señales y resumen) y
MUST NOT llevar el teléfono, la cédula, el correo ni la dirección completos (**R14**).

Fase que lo implementa: 08

#### Scenario: El aviso se encola en el outbox y se publica por Telegram

- Dado un lead derivado,
- Cuando se avisa al asesor,
- Entonces hay una fila de outbox de tipo `notificacion.telegram` que el publicador entrega con una
  llamada a `sendMessage` del bot configurado.

#### Scenario: El aviso no lleva datos personales completos

- Dado un lead cuyo contacto tiene nombre, teléfono y dirección,
- Cuando se arma el aviso,
- Entonces el texto no contiene el teléfono ni la dirección y ningún log los contiene.

### Requirement: NTF2 — Máximo un aviso por contacto cada 24 horas

El sistema MUST NOT enviar un segundo aviso de lead para un contacto cuyo último aviso (`notificado_en`
de cualquiera de sus leads) fue hace menos de `LEADS_VENTANA_NOTIFICACION_H` horas (24 por defecto). La
comprobación y la marca MUST ser atómicas: dos derivaciones simultáneas del mismo contacto MUST producir
un solo aviso.

Fase que lo implementa: 08

#### Scenario: Ventana de 24 horas por contacto

- Dado un contacto avisado hace 3 horas,
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

### Requirement: NTF3 — El aviso se envía después de confirmar el cambio de estado

El aviso MUST encolarse solo después de que la transición de la conversación quedó confirmada en la base
(nunca antes), y MUST NOT encolarse si la transición falla o la conversación ya no está en el estado
esperado.

Fase que lo implementa: 08

#### Scenario: La notificación se envía después de confirmar el estado

- Dado un lead derivado dentro de horario,
- Cuando se ejecuta la derivación,
- Entonces la conversación ya está en `handoff_pendiente` cuando el aviso entra al outbox.

#### Scenario: Una transición fallida no avisa

- Dado que la transición a `handoff_pendiente` no se pudo aplicar,
- Cuando se procesa la derivación,
- Entonces no se encola ningún aviso.

### Requirement: NTF4 — Reintento hasta entregar, sin perder el lead

Ante un fallo de la API de Telegram el sistema MUST reintentar con backoff mediante el outbox: un 429 o
un 5xx o un error de red son transitorios (respetando `retry_after`), y un 400 o 401 es permanente y MUST
quedar registrado sin reintentar. Un aviso que no se pudo entregar MUST NOT borrar ni alterar el lead.

Fase que lo implementa: 08

#### Scenario: Reintento ante fallo de entrega

- Dado que Telegram responde 500 la primera vez y 200 la segunda,
- Cuando el publicador procesa el aviso,
- Entonces el aviso se entrega una sola vez tras el reintento.

#### Scenario: Un rechazo permanente no se reintenta

- Dado que Telegram responde 401 (token inválido),
- Cuando el publicador procesa el aviso,
- Entonces la fila queda como permanente y el lead sigue intacto.

#### Scenario: Sin credenciales de Telegram el aviso no rompe la derivación

- Dado un entorno de desarrollo sin `TELEGRAM_BOT_TOKEN`,
- Cuando se deriva un lead,
- Entonces la derivación termina bien y queda un log `warn` de que el aviso está desactivado.
