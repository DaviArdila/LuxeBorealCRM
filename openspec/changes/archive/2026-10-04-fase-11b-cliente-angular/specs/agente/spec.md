# Delta for Agente

## ADDED Requirements

### Requirement: AGT23 — El estilo se administra por la API, solo por un admin

El sistema MUST exponer, solo al rol `admin` (API7, USR6), tres operaciones sobre el estilo que reutilizan los casos
de uso de AGT20 y AGT21 sin duplicar sus reglas:

- `GET /api/v1/agente/estilo` (`obtenerEstilo`): versión vigente, origen (`base` o `archivo`) y texto (AGT18).
- `GET /api/v1/agente/estilo/historial` (`listarHistorialEstilo`): las versiones guardadas, la más reciente primero,
  con versión, fecha y texto.
- `PUT /api/v1/agente/estilo` (`publicarEstilo`): publica un texto; responde `200` con la versión nueva, o `422` con
  el código `estilo-invalido` y el motivo de AGT20 en el detalle.
- `POST /api/v1/agente/estilo/restauraciones` (`restaurarEstilo`): restaura una versión del historial como versión
  nueva; responde `200` con la versión nueva, `404` con el código `version-estilo-inexistente` si no está en el
  historial, o `422` con `estilo-invalido`.

Publicar o restaurar por la API MUST invalidar la copia en memoria igual que el comando (AGT19). Ni las operaciones ni
sus logs MUST escribir el texto del estilo en los logs: solo la versión y el id del usuario (R14).

Fase que lo implementa: 11b

#### Scenario: Un admin consulta el estilo vigente

- Dado un estilo publicado en la versión 3,
- Cuando un admin llama a `GET /api/v1/agente/estilo`,
- Entonces la respuesta es `200` con la versión 3, origen `base` y su texto.

#### Scenario: Sin estilo publicado la API muestra el del archivo

- Dado que nunca se publicó un estilo,
- Cuando un admin llama a `GET /api/v1/agente/estilo`,
- Entonces la respuesta tiene origen `archivo` y el texto de `estilo.v3.md`.

#### Scenario: Publicar por la API cambia la respuesta del siguiente turno

- Dado un estilo vigente en la versión 2,
- Cuando un admin publica un estilo válido por `PUT /api/v1/agente/estilo`,
- Entonces la respuesta es `200` con la versión 3 y el prompt del siguiente turno usa el texto nuevo, sin reiniciar.

#### Scenario: Un estilo inválido se rechaza con su motivo

- Dado un texto con un valor en pesos,
- Cuando un admin lo publica por la API,
- Entonces la respuesta es `422` con el código `estilo-invalido`, el motivo en el detalle, y la versión vigente no cambia.

#### Scenario: Restaurar por la API publica una versión nueva

- Dado un historial con la versión 1 y el vigente en la versión 3,
- Cuando un admin restaura la versión 1,
- Entonces la respuesta es `200` con la versión 4 y su texto es el de la versión 1.

#### Scenario: Restaurar una versión que no existe se rechaza

- Dado un historial sin la versión 9,
- Cuando un admin pide restaurarla,
- Entonces la respuesta es `404` con el código `version-estilo-inexistente`.

#### Scenario: Un asesor no administra el estilo

- Dado un asesor con sesión,
- Cuando llama a cualquiera de las cuatro operaciones del estilo,
- Entonces la respuesta es `403` con el código `rol-insuficiente` y nada cambia.

#### Scenario: Publicar por la API no escribe el texto en los logs

- Dado un estilo publicado por la API,
- Cuando se revisan los logs del proceso,
- Entonces aparecen la versión y el id del usuario, y no el texto del estilo.
