# Delta for Agente

## MODIFIED Requirements

### Requirement: AGT13 — Prompt de sistema versionado con prefijo estable

El prompt de sistema MUST armarse en este orden: reglas no negociables (incluida la regla de cuándo citar una
política), estilo, catálogo compacto sin precios, y al final las instrucciones variables del turno (contexto
inicial, horario). `reglas` y la plantilla del turno MUST venir de archivos versionados en `agente/prompts/`;
el `estilo` MUST venir de `parametro` (AGT18) con el archivo versionado como respaldo. `reglas` MUST contener
solo lo que no se negocia (R1, R2, R14, uso de herramientas, envíos y pagos); `estilo` MUST contener la identidad,
el tono, la longitud, el formato y los emojis, de modo que pueda cambiarse sin tocar las reglas. El prefijo
(reglas + estilo + catálogo) MUST ser idéntico entre turnos de conversaciones distintas mientras no cambien el
estilo publicado ni el catálogo, para aprovechar la caché de prompts (ADR-0002). La versión del prompt y la del
estilo MUST quedar en un log estructurado del turno (sin contenido).

(Previously: el estilo venía de un archivo versionado.)

Fase que lo implementa: 07b; 08b (separación de `estilo`); 08c (estilo desde la base)

#### Scenario: Dos conversaciones distintas comparten el mismo prefijo

- Dado dos turnos de conversaciones distintas con el mismo catálogo y el mismo estilo publicado,
- Cuando se arma el prompt de cada uno,
- Entonces ambos empiezan con exactamente el mismo texto hasta el final del catálogo compacto.

#### Scenario: El prompt no contiene precios

- Dado un catálogo con productos que tienen precio,
- Cuando se arma el prompt de sistema,
- Entonces el texto no contiene ningún valor en pesos.

#### Scenario: El estilo va entre las reglas y el catálogo

- Dado el archivo `reglas` y un estilo,
- Cuando se arma el prompt de sistema,
- Entonces el texto contiene primero las reglas, luego el estilo y después el catálogo.

#### Scenario: Cambiar el estilo no cambia las reglas

- Dado dos estilos distintos con el mismo archivo `reglas`,
- Cuando se arma el prompt con cada uno,
- Entonces la parte de reglas es idéntica en ambos textos.

#### Scenario: La versión del estilo queda en el log sin su contenido

- Dado un estilo publicado en la versión 3,
- Cuando se procesa un turno,
- Entonces el log estructurado lleva la versión del prompt y la del estilo, y no el texto del estilo.

## ADDED Requirements

### Requirement: AGT18 — El estilo se lee de la base con el archivo como respaldo

El estilo del agente MUST leerse de la clave `prompt_estilo` de `parametro`. Si la clave no existe, está en blanco
o su valor no es texto, MUST regir el archivo `estilo` versionado, y nunca lanzar ni dejar al bot sin estilo
(R15). `reglas` y la plantilla del turno MUST NOT leerse de la base.

Fase que lo implementa: 08c

#### Scenario: Un estilo publicado reemplaza al del archivo

- Dado un estilo publicado en `parametro` distinto del archivo,
- Cuando se arma el prompt del siguiente turno,
- Entonces el prompt usa el estilo publicado y no el del archivo.

#### Scenario: Sin estilo publicado rige el archivo

- Dado que `prompt_estilo` no existe en `parametro`,
- Cuando se arma el prompt,
- Entonces el prompt usa el estilo del archivo versionado.

#### Scenario: Un valor en blanco o que no es texto cae al respaldo

- Dado que `prompt_estilo` es una cadena en blanco o un número,
- Cuando se arma el prompt,
- Entonces el prompt usa el estilo del archivo versionado y no falla.

### Requirement: AGT19 — Copia en memoria del estilo, invalidada por versión

El sistema MUST mantener una copia en memoria del estilo y MUST comparar en cada turno una versión compartida en
Redis (`agente:prompt:version`); mientras la versión no cambie MUST NOT consultar la base. Publicar o restaurar un
estilo MUST incrementar esa versión, de modo que el siguiente turno de cualquier proceso lea el estilo nuevo. La
copia MUST tener un tiempo de vida de respaldo de 5 minutos por si la clave de versión se pierde. Si Redis falla,
el turno MUST leer el estilo de la base y continuar.

Fase que lo implementa: 08c

