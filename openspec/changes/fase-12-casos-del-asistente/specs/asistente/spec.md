# Delta for Asistente

Dominio nuevo. Es el dueño de **todo lo que el bot le dice al cliente**: categorías, casos de uso, la lista cerrada de
casos del sistema (los que el código dispara solo) y el puerto único con el que los demás módulos piden un texto.

Regla que ordena el dominio: si el cliente lo lee, es un caso; si el código lo usa para calcular o decidir, es un
parámetro del negocio (`configuracion`); cómo habla el bot es el estilo (`estilo-agente`).

## ADDED Requirements

### Requirement: CAS1 — Las categorías y los casos son datos con título único

El sistema MUST guardar **categorías** (nombre único sin distinguir mayúsculas ni acentos, y un orden) y **casos** (una
categoría, un título único sin distinguir mayúsculas ni acentos, «cuándo aplica», texto, modo `literal` o `guia`,
disparador `evento` o `intencion`, una clave del sistema opcional, activo y fecha de actualización). Un caso MUST
pertenecer a una sola categoría. El título MUST ser único porque es con lo que el agente pide un caso (CAS8).

Fase que lo implementa: 12

#### Scenario: Dos categorías no pueden llamarse igual

- Dado una categoría «Políticas»,
- Cuando un admin intenta crear otra llamada «politicas»,
- Entonces la respuesta es `409` con el código `categoria-duplicada` y no se crea nada.

#### Scenario: Un caso necesita una categoría que exista

- Dado un identificador de categoría inexistente,
- Cuando un admin crea un caso en esa categoría,
- Entonces la respuesta es `404` con el código `categoria-inexistente`.

#### Scenario: Dos casos no pueden tener el mismo título

- Dado un caso titulado «Garantía»,
- Cuando un admin crea otro titulado «garantia»,
- Entonces la respuesta es `409` con el código `caso-duplicado`.

### Requirement: CAS2 — Las categorías se crean, renombran, ordenan y borran

Un admin MUST poder crear, renombrar, reordenar y borrar categorías. Una categoría con casos MUST NOT borrarse: la
respuesta explica que primero hay que moverlos o borrarlos. El reordenamiento MUST recibir la lista completa de
categorías en el orden deseado y rechazar una lista que no coincida con las existentes.

Fase que lo implementa: 12

#### Scenario: Crear una categoría

- Dado una lista de categorías,
- Cuando un admin crea la categoría «Pagos»,
- Entonces la respuesta es `201`, la categoría queda al final del orden y aparece en el listado.

#### Scenario: Renombrar una categoría

- Dado una categoría «Pagos»,
- Cuando un admin la renombra a «Medios de pago»,
- Entonces la respuesta es `200` y sus casos siguen asociados a ella.

#### Scenario: Reordenar las categorías

- Dado tres categorías A, B y C,
- Cuando un admin envía el orden C, A, B,
- Entonces el listado de categorías sale en ese orden.

#### Scenario: Un orden que no coincide con las categorías existentes se rechaza

- Dado tres categorías,
- Cuando un admin envía un orden con solo dos de ellas,
- Entonces la respuesta es `422` y el orden no cambia.

#### Scenario: Borrar una categoría vacía

- Dado una categoría sin casos,
- Cuando un admin la borra,
- Entonces la respuesta es `204` y ya no aparece en el listado.

#### Scenario: Una categoría con casos no se borra

- Dado una categoría con un caso,
- Cuando un admin intenta borrarla,
- Entonces la respuesta es `409` con el código `categoria-con-casos` y la categoría sigue existiendo.

### Requirement: CAS3 — Los casos de intención se crean, editan, desactivan y borran libremente

Un admin MUST poder crear, editar, activar o desactivar y borrar los casos de **intención** (los que el cliente provoca
al preguntar algo). Un caso nuevo MUST nacer activo y en modo `literal` salvo que se indique otro. Editar un caso MUST
exigir la fecha de actualización que el cliente leyó: si cambió mientras tanto, la respuesta MUST ser `409` con el
código `caso-modificado` y no pisar el cambio ajeno. Un caso desactivado MUST seguir existiendo pero no llegar al bot.

Fase que lo implementa: 12

#### Scenario: Crear un caso de intención

