# Delta for Configuración de negocio

## ADDED Requirements

### Requirement: CFN1 — Lista cerrada de mensajes fijos editables

El sistema MUST definir una lista cerrada de **mensajes fijos**: textos que el bot envía al cliente sin pasar por el
LLM y que viven en `parametro` con un texto de respaldo en código (R15). Cada mensaje MUST tener su clave, una
descripción en lenguaje del negocio (cuándo lo ve el cliente) y su texto de respaldo, definido en un solo lugar: el
módulo dueño del texto (AGT3). La lista de esta fase es:

| Clave | Módulo dueño |
|---|---|
| `mensaje_pedir_texto_audio`, `mensaje_imagen_no_procesada`, `aviso_datos`, `mensaje_handoff`, `mensaje_handoff_fuera_horario`, `mensaje_error_llm`, `mensaje_captura_completa` | `agente` |
| `mensaje_espera_handoff` | `conversaciones` |
| `mensaje_fuera_cobertura` | `catalogo` |
| `mensaje_techo_gasto` | `llm` |

`GET /api/v1/mensajes-fijos` (`listarMensajesFijos`) MUST devolver, solo al rol `admin`, cada mensaje de la lista con
su clave, descripción, texto vigente, origen (`base` si hay un valor válido en `parametro`, `respaldo` si no) y la
fecha de su última edición cuando existe. Ninguna otra clave de `parametro` MUST aparecer ni poder editarse por esta vía.

Fase que lo implementa: 11b

#### Scenario: La lista trae todos los mensajes con su origen

- Dado `mensaje_handoff` guardado en `parametro` y `mensaje_techo_gasto` sin fila,
- Cuando un admin llama a `GET /api/v1/mensajes-fijos`,
- Entonces la respuesta trae los diez mensajes; `mensaje_handoff` con origen `base` y `mensaje_techo_gasto` con origen
  `respaldo` y el texto de respaldo de `llm`.

#### Scenario: Una clave fuera de la lista no aparece

- Dado una fila `llm_techo_mensual_usd` en `parametro`,
- Cuando un admin lista los mensajes fijos,
- Entonces esa clave no aparece.

#### Scenario: Un asesor no ve los mensajes fijos

- Dado un asesor con sesión,
- Cuando llama a `GET /api/v1/mensajes-fijos`,
- Entonces la respuesta es `403` con el código `rol-insuficiente`.

### Requirement: CFN2 — Editar un mensaje fijo

`PUT /api/v1/mensajes-fijos/{clave}` (`guardarMensajeFijo`) MUST guardar, solo para el rol `admin`, el texto de una
clave de la lista de CFN1 en `parametro` y actualizar su fecha. MUST rechazar con `422` y el código
`mensaje-fijo-invalido`, con el motivo en el detalle, un texto vacío o en blanco, de más de 1.000 caracteres, con un
valor en pesos (R2) o con un marcador de plantilla `{{...}}`. Una clave fuera de la lista MUST responder `404` con el
código `mensaje-fijo-desconocido` sin escribir nada. El texto guardado MUST regir desde el siguiente mensaje del bot que
lo use, sin reiniciar. Los logs MUST registrar la clave y el id del usuario, no el texto.

Fase que lo implementa: 11b

#### Scenario: Un texto editado rige en el siguiente mensaje

- Dado `mensaje_handoff` con su texto de respaldo,
- Cuando un admin guarda «Ya te comunico con un asesor.» y luego una conversación pasa a un asesor,
- Entonces el cliente recibe «Ya te comunico con un asesor.».

#### Scenario: Un texto inválido se rechaza con su motivo

- Dado un texto en blanco, otro de 1.001 caracteres, otro con «$ 120.000» y otro con `{{nombre}}`,
- Cuando un admin intenta guardar cada uno,
- Entonces cada intento responde `422` con el código `mensaje-fijo-invalido` y su motivo, y el texto vigente no cambia.

#### Scenario: Una clave desconocida no se escribe

- Dado la clave `llm_techo_mensual_usd`,
- Cuando un admin llama a `PUT /api/v1/mensajes-fijos/llm_techo_mensual_usd`,
- Entonces la respuesta es `404` con el código `mensaje-fijo-desconocido` y la fila no cambia.

#### Scenario: Guardar un mensaje no escribe el texto en los logs

- Dado un mensaje fijo guardado por un admin,
- Cuando se revisan los logs del proceso,
- Entonces aparecen la clave y el id del usuario, y no el texto.

### Requirement: CFN3 — Semilla idempotente de los mensajes fijos

El sistema MUST ofrecer `npm run mensajes:sembrar`, que inserta en `parametro` cada mensaje de la lista de CFN1 que
**no** tiene fila, con su texto de respaldo actual. MUST NOT modificar una fila que ya existe, aunque su texto difiera
del respaldo. Correrla dos veces MUST dejar la base igual que correrla una vez. MUST informar cuántas claves insertó y
cuántas ya existían, sin imprimir los textos.

Fase que lo implementa: 11b

#### Scenario: La semilla llena una base vacía con los textos de respaldo

- Dado una base sin ninguno de los diez mensajes,
- Cuando se corre `npm run mensajes:sembrar`,
- Entonces existen las diez filas, cada una con el texto de respaldo de su módulo, e informa 10 insertadas y 0 existentes.

#### Scenario: La semilla no pisa un texto editado

- Dado `mensaje_handoff` editado por el dueño,
- Cuando se corre la semilla,
- Entonces `mensaje_handoff` conserva el texto del dueño.

#### Scenario: Correr la semilla dos veces no cambia nada

- Dado una semilla ya corrida,
- Cuando se corre otra vez,
- Entonces informa 0 insertadas y 10 existentes y ninguna fila cambia de fecha.
