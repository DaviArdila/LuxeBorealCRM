# Delta for Estilo del agente

Dominio existente: el estilo vive hoy en `openspec/specs/agente/spec.md` (AGT18-AGT23). Esta fase **no cambia su
comportamiento externo**: solo mueve dónde se guarda y agrega quién publicó cada versión. Al archivar, estos requisitos
se fusionan en `openspec/specs/agente/spec.md` junto a AGT18-AGT23, que no se modifican.

El estilo es el comportamiento general del bot (tono, forma, formato), no una situación del negocio: lo que el bot
responde a cada situación va en los casos del asistente.

## ADDED Requirements

### Requirement: EST-D1 — Cada versión del estilo es una fila de `version_estilo`, con una sola vigente

El estilo MUST guardarse en una tabla propia `version_estilo` con una fila por versión (número, texto, si es la
vigente, fecha de publicación y quién la publicó). Exactamente una fila MUST ser la vigente, garantizado por la base
(índice único parcial). Publicar MUST ser una transacción con un candado que serialice a quienes publican a la vez y
que deje la fila nueva como vigente con el número siguiente; dos publicaciones simultáneas MUST NOT repetir un número.

Fase que lo implementa: 12

#### Scenario: Publicar crea una fila vigente nueva

- Dado un estilo vigente en la versión 2,
- Cuando un admin publica un texto válido,
- Entonces existe una fila de versión 3 vigente y la 2 deja de serlo, sin borrarse.

#### Scenario: Dos publicaciones a la vez no repiten la versión

- Dado un estilo vigente en la versión 2,
- Cuando dos admins publican al mismo tiempo,
- Entonces quedan las versiones 3 y 4, la 4 vigente, sin números repetidos.

#### Scenario: La base no admite dos versiones vigentes

- Dado una fila vigente,
- Cuando se intenta marcar otra fila como vigente sin desmarcar la primera,
- Entonces la base lo rechaza (comprobación `[manual]` del índice único parcial, además del test de integración).

### Requirement: EST-D2 — El comportamiento externo del estilo no cambia

El puerto `RepositorioEstilo` MUST conservar su forma y los casos de uso `PublicarEstilo`, `RestaurarEstilo`,
`ListarHistorialEstilo` y `ProveedorEstilo` MUST pasar sus tests sin cambiar los escenarios de AGT18-AGT22. La API
(AGT23) y el comando `npm run prompt:estilo` MUST responder igual que antes, salvo el campo nuevo de EST-D3. Un estilo
publicado MUST regir en el siguiente mensaje, con la copia en memoria y la versión compartida en Redis de AGT19.

Fase que lo implementa: 12

#### Scenario: Los tests de AGT18-AGT23 pasan sin editar sus escenarios

- Dado el adaptador nuevo detrás del mismo puerto,
- Cuando corren los tests de estilo del servicio,
- Entonces pasan sin cambiar el texto de ningún escenario existente.

#### Scenario: Un estilo publicado rige en el siguiente mensaje

- Dado un estilo publicado desde la pantalla,
- Cuando el cliente escribe,
- Entonces el prompt del turno usa el texto nuevo, sin reiniciar.

#### Scenario: El comando de estilo funciona igual

- Dado `npm run prompt:estilo -- ver`, `historial`, `publicar` y `restaurar`,
- Cuando se corren contra la base nueva,
- Entonces producen los mismos resultados que antes del cambio.

#### Scenario: Sin estilo guardado rige el archivo

- Dado una base sin ninguna fila en `version_estilo`,
- Cuando el agente pide el estilo,
- Entonces rige `estilo.v3.md` con origen `archivo` (AGT18).

### Requirement: EST-D3 — Cada versión guarda quién la publicó y la API lo muestra

Cada versión MUST guardar el usuario que la publicó (o, cuando la publicó el comando `npm run prompt:estilo`, un valor
que lo indique). Restaurar una versión MUST registrar a quien restauró como autor de la versión nueva. `obtenerEstilo` y
`listarHistorialEstilo` MUST devolver `publicadoPor` con el nombre y el identificador del usuario, o `null` si fue el
comando; ningún log MUST escribir el texto del estilo (R14), solo la versión y el identificador.

Fase que lo implementa: 12

#### Scenario: Publicar por la API guarda al usuario

- Dado un admin con sesión,
- Cuando publica un estilo válido,
- Entonces la versión nueva guarda su identificador y `obtenerEstilo` devuelve su nombre en `publicadoPor`.

#### Scenario: Publicar por el comando no tiene usuario

- Dado un estilo publicado con `npm run prompt:estilo -- publicar`,
- Cuando un admin consulta el historial,
- Entonces esa versión trae `publicadoPor` nulo.

#### Scenario: Restaurar registra a quien restauró

- Dado una versión 1 en el historial,
- Cuando un admin la restaura,
- Entonces la versión nueva trae a ese admin en `publicadoPor` y el texto de la 1.

#### Scenario: El historial muestra el autor de cada versión

- Dado un historial con versiones publicadas por dos admins,
- Cuando un admin llama a `listarHistorialEstilo`,
- Entonces cada versión trae su `publicadoPor`.

### Requirement: EST-D4 — La migración copia el estilo de `parametro` sin perder versiones

La migración de esquema MUST copiar a `version_estilo` el estilo vigente y su historial de `parametro`
(`prompt_estilo`, `prompt_estilo_version`, `prompt_estilo_historial`) conservando sus números de versión, y MUST dejar
la copia vigente como la de `prompt_estilo`. Sin estilo guardado MUST no crear filas. Las tres claves viejas MUST
seguir en `parametro` hasta T11 (limpieza) y MUST borrarse allí.

Fase que lo implementa: 12

#### Scenario: La migración conserva el vigente y el historial

- Dado una base con el estilo en la versión 5 y cuatro versiones en el historial,
- Cuando se aplica la migración,
- Entonces `version_estilo` tiene la versión 5 vigente y las cuatro anteriores con sus números y textos.

#### Scenario: Sin estilo guardado la migración no crea filas

- Dado una base sin `prompt_estilo`,
- Cuando se aplica la migración,
- Entonces `version_estilo` queda vacía y el agente usa el archivo.

#### Scenario: Después de la limpieza las claves viejas desaparecen

- Dado el cierre de T11,
- Cuando se consulta `parametro`,
- Entonces no existe ninguna clave `prompt_estilo*`.

### Requirement: EST-D5 — El historial conserva las diez versiones anteriores a la vigente

Publicar MUST podar las versiones más antiguas para que queden la vigente y como máximo diez anteriores (el límite de
AGT21 no cambia). La versión vigente MUST NOT podarse nunca.

Fase que lo implementa: 12

#### Scenario: La undécima versión anterior se poda

- Dado una vigente y diez anteriores,
- Cuando un admin publica una versión nueva,
- Entonces queda la nueva vigente y diez anteriores, y la más antigua desaparece.

#### Scenario: La vigente nunca se poda

- Dado cualquier número de publicaciones,
- Cuando se revisa `version_estilo`,
- Entonces siempre hay exactamente una fila vigente.