- Dado una categoría «Pagos»,
- Cuando un admin crea el caso «Medios de pago» con su «cuándo aplica» y su texto,
- Entonces la respuesta es `201`, el caso queda activo, en modo `literal` y con disparador `intencion`.

#### Scenario: Editar un caso de intención

- Dado un caso «Garantía» leído con su fecha de actualización,
- Cuando un admin cambia su texto enviando esa fecha,
- Entonces la respuesta es `200` con el texto nuevo y una fecha de actualización posterior.

#### Scenario: Una edición sobre una versión vieja se rechaza

- Dado un caso que otro admin modificó después de que este lo leyó,
- Cuando este admin guarda enviando la fecha vieja,
- Entonces la respuesta es `409` con el código `caso-modificado` y el texto del otro admin queda intacto.

#### Scenario: Desactivar un caso lo saca del bot sin borrarlo

- Dado un caso de intención activo,
- Cuando un admin lo desactiva,
- Entonces sigue en el listado como inactivo y deja de aparecer en el índice del agente (CAS8).

#### Scenario: Borrar un caso de intención

- Dado un caso de intención sin clave del sistema,
- Cuando un admin lo borra,
- Entonces la respuesta es `204` y ya no aparece en el listado.

### Requirement: CAS4 — Los casos del sistema son una lista cerrada que se edita pero no se crea ni se borra

Los casos que el **código** dispara solo MUST ser una lista cerrada en `asistente/dominio/sistema.ts`, cada uno con su
clave, su descripción de cuándo se envía y su texto de respaldo. La lista MUST contener, como mínimo, los diez mensajes
fijos de hoy (`mensaje_pedir_texto_audio`, `mensaje_imagen_no_procesada`, `aviso_datos`, `mensaje_handoff`,
`mensaje_handoff_fuera_horario`, `mensaje_error_llm`, `mensaje_captura_completa`, `mensaje_fuera_cobertura`,
`mensaje_espera_handoff`, `mensaje_techo_gasto`) más `contra_entrega`. Un caso con clave del sistema MUST poder editarse
(texto, categoría, título y «cuándo aplica») y MUST NOT borrarse ni desactivarse. La API MUST NOT permitir crear un caso
con una clave del sistema ni cambiar la clave de uno existente: una situación nueva necesita código que la detecte.
Siempre MUST existir un texto para cada clave: el guardado, o el de respaldo si falta.

Fase que lo implementa: 12

#### Scenario: Los casos del sistema existen después de sembrar

- Dado una base recién migrada,
- Cuando se corre `npm run casos:sembrar`,
- Entonces existen once casos con clave del sistema, cada uno con el texto de respaldo de su clave.

#### Scenario: Un caso del sistema se edita

- Dado el caso `mensaje_handoff`,
- Cuando un admin cambia su texto,
- Entonces la respuesta es `200` y el caso conserva su clave del sistema.

#### Scenario: Un caso del sistema no se borra

- Dado el caso `mensaje_handoff`,
- Cuando un admin intenta borrarlo,
- Entonces la respuesta es `409` con el código `caso-del-sistema` y el caso sigue existiendo.

#### Scenario: Un caso del sistema no se desactiva

- Dado el caso `aviso_datos`,
- Cuando un admin intenta desactivarlo,
- Entonces la respuesta es `409` con el código `caso-del-sistema` y sigue activo.

#### Scenario: La API no crea casos con clave del sistema

- Dado una petición para crear un caso que trae una clave del sistema,
- Cuando un admin la envía,
- Entonces la respuesta es `422` y no se crea nada.

### Requirement: CAS5 — El texto de un caso se valida al guardarlo

Guardar un caso MUST rechazar con `422` y el código `caso-invalido` un texto vacío, de más de 1.200 caracteres, con un
valor en pesos (R1, R2), con un SKU (AGT16) o con un marcador de plantilla `{{...}}`, con las mismas funciones que
valida el estilo (`compartido/texto`). El título MUST tener entre 1 y 80 caracteres y el «cuándo aplica» de un caso de
intención entre 1 y 200. Un caso del sistema MUST NOT usar el modo `guia`. El motivo del rechazo MUST nombrar la regla y
MUST NOT copiar el texto (R14). El texto se guarda sin los espacios y saltos de línea de los bordes.

