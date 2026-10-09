# Asistente — Specification

## Purpose

Todo lo que el bot le dice al cliente es un **caso**: una categoría, un título único, un «cuándo aplica», un texto y un modo
(literal o guía). Los casos del sistema son una lista cerrada que el código dispara solo (audio, imagen, falla del modelo, techo de
gasto y espera del asesor); los de intención (también «Tratamiento de datos», el único que se siembra) los crea y edita un admin y el agente los consulta con
`consultar_caso`. Este dominio es dueño de la lista de casos, de su validación (sin pesos, SKU ni plantillas), de la semilla,
de la API de administración y del puerto único con el que los demás módulos piden un texto. La regla que ordena el dominio:
si el cliente lo lee, es un caso; si el código lo usa para calcular o decidir, es un parámetro del negocio
(`configuracion-negocio`); cómo habla el bot es el estilo (`agente`, AGT18-AGT23 y EST-D1-EST-D5). Decisión: ADR-0024.

## Requirements

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

Los casos que el **código** dispara solo, porque el LLM no puede o no debe hablar, MUST ser una lista cerrada en
`asistente/dominio/sistema.ts`, cada uno con su clave, su descripción de cuándo se envía y su texto de respaldo. La lista MUST
contener exactamente cinco casos: `mensaje_pedir_texto_audio` («Audio recibido»), `mensaje_imagen_no_procesada` («Imagen sin
texto»), `mensaje_error_llm` («Falla técnica del modelo»), `mensaje_techo_gasto` («Techo de gasto alcanzado») y
`mensaje_espera_handoff` («Espera del asesor»: lo que el cliente lee mientras la conversación espera a un asesor tras una falla
técnica, el techo de gasto o el tope de turnos). Un caso con clave del sistema MUST poder editarse (texto, categoría, título y
«cuándo aplica») y MUST NOT borrarse ni desactivarse. El título MUST seguir siendo único (CAS1) aunque se edite: el código
encuentra el caso por su clave, nunca por su título. La API MUST NOT permitir crear un caso con una clave del sistema ni cambiar
la clave de uno existente: una situación nueva necesita código que la detecte. Siempre MUST existir un texto para cada clave: el
guardado, o el de respaldo si falta.

(Previously: la lista tenía once casos —los diez mensajes fijos más `contra_entrega`—, incluidos el aviso de datos, los dos
traspasos, la captura completa, la falta de cobertura y la contra entrega.)

Fase que lo implementa: 12; 12d (de once a cinco casos)

#### Scenario: Los casos del sistema existen después de sembrar

- Dado una base recién migrada,
- Cuando se corre `npm run casos:sembrar`,
- Entonces existen cinco casos con clave del sistema, cada uno con el texto de respaldo de su clave.

#### Scenario: Un caso del sistema se edita

- Dado el caso `mensaje_error_llm`,
- Cuando un admin cambia su texto,
- Entonces la respuesta es `200` y el caso conserva su clave del sistema.

#### Scenario: El título de un caso del sistema se edita

- Dado el caso `mensaje_pedir_texto_audio` titulado «Audio recibido»,
- Cuando un admin lo renombra a «Audios»,
- Entonces la respuesta es `200`, el título nuevo queda guardado y el bot sigue usando ese caso al recibir un audio.

#### Scenario: El título editado no puede repetir el de otro caso

- Dado el caso «Tratamiento de datos» y el caso del sistema «Audio recibido»,
- Cuando un admin intenta renombrar el de audio a «tratamiento de datos»,
- Entonces la respuesta es `409` con el código `caso-duplicado` y el título no cambia.

#### Scenario: Un caso del sistema no se borra

- Dado el caso `mensaje_error_llm`,
- Cuando un admin intenta borrarlo,
- Entonces la respuesta es `409` con el código `caso-del-sistema` y el caso sigue existiendo.

#### Scenario: Un caso del sistema no se desactiva

- Dado el caso `mensaje_espera_handoff`,
- Cuando un admin intenta desactivarlo,
- Entonces la respuesta es `409` con el código `caso-del-sistema` y sigue activo.

#### Scenario: La API no crea casos con clave del sistema