#### Scenario: Una lectura repetida no consulta la base mientras la versión no cambia

- Dado un estilo ya leído una vez con la versión actual,
- Cuando se arma el prompt de dos turnos seguidos,
- Entonces la base se consulta una sola vez.

#### Scenario: Publicar un estilo hace que el siguiente turno lo use

- Dado un estilo ya leído una vez,
- Cuando se publica un estilo nuevo y llega otro mensaje,
- Entonces el prompt de ese turno usa el estilo nuevo sin reiniciar el proceso.

#### Scenario: Si Redis falla el turno sigue con el estilo de la base

- Dado que Redis no responde,
- Cuando se arma el prompt de un turno,
- Entonces el prompt usa el estilo leído de la base y el turno no falla.

### Requirement: AGT20 — El estilo se valida antes de publicarse

Un estilo MUST rechazarse, con el motivo, si está vacío o en blanco, si supera 4.000 caracteres, si contiene un
valor en pesos (R1, R2), un SKU con la forma `SKU-XXXX` (AGT16) o un marcador de plantilla `{{...}}`. Un estilo
válido MUST aceptarse sin modificarlo.

Fase que lo implementa: 08c

#### Scenario: Un estilo vacío o demasiado largo se rechaza

- Dado un estilo en blanco y otro de 4.001 caracteres,
- Cuando se validan,
- Entonces ambos se rechazan con su motivo.

#### Scenario: Un estilo con precios, SKU o marcadores de plantilla se rechaza

- Dado un estilo que contiene `$389.000`, otro con `SKU-GL001` y otro con `{{horario}}`,
- Cuando se validan,
- Entonces los tres se rechazan con su motivo.

#### Scenario: Un estilo válido se acepta

- Dado un estilo de texto corriente con viñetas y sin pesos ni SKU,
- Cuando se valida,
- Entonces se acepta tal cual.

### Requirement: AGT21 — Historial de estilos y vuelta atrás

Al publicar un estilo válido, el sistema MUST guardar el texto anterior en el historial (`prompt_estilo_historial`,
con versión, texto y fecha) y MUST conservar solo las 10 versiones más recientes. Restaurar una versión del historial
MUST publicar su texto como una versión nueva, sin reescribir el pasado, y MUST validarlo como cualquier estilo.

Fase que lo implementa: 08c

#### Scenario: Publicar guarda el estilo anterior en el historial

- Dado un estilo vigente en la versión 2,
- Cuando se publica un estilo nuevo,
- Entonces el historial contiene el texto de la versión 2 y el vigente pasa a la versión 3.

#### Scenario: Restaurar una versión la publica como versión nueva

- Dado un historial con las versiones 1 y 2 y el vigente en la 3,
- Cuando se restaura la versión 1,
- Entonces el vigente es el texto de la versión 1 con la versión 4 y el historial conserva las anteriores.

#### Scenario: El historial no guarda más de 10 versiones

- Dado un historial con 10 versiones,
- Cuando se publica un estilo nuevo,
- Entonces el historial sigue teniendo 10 versiones y la más antigua se descarta.

### Requirement: AGT22 — Comando para editar el estilo

El sistema MUST ofrecer el comando `npm run prompt:estilo` con las acciones `ver` (versión, origen `base` o `archivo`
y texto), `historial`, `publicar --archivo <ruta>` y `restaurar --version <n>`. `publicar` y `restaurar` MUST usar los
casos de uso de AGT20 y AGT21 y MUST recordar que un estilo nuevo exige una corrida real de evals (EVL3) antes de
llegar a clientes. El comando MUST NOT escribir el texto del estilo en los logs (R14).

Fase que lo implementa: 08c

#### Scenario: Publicar desde un archivo deja el estilo vigente

- Dado un archivo con un estilo válido,
- Cuando se ejecuta `publicar --archivo` sobre él,
- Entonces `ver` muestra ese texto con origen `base` y la versión incrementada.

#### Scenario: Un estilo inválido no se publica

- Dado un archivo con un estilo que contiene un precio,
- Cuando se ejecuta `publicar --archivo` sobre él,
- Entonces el comando termina con error que nombra el motivo y el estilo vigente no cambia.

#### Scenario: El comando no escribe el texto del estilo en los logs

- Dado un estilo publicado con el comando,
- Cuando se revisan los logs del proceso,
- Entonces no aparece el texto del estilo, solo la versión.