Fase que lo implementa: 12

#### Scenario: Un texto con un valor en pesos se rechaza

- Dado un texto con «$ 45.000»,
- Cuando un admin guarda el caso,
- Entonces la respuesta es `422` con el código `caso-invalido` y el motivo «contiene un valor en pesos (R1, R2)».

#### Scenario: Un texto con un SKU se rechaza

- Dado un texto con «SKU-GRF-001»,
- Cuando un admin guarda el caso,
- Entonces la respuesta es `422` con el código `caso-invalido` y el motivo menciona AGT16.

#### Scenario: Un texto con un marcador de plantilla se rechaza

- Dado un texto con «{{nombre}}»,
- Cuando un admin guarda el caso,
- Entonces la respuesta es `422` con el código `caso-invalido`.

#### Scenario: Un texto vacío o demasiado largo se rechaza

- Dado un texto vacío y otro de 1.201 caracteres,
- Cuando un admin intenta guardar cada uno,
- Entonces ambos responden `422` con el código `caso-invalido`.

#### Scenario: El «cuándo aplica» es obligatorio en un caso de intención

- Dado un caso de intención sin «cuándo aplica»,
- Cuando un admin lo guarda,
- Entonces la respuesta es `422` con el código `caso-invalido`.

#### Scenario: Un caso del sistema no admite el modo guía

- Dado el caso `mensaje_error_llm`,
- Cuando un admin lo cambia a modo `guia`,
- Entonces la respuesta es `422` con el código `caso-invalido`.

#### Scenario: El motivo no copia el texto

- Dado un texto rechazado por contener un valor en pesos,
- Cuando se arma la respuesta y el registro del rechazo,
- Entonces ninguno contiene el texto del caso (R14).

### Requirement: CAS6 — La semilla carga los casos de hoy sin pisar lo editado

`npm run casos:sembrar` MUST crear, de forma idempotente, las categorías «Sistema» y «Políticas», los once casos del
sistema (con el texto que ya haya en `parametro` bajo su clave y, si no hay, el de respaldo) y un caso de intención por
cada fila `politica_<tema>` de `parametro` (con `contra_entrega` siempre, con su respaldo en código). Después de crear un
caso a partir de una fila de `parametro`, la semilla MUST retirar esa fila en la misma transacción, para que el texto
tenga un solo dueño. La semilla MUST NOT modificar un caso que ya exista y MUST informar solo cuántos casos insertó y cuántos ya existían, sin escribir
textos en pantalla ni en logs (R14).

Fase que lo implementa: 12

#### Scenario: Sembrar copia los textos que ya estaban editados

- Dado `mensaje_handoff` editado en `parametro` con un texto propio,
- Cuando se corre `npm run casos:sembrar`,
- Entonces el caso `mensaje_handoff` queda con ese texto y no con el de respaldo.

#### Scenario: Sembrar convierte las políticas existentes en casos de intención

- Dado las filas `politica_devoluciones`, `politica_garantia` y `politica_instalacion` en `parametro`,
- Cuando se corre `npm run casos:sembrar`,
- Entonces existen tres casos de intención en la categoría «Políticas» con esos textos, y también `contra_entrega`.

#### Scenario: Sembrar dos veces no pisa una edición

- Dado una semilla ya corrida y el caso `aviso_datos` editado en la pantalla,
- Cuando se vuelve a correr `npm run casos:sembrar`,
- Entonces el texto editado sigue igual y el informe dice que no insertó casos nuevos.

#### Scenario: Sembrar retira de parametro las filas que copió

- Dado `mensaje_handoff` y `politica_garantia` en `parametro`,
- Cuando se corre `npm run casos:sembrar`,
- Entonces ambas filas desaparecen de `parametro` en la misma transacción que crea sus casos, y si la transacción falla ninguna se retira.

#### Scenario: La semilla no escribe textos

- Dado una corrida de la semilla,
- Cuando se revisan su salida y sus logs,
- Entonces solo contienen cantidades.

### Requirement: CAS7 — Un único puerto entrega el texto de un caso del sistema, y rige al instante