- Dado una petición para crear un caso que trae una clave del sistema,
- Cuando un admin la envía,
- Entonces la respuesta es `422` y no se crea nada.

#### Scenario: Las claves retiradas ya no son claves del sistema

- Dado una petición para crear un caso con la clave `mensaje_handoff`,
- Cuando un admin la envía,
- Entonces la respuesta es `422`, porque esa clave ya no existe en la lista cerrada.

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

`npm run casos:sembrar` MUST crear, de forma idempotente, las categorías «Sistema» y «Políticas», los cinco casos del
sistema (con el texto que ya haya en `parametro` bajo su clave y, si no hay, el de respaldo), el caso de uso inicial
«Tratamiento de datos» de CAS13 y un caso de intención por cada fila `politica_<tema>` de `parametro`. MUST NOT crear ningún otro
caso de negocio (contra entrega, cobertura, captura, fotos, envío, ubicación, saludo): esos los crea el dueño. El caso inicial
MUST crearse solo si no existe ya un caso con ese título (sin distinguir mayúsculas ni acentos). Después de crear un
caso a partir de una fila de `parametro`, la semilla MUST retirar esa fila en la misma transacción, para que el texto
tenga un solo dueño. La semilla MUST NOT modificar un caso que ya exista y MUST informar solo cuántos casos insertó y cuántos ya existían, sin escribir
textos en pantalla ni en logs (R14). El mismo comando siembra el estilo inicial del bot cuando `version_estilo` está
vacía (`agente`, EST-D6).

(Previously: sembraba once casos del sistema y `contra_entrega` siempre, con su respaldo en código.)

Fase que lo implementa: 12; 12d (cinco casos del sistema y un solo caso de uso inicial)

#### Scenario: Sembrar copia los textos que ya estaban editados

- Dado `mensaje_error_llm` editado en `parametro` con un texto propio,
- Cuando se corre `npm run casos:sembrar`,
- Entonces el caso `mensaje_error_llm` queda con ese texto y no con el de respaldo.

#### Scenario: Sembrar convierte las políticas existentes en casos de intención

- Dado las filas `politica_devoluciones`, `politica_garantia` y `politica_instalacion` en `parametro`,
- Cuando se corre `npm run casos:sembrar`,
- Entonces existen tres casos de intención en la categoría «Políticas» con esos textos, además de «Tratamiento de datos».

#### Scenario: Sembrar no crea casos de negocio en una base nueva

- Dado una base recién migrada sin ningún caso,
- Cuando se corre `npm run casos:sembrar`,
- Entonces el único caso de intención es «Tratamiento de datos», sin clave del sistema, y no existen «Contra entrega», «Sin cobertura de envío» ni «Datos completos fuera de horario».

#### Scenario: Un caso inicial ya existente no se duplica

- Dado un caso «tratamiento de datos» ya creado por un admin con otro texto,
- Cuando se corre `npm run casos:sembrar`,
- Entonces no se crea un segundo caso con ese título y el texto del admin sigue igual.

#### Scenario: Sembrar dos veces no pisa una edición

- Dado una semilla ya corrida y el caso `mensaje_espera_handoff` editado en la pantalla,
- Cuando se vuelve a correr `npm run casos:sembrar`,
- Entonces el texto editado sigue igual y el informe dice que no insertó casos nuevos.

#### Scenario: Sembrar retira de parametro las filas que copió

- Dado `mensaje_error_llm` y `politica_garantia` en `parametro`,
- Cuando se corre `npm run casos:sembrar`,
- Entonces ambas filas desaparecen de `parametro` en la misma transacción que crea sus casos, y si la transacción falla ninguna se retira.

#### Scenario: La semilla no escribe textos

- Dado una corrida de la semilla,
- Cuando se revisan su salida y sus logs,
- Entonces solo contienen cantidades.

### Requirement: CAS7 — Un único puerto entrega el texto de un caso del sistema, y rige al instante