`asistente` MUST exportar un puerto `TextosAsistente` con `textoDelSistema(clave)` que MUST devolver siempre un texto
(nunca lanzar): el del caso si existe y no está vacío, y si no el de respaldo del código. Los módulos `agente`,
`conversaciones`, `catalogo` y `llm` MUST pedir sus textos al cliente por ese puerto y MUST NOT leer `parametro` para
obtener un texto. El puerto MUST guardar una copia en memoria mientras la versión compartida en Redis no cambie (el
mismo mecanismo que el estilo, AGT19); toda escritura de un caso o categoría MUST subir esa versión, y un caso editado
MUST regir desde el siguiente mensaje sin reiniciar. Si Redis falla no hay copia confiable y se lee la base; si la base
falla rige el respaldo y el turno sigue.

Fase que lo implementa: 12

#### Scenario: Editar el caso de un evento cambia la respuesta del siguiente evento

- Dado el caso `mensaje_pedir_texto_audio` con un texto nuevo,
- Cuando un cliente manda un audio,
- Entonces el bot responde con el texto nuevo, sin reiniciar nada.

#### Scenario: Un caso sin fila usa el respaldo

- Dado una base sin la fila del caso `mensaje_handoff`,
- Cuando el agente pide ese texto,
- Entonces recibe el de respaldo del código y el turno continúa.

#### Scenario: Una base caída usa el respaldo y no rompe el turno

- Dado que la lectura de la base falla,
- Cuando el agente pide un texto del sistema,
- Entonces recibe el de respaldo y se registra un aviso sin contenido.

#### Scenario: Sin Redis se lee la base

- Dado que la versión compartida no responde,
- Cuando se pide un texto del sistema,
- Entonces se lee de la base y no se guarda una copia en memoria.

#### Scenario: Ningún otro módulo lee un texto desde parametro

- Dado el código de `agente`, `conversaciones`, `catalogo`, `llm` y `configuracion`,
- Cuando corre el test estático de fronteras,
- Entonces falla si alguno lee de `parametro` una clave `mensaje_*`, `aviso_*` o `politica_*`.

### Requirement: CAS8 — El agente conoce los casos de intención y los consulta con `consultar_caso`

El prompt de cada turno MUST incluir un **índice** de los casos de intención activos (título y «cuándo aplica»), acotado
a 60 casos y 6.000 caracteres; si se excede, MUST recortarse por orden de categoría y avisar en el log sin contenido. La
herramienta `consultar_caso({ titulo })` MUST reemplazar a `consultar_politica`: devuelve el texto y el modo del caso (sin
distinguir mayúsculas ni acentos), un caso inexistente o inactivo MUST devolver la lista de títulos disponibles, y el LLM
MUST NOT inventar un caso que no existe (R1, R2). En modo `literal` el texto MUST citarse palabra por palabra (regla de
cita de AGT8); en modo `guia` MUST usarse como base sin agregar datos que el caso no trae. El índice y los casos MUST
leerse con el mismo mecanismo de versión que CAS7, de modo que un caso editado rija en el siguiente turno.

Fase que lo implementa: 12

#### Scenario: El índice lista los casos de intención activos

- Dado dos casos de intención activos y uno inactivo,
- Cuando se arma el prompt del turno,
- Entonces el índice trae los dos activos con su título y su «cuándo aplica», y no el inactivo.

#### Scenario: Los casos del sistema no entran al índice

- Dado el caso `mensaje_handoff`,
- Cuando se arma el índice,
- Entonces no aparece, porque lo envía el código y no el LLM.

#### Scenario: consultar_caso devuelve el texto y el modo

- Dado el caso «Garantía» en modo `literal`,
- Cuando el LLM llama `consultar_caso` con «garantia»,
- Entonces recibe el texto guardado y el modo `literal`.

#### Scenario: Un caso inexistente lista los disponibles

- Dado un título que no existe,
- Cuando el LLM llama `consultar_caso`,
- Entonces recibe un resultado sin texto y la lista de títulos de los casos activos.

#### Scenario: Un caso en modo literal se cita sin cambiar una palabra

- Dado un caso `literal` con un plazo de «8 días»,
- Cuando la eval guionada pregunta por él,
- Entonces la respuesta contiene el texto del caso palabra por palabra.

#### Scenario: Un caso en modo guía no agrega datos

- Dado un caso `guia` sin precios ni plazos,
- Cuando la eval guionada pregunta por él,
- Entonces la respuesta no contiene valores en pesos ni plazos que el caso no traiga.

#### Scenario: Un índice demasiado grande se recorta

- Dado 70 casos de intención activos,
- Cuando se arma el índice,
- Entonces trae los primeros 60 por orden de categoría y se registra un aviso con el conteo, sin textos.

#### Scenario: Un caso editado cambia el siguiente turno

- Dado el caso «Garantía» editado en la pantalla,
- Cuando llega el siguiente turno,
- Entonces el índice y `consultar_caso` usan el texto nuevo sin reiniciar.

#### Scenario: consultar_politica ya no existe

- Dado el registro de herramientas del agente,
- Cuando se lista,
- Entonces contiene `consultar_caso` y no `consultar_politica`.

### Requirement: CAS9 — La API de admin de categorías y casos

El sistema MUST exponer, solo al rol `admin` (API7), estas operaciones, con errores `application/problem+json` (API4) y
`operationId` estables:

| Método y ruta | `operationId` | Respuesta |
|---|---|---|
| `GET /api/v1/asistente/categorias` | `listarCategoriasCaso` | `200` con las categorías en orden y su cantidad de casos |
| `POST /api/v1/asistente/categorias` | `crearCategoriaCaso` | `201`; `409 categoria-duplicada` |
| `PATCH /api/v1/asistente/categorias/{id}` | `renombrarCategoriaCaso` | `200`; `404`; `409 categoria-duplicada` |
| `PUT /api/v1/asistente/categorias/orden` | `ordenarCategoriasCaso` | `200`; `422` |
| `DELETE /api/v1/asistente/categorias/{id}` | `borrarCategoriaCaso` | `204`; `404`; `409 categoria-con-casos` |
| `GET /api/v1/asistente/casos` | `listarCasos` | `200` paginado (CAS10) |
| `POST /api/v1/asistente/casos` | `crearCaso` | `201`; `404 categoria-inexistente`; `409 caso-duplicado`; `422 caso-invalido` |
| `GET /api/v1/asistente/casos/{id}` | `obtenerCaso` | `200`; `404 caso-inexistente` |
| `PATCH /api/v1/asistente/casos/{id}` | `editarCaso` | `200`; `404`; `409 caso-modificado`, `caso-duplicado`, `caso-del-sistema`; `422` |
| `DELETE /api/v1/asistente/casos/{id}` | `borrarCaso` | `204`; `404`; `409 caso-del-sistema` |

Las rutas MUST aparecer en `openapi/openapi.json` y MUST NOT escribir el texto de un caso en los logs (R14): solo su
identificador y el usuario.

Fase que lo implementa: 12

#### Scenario: Un asesor recibe 403 en las rutas del asistente

- Dado un usuario con rol `asesor` con sesión,
- Cuando llama a cualquiera de las rutas de la tabla,
- Entonces la respuesta es `403` y no se lee ni se escribe nada.

#### Scenario: Sin sesión se responde 401

- Dado una petición sin cookie de sesión,
- Cuando llama a `GET /api/v1/asistente/casos`,
- Entonces la respuesta es `401`.

#### Scenario: Las rutas están en el contrato público

- Dado el contrato generado,
- Cuando se compara con `openapi/openapi.json`,
- Entonces las diez operaciones aparecen con su `operationId` y `npm run contrato:deriva` termina sin diferencias.

#### Scenario: Un caso inexistente responde 404

- Dado un identificador que no existe,
- Cuando un admin llama a `obtenerCaso`,
- Entonces la respuesta es `404` con el código `caso-inexistente`.

### Requirement: CAS10 — El listado de casos se busca, filtra y pagina por cursor

`listarCasos` MUST aceptar los parámetros explícitos `q` (busca en título, texto y «cuándo aplica», sin distinguir
mayúsculas ni acentos), `categoriaId`, `disparador`, `activo`, `cursor` y `limite`, y MUST paginar por cursor (API5): la
respuesta trae `items` y `siguienteCursor` (`null` en la última página). Un `q` vacío MUST listar todo. Los casos MUST
salir ordenados por el orden de su categoría y luego por título. La búsqueda MUST NOT escribir `q` en los logs (R14).