`asistente` MUST exportar un puerto `TextosAsistente` con `textoDelSistema(clave)` que MUST devolver siempre un texto
(nunca lanzar): el del caso si existe y no está vacío, y si no el de respaldo del código. La clave MUST ser una de las cinco de
CAS4. Los módulos `agente`, `conversaciones` y `llm` MUST pedir sus textos al cliente por ese puerto y MUST NOT leer
`parametro` para obtener un texto. El puerto MUST guardar una copia en memoria mientras la versión compartida en Redis no
cambie (el mismo mecanismo que el estilo, AGT19); toda escritura de un caso o categoría MUST subir esa versión, y un caso
editado MUST regir desde el siguiente mensaje sin reiniciar. Si Redis falla no hay copia confiable y se lee la base; si la base
falla rige el respaldo y el turno sigue.

(Previously: también atendía a `catalogo`, que pedía `mensaje_fuera_cobertura` y `contra_entrega` por este puerto; ahora esos
textos los consulta el LLM como casos de uso.)

Fase que lo implementa: 12; 12d (cinco claves y sin consumo desde `catalogo`)

#### Scenario: Editar el caso de un evento cambia la respuesta del siguiente evento

- Dado el caso `mensaje_pedir_texto_audio` con un texto nuevo,
- Cuando un cliente manda un audio,
- Entonces el bot responde con el texto nuevo, sin reiniciar nada.

#### Scenario: Un caso sin fila usa el respaldo

- Dado una base sin la fila del caso `mensaje_espera_handoff`,
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

#### Scenario: Catálogo no pide ningún texto al puerto

- Dado el código de `catalogo`,
- Cuando corre el test estático de fronteras,
- Entonces falla si importa `TEXTOS_ASISTENTE` o cualquier clave del sistema.

### Requirement: CAS8 — El agente conoce los casos de intención y los consulta con `consultar_caso`

El prompt de cada turno MUST incluir un **índice** de los casos de intención activos (título y «cuándo aplica»), acotado
a 60 casos y 6.000 caracteres; si se excede, MUST recortarse por orden de categoría y avisar en el log sin contenido. Los
casos que la migración convierte (CAS14) y el caso inicial «Tratamiento de datos» (CAS13) entran al índice como cualquier otro
caso de intención. La
herramienta `consultar_caso({ titulo })` MUST reemplazar a `consultar_politica`: devuelve el texto y el modo del caso (sin
distinguir mayúsculas ni acentos), un caso inexistente o inactivo MUST devolver la lista de títulos disponibles, y el LLM
MUST NOT inventar un caso que no existe (R1, R2). En modo `literal` el texto MUST citarse palabra por palabra (regla de
cita de AGT8); en modo `guia` MUST usarse como base sin agregar datos que el caso no trae. El índice y los casos MUST
leerse con el mismo mecanismo de versión que CAS7, de modo que un caso editado rija en el siguiente turno.

(Previously: el índice excluía a `contra_entrega` solo por ser de intención con clave; ahora ningún caso de intención tiene clave.)

Fase que lo implementa: 12; 12d (los casos convertidos entran al índice)

#### Scenario: El índice lista los casos de intención activos

- Dado dos casos de intención activos y uno inactivo,
- Cuando se arma el prompt del turno,
- Entonces el índice trae los dos activos con su título y su «cuándo aplica», y no el inactivo.

#### Scenario: Los casos del sistema no entran al índice

- Dado el caso `mensaje_error_llm`,
- Cuando se arma el índice,
- Entonces no aparece, porque lo envía el código y no el LLM.

#### Scenario: Los casos convertidos aparecen en el índice

- Dado una base de la Fase 12 migrada con CAS14,
- Cuando se arma el índice,
- Entonces trae «Tratamiento de datos», «Contra entrega», «Sin cobertura de envío» y «Datos completos fuera de horario» con su «cuándo aplica».

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

### Requirement: CAS12 — Los textos de contra entrega y de sin cobertura los consulta el LLM, no los adjunta `cotizar_envio`