Fase que lo implementa: 12

#### Scenario: Buscar por título

- Dado los casos «Garantía» y «Devoluciones»,
- Cuando un admin busca `q=garan`,
- Entonces la respuesta trae solo «Garantía».

#### Scenario: Buscar dentro del texto y del «cuándo aplica»

- Dado un caso cuyo texto dice «ocho días» y otro cuyo «cuándo aplica» dice «medios de pago»,
- Cuando un admin busca `q=ocho` y luego `q=medios de pago`,
- Entonces cada búsqueda trae el caso que corresponde.

#### Scenario: La búsqueda ignora mayúsculas y acentos

- Dado el caso «Garantía»,
- Cuando un admin busca `q=GARANTIA`,
- Entonces la respuesta lo trae.

#### Scenario: Filtrar por categoría y por disparador

- Dado casos de sistema y de intención en varias categorías,
- Cuando un admin filtra por una categoría y por `disparador=intencion`,
- Entonces solo salen los casos de intención de esa categoría.

#### Scenario: El listado se pagina por cursor

- Dado 25 casos y `limite=10`,
- Cuando un admin pide la primera página y luego la siguiente con el `siguienteCursor`,
- Entonces recibe 10, luego 10, luego 5 casos, y la última página trae `siguienteCursor` nulo.

#### Scenario: La búsqueda no queda en los logs

- Dado una búsqueda con `q=garantia`,
- Cuando se revisan los logs de la petición,
- Entonces no contienen `garantia`.

### Requirement: CAS11 — La cotización con contra entrega adjunta el caso `contra_entrega`

Cuando una cotización de envío incluye contra entrega, `cotizar_envio` MUST adjuntar el texto del caso `contra_entrega`
(clave del sistema, de intención, leído por el puerto de CAS7) en lugar de leer `politica_contra_entrega` de
`parametro`. El texto MUST seguir sin citar el porcentaje del recargo (solo que «se suma al total») y sin fila rige el
texto de respaldo aprobado por el negocio. El caso MUST estar también en el índice (CAS8) porque es de intención.

Fase que lo implementa: 12

#### Scenario: La cotización usa el caso editado

- Dado el caso `contra_entrega` con un texto nuevo,
- Cuando el agente cotiza un envío con contra entrega,
- Entonces el resultado de `cotizar_envio` trae ese texto.

#### Scenario: Sin caso rige el respaldo aprobado

- Dado una base sin la fila de `contra_entrega`,
- Cuando el agente cotiza un envío con contra entrega,
- Entonces el resultado trae el texto de respaldo y no falla.

#### Scenario: El caso de contra entrega también se puede consultar

- Dado el caso `contra_entrega` activo,
- Cuando se arma el índice,
- Entonces aparece con su título y su «cuándo aplica».

## REMOVED Requirements (de otros dominios)

Se retiran al archivar este change; sus escenarios los cubren los requisitos de arriba.

| Requisito | Dominio | Reemplazado por |
|---|---|---|
| CAT12 — Políticas del negocio como parámetros `politica_<tema>` | `catalogo` | CAS1, CAS3, CAS6, CAS8 |
| CFN1 — Lista cerrada de mensajes fijos editables | `configuracion-negocio` | CAS4 |
| CFN2 — Editar un mensaje fijo | `configuracion-negocio` | CAS3, CAS4, CAS5 |
| CFN3 — Semilla idempotente de los mensajes fijos | `configuracion-negocio` | CAS6 |
| CLT8 — Pantalla «Mensajes fijos» | `cliente` | SHL10 |

## MODIFIED Requirements (de otros dominios)

| Requisito | Dominio | Cambio |
|---|---|---|
| AGT8 — Herramientas de consulta devuelven datos listos para citar | `agente` | `consultar_politica` pasa a `consultar_caso` (CAS8); la regla de cita palabra por palabra no cambia |
| CNV (mensaje de espera del traspaso), LLM9 (mensaje de techo), CAT11 (mensaje sin cobertura), AGT2 (aviso de datos) | `conversaciones`, `llm`, `catalogo`, `agente` | El texto viene del puerto de CAS7, no de un repositorio propio de `parametro`; su comportamiento externo no cambia |