`cotizar_envio` MUST devolver solo datos: con cobertura, `rango_texto`, `dias_texto` y `contraentrega_disponible`; sin
cobertura, `cobertura: false` y el efecto `sin-cobertura` sin mensaje (AGT8, CAT10, CAT11). Ninguna parte fija del prompt MUST
ordenar consultar un caso de contra entrega o de cobertura ni nombrar su título (AGT13): si el dueño tiene un caso para eso, el
modelo lo elige del índice (CAS8) por su «cuándo aplica». Si no existe o está inactivo, el modelo MUST informar con sus palabras
la falta de cobertura o la condición disponible sin inventar la política (reglas 1 y 4 de `seguridad.v1.md`). El sistema MUST
NOT reemplazar el texto del modelo por el del caso después de generarlo (se retira `asegurarMensajeLiteral`).

Fase que lo implementa: 12d

#### Scenario: Con contra entrega el modelo consulta el caso

- Dado una cotización con `contraentrega_disponible: true` y un caso «Contra entrega» creado en la preparación de la eval guionada,
- Cuando el cliente pregunta cómo se paga,
- Entonces el modelo llama `consultar_caso` para ese caso y cita su texto palabra por palabra.

#### Scenario: El caso editado rige en la siguiente cotización

- Dado el caso «Contra entrega» con un texto nuevo,
- Cuando el modelo lo consulta en el turno siguiente,
- Entonces recibe el texto nuevo.

#### Scenario: Sin cobertura el modelo consulta el caso

- Dado una cotización con `cobertura: false` y un caso «Sin cobertura de envío» creado en la preparación de la eval guionada,
- Cuando el modelo responde,
- Entonces consulta ese caso, cita su texto y ofrece otra dirección de entrega.

#### Scenario: Sin el caso el modelo no inventa la política

- Dado una base sin caso de contra entrega y una cotización con `contraentrega_disponible: true`,
- Cuando el cliente pregunta cómo se paga,
- Entonces `consultar_caso` devuelve la lista de casos disponibles y el modelo no afirma condiciones de la contra entrega que ningún caso trae.

#### Scenario: Sin el caso de cobertura el modelo informa sin inventar condiciones

- Dado una base sin caso de cobertura y una cotización con `cobertura: false`,
- Cuando el modelo responde,
- Entonces informa que no hay cobertura a ese destino y no afirma plazos, alternativas ni contactos que ninguna herramienta trae.

#### Scenario: Nada reemplaza el texto del modelo

- Dado una cotización sin cobertura en un turno,
- Cuando `ContenidoLlm` arma los pasos,
- Entonces el primer paso de texto es exactamente el texto final del modelo.

### Requirement: CAS13 — «Tratamiento de datos» es el único caso de uso que se siembra

La semilla MUST crear un solo caso de intención inicial: «Tratamiento de datos», sin clave del sistema, en modo `guia`, en la
categoría «Políticas», editable y borrable. Su «cuándo aplica» MUST decir la señal que lo activa (el bot va a tomar datos de
despacho o a registrar el interés de compra y el contacto no aceptó el tratamiento de datos). Su texto de respaldo en
`asistente/dominio` MUST presentar al bot como un asistente automatizado (P71), MUST terminar pidiendo la aceptación y MUST
cumplir CAS5 (sin pesos, SKU ni marcadores); en las bases migradas el caso conserva el texto de `aviso_datos` (CAS14). El código
MUST NOT sembrar ningún otro caso de negocio: «Contra entrega», «Sin cobertura de envío» y «Datos completos fuera de horario»
existen solo donde la migración los convirtió (CAS14) o donde el dueño los crea; la guía de operación lista casos de ejemplo
(Fotos, Costo del envío, Ubicación compartida, Saludo, Captura fuera de horario, Contra entrega, Sin cobertura) que el dueño puede
crear, sin cargarlos solos. Borrar «Tratamiento de datos» MUST NOT desactivar la puerta de consentimiento (AGT26).

Fase que lo implementa: 12d

#### Scenario: Una base nueva tiene un solo caso de uso inicial

- Dado una base recién migrada sin ningún caso,
- Cuando se corre `npm run casos:sembrar`,
- Entonces existen los cinco casos del sistema y un solo caso de intención, «Tratamiento de datos», sin clave del sistema.

#### Scenario: «Tratamiento de datos» es editable y borrable

- Dado una base sembrada,
- Cuando un admin lista los casos,
- Entonces «Tratamiento de datos» aparece sin clave del sistema, con «Borrar» y «Desactivar» disponibles.

#### Scenario: El texto inicial cumple la validación de casos

- Dado el texto de respaldo de «Tratamiento de datos»,
- Cuando se valida con las reglas de CAS5,
- Entonces pasa.

#### Scenario: El texto inicial se presenta como asistente y pide la aceptación

- Dado el texto inicial de «Tratamiento de datos» en una base nueva,
- Cuando se lee,
- Entonces dice que quien atiende es un asistente automatizado y termina con una pregunta que pide aceptar el tratamiento de datos.

#### Scenario: Borrar el caso no abre la puerta de los datos

- Dado que un admin borró «Tratamiento de datos» y un contacto sin respuesta de consentimiento,
- Cuando el modelo llama `guardar_datos_contacto`,
- Entonces no se guarda nada y el modelo recibe `{ requiereConsentimiento: true }`.

### Requirement: CAS14 — Una migración de datos convierte los casos del sistema que se retiran

Una migración de datos MUST aplicarse una sola vez y de forma idempotente sobre `caso_asistente`: (1) los casos con clave
`mensaje_fuera_cobertura`, `mensaje_captura_completa` y `contra_entrega` pierden su clave del sistema, pasan a disparador
`intencion` y se mueven a la categoría «Políticas» si existe, conservando título, texto, «cuándo aplica» y fecha de creación;
(2) el caso con clave `aviso_datos` pasa a ser el caso «Tratamiento de datos» (nuevo título, «cuándo aplica» de CAS13, modo
`guia`), conservando su texto, salvo que ya exista un caso con ese título, en cuyo caso se borra; (3) los casos con clave
`mensaje_handoff` y `mensaje_handoff_fuera_horario` se borran. El cambio de clave y de disparador MUST ocurrir en la misma
sentencia, para respetar la restricción de la Fase 12 que exige clave del sistema a todo caso de disparador `evento`. La
migración MUST NOT dejar a ningún caso activo con dos títulos iguales y MUST dejar los campos de búsqueda coherentes con el
nuevo título.

Fase que lo implementa: 12d

#### Scenario: Los tres casos conservados dejan de ser del sistema y conservan su texto

- Dado una base con los tres casos con clave y sus textos editados,
- Cuando corre la migración,
- Entonces los tres quedan sin clave, de intención, con el mismo texto y título, y se pueden borrar.

#### Scenario: La conversión respeta la restricción de disparador y clave

- Dado el caso `mensaje_captura_completa` con disparador `evento`,
- Cuando corre la migración contra Postgres real,
- Entonces la migración termina sin violar la restricción y el caso queda con disparador `intencion` y sin clave.

#### Scenario: «Aviso de datos» pasa a «Tratamiento de datos» con su texto

- Dado el caso `aviso_datos` con un texto editado por el dueño,
- Cuando corre la migración,
- Entonces existe el caso «Tratamiento de datos», sin clave, en modo `guia`, con ese texto, y buscarlo por «tratamiento» lo encuentra.

#### Scenario: Un título ocupado no rompe la migración

- Dado un caso «Tratamiento de datos» ya creado por un admin y el caso `aviso_datos`,
- Cuando corre la migración,
- Entonces la migración termina, el caso del admin queda intacto y el caso `aviso_datos` se borra.

#### Scenario: Los casos de traspaso se borran

- Dado los casos `mensaje_handoff` y `mensaje_handoff_fuera_horario`,
- Cuando corre la migración,
- Entonces ya no existen filas con esas claves.

#### Scenario: Correr la migración dos veces no cambia nada

- Dado una base ya migrada,
- Cuando se aplica el mismo cambio otra vez,
- Entonces ninguna fila cambia.

#### Scenario: Los casos convertidos se mueven a «Políticas»

- Dado las categorías «Sistema» y «Políticas»,
- Cuando corre la migración,
- Entonces los casos convertidos quedan en «Políticas» y «Sistema» conserva solo los casos con clave.

#### Scenario: Sin la categoría «Políticas» los casos conservan la suya

- Dado una base sin la categoría «Políticas»,
- Cuando corre la migración,
- Entonces los casos convertidos conservan su categoría actual y la migración termina.
