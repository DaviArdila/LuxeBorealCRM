# Casos de uso del asistente

**Resumen.** Todo lo que el bot le dice al cliente es un **caso de uso**: un texto con un título, una categoría y una
regla de cuándo se usa. Los casos de intención los consulta el LLM cuando el cliente pregunta algo («Garantía», «Medios
de pago»); los casos del sistema los envía el código solo («Traspaso a un asesor», «Audio recibido»). Se editan sin
desplegar y rigen desde el siguiente mensaje. Decisión de fondo: [ADR-0024](../adr/0024-casos-del-asistente.md).

> Los comandos `npm run …` de esta guía se corren dentro de `servicio/` (o desde la raíz con
> `npm --prefix servicio run …`), y el `.env` es `servicio/.env` ([ADR-0023](../adr/0023-estructura-servicio-y-cliente.md)).

## Qué es cada cosa

| Pieza | Qué es | Quién la escribe |
|---|---|---|
| **Caso de intención** | Un texto que el LLM puede consultar con `consultar_caso` cuando coincide con su «cuándo aplica» | Tú, desde «Casos de uso» o la API |
| **Caso del sistema** | Un texto que el código envía en una situación fija (audio, imagen, traspaso, error, techo de gasto…). `contra_entrega` es del sistema **y** de intención | Tú lo editas; la lista es cerrada y no se crean ni se borran |
| **Categoría** | Agrupa casos para encontrarlos; tiene nombre y orden | Tú |
| **Modo** | `literal`: el bot cita el texto palabra por palabra. `guia`: es base para redactar, sin agregar datos que el caso no trae | Tú (los del sistema son siempre `literal`) |

El estilo del bot (tono y formato) **no** es un caso: va en [«Estilo del bot»](estilo-del-bot.md).

## Cargar los casos de hoy (una vez)

`npm run casos:sembrar` crea las categorías «Sistema» y «Políticas», los once casos del sistema (con el texto que ya
hubiera en `parametro` o, si no, el de respaldo), el caso de uso «Tratamiento de datos» y un caso de intención por cada política `politica_<tema>` que hubiera.
Es idempotente: nunca pisa un caso ya creado ni editado. Informa solo cuántos casos insertó y cuántos ya existían.

«Tratamiento de datos» es el único caso de uso que se siembra solo: es donde el bot se presenta como asistente automatizado,
explica cómo usa los datos y pide que el cliente acepte, antes de guardar su nombre o su dirección. Lo puedes reescribir o
borrar: borrarlo **no** abre la puerta, porque sin la aceptación del cliente el sistema no guarda ningún dato. Si lo borras, el
bot deja de pedir la aceptación con tu texto y no podrá tomar pedidos. Si `parametro` todavía guarda un `aviso_datos`, el caso
nace con ese texto.

Para una base de desarrollo, `npm run casos:sembrar -- --archivo datos-desarrollo/asistente/casos.json` suma además los casos
de ese archivo (`{ "casos": [{ "categoria", "titulo", "cuandoAplica", "texto", "modo" }] }`). Se valida entero con las reglas
de un caso: si uno falla no se siembra nada y el mensaje dice cuál (por posición, sin copiar su texto).

`parametros.csv` del importador del catálogo ya no acepta filas de texto (`mensaje_*`, `aviso_*`, `politica_*`,
`prompt_estilo*`): el importador termina con error nombrando la fila y no escribe nada.

## Reglas de un caso

| Regla | Detalle |
|---|---|
| Título | 1 a 80 caracteres; único sin distinguir mayúsculas ni acentos (es con lo que el bot lo pide) |
| «Cuándo aplica» | Obligatorio; hasta 200 caracteres en un caso de intención |
| Texto | 1 a 1.200 caracteres; sin valores en pesos, sin SKU y sin marcadores `{{…}}` |
| Del sistema | Se edita, pero no se borra, no se desactiva y su clave no cambia; solo modo `literal` |
| Inactivo | Sigue existiendo, pero no llega al bot ni a su índice |

Un texto que incumple una regla se rechaza con el motivo y **sin copiar el texto**.

## La API (solo el rol `admin`)

El contrato completo está en `openapi/openapi.json` y la documentación interactiva en `/docs`.

| Operación | Método y ruta | Respuestas |
|---|---|---|
| `listarCategoriasCaso` | `GET /api/v1/asistente/categorias` | `200` con las categorías en orden y su cantidad de casos |
| `crearCategoriaCaso` | `POST /api/v1/asistente/categorias` | `201`; `409 categoria-duplicada`; `422 categoria-invalida` |
| `renombrarCategoriaCaso` | `PATCH /api/v1/asistente/categorias/{id}` | `200`; `404`; `409 categoria-duplicada` |
| `ordenarCategoriasCaso` | `PUT /api/v1/asistente/categorias/orden` | `200`; `422 orden-categorias-invalido` (la lista debe traer todas las categorías) |
| `borrarCategoriaCaso` | `DELETE /api/v1/asistente/categorias/{id}` | `204`; `404`; `409 categoria-con-casos` |
| `listarCasos` | `GET /api/v1/asistente/casos` | `200` paginado |
| `crearCaso` | `POST /api/v1/asistente/casos` | `201`; `404 categoria-inexistente`; `409 caso-duplicado`; `422 caso-invalido` |
| `obtenerCaso` | `GET /api/v1/asistente/casos/{id}` | `200`; `404 caso-inexistente` |
| `editarCaso` | `PATCH /api/v1/asistente/casos/{id}` | `200`; `404`; `409 caso-modificado`, `caso-duplicado`, `caso-del-sistema`; `422` |
| `borrarCaso` | `DELETE /api/v1/asistente/casos/{id}` | `204`; `404`; `409 caso-del-sistema` |

- **Editar exige la fecha que leíste.** `editarCaso` recibe `actualizado` (la del caso tal como lo leíste). Si otro admin lo
  cambió mientras tanto, responde `409 caso-modificado` y no pisa su cambio: vuelve a leer el caso y reintenta.
- **Buscar.** `listarCasos` acepta `q` (busca en título, texto y «cuándo aplica», sin distinguir mayúsculas ni acentos;
  `q` vacío lista todo), `categoriaId`, `disparador` (`evento` o `intencion`), `activo`, `cursor` y `limite` (1 a 100; 20 por
  defecto). Los casos salen por el orden de su categoría y luego por título.
- **Paginar.** La respuesta trae `items` y `siguienteCursor`; pásalo tal cual como `cursor` para pedir la siguiente página.
  El cursor es opaco (no lo interpretes) y la última página trae `siguienteCursor` nulo. Un cursor ilegible responde
  `400 cursor-invalido`.
- **Privacidad.** Los logs de una escritura llevan el identificador del caso y el del usuario, nunca el texto; lo que se busca
  con `q` tampoco se escribe.

## La pantalla «Casos de uso»

En el back office (`Asistente › Casos de uso`, solo `admin`) los casos se ven agrupados por categoría, cada una con su
contador. El buscador espera 300 ms tras la última tecla y consulta al servidor; los filtros de categoría y tipo también.
«Nuevo caso» y «Editar» abren una ventana con categoría, título, «cuándo aplica», texto, modo y activo; el motivo de un
rechazo aparece dentro de la ventana y lo escrito se conserva. Un caso del sistema lleva la etiqueta «Sistema», muestra
cuándo se envía y solo permite editar el texto y la categoría: no tiene «Borrar» ni «Activo». Un caso inactivo se ve
atenuado con la etiqueta «Inactivo». Abajo, «Categorías» permite crear, renombrar, subir, bajar y borrar (una con casos no
se borra: la pantalla dice por qué).

## Cuándo se nota un cambio

Al instante: cada escritura sube una versión compartida en Redis y cada mensaje del bot la compara con la de su copia en
memoria. Si Redis falla en ese momento, el caso queda guardado igual y los demás procesos lo toman en 5 minutos como máximo.

## Si algo no funciona

| Síntoma | Qué mirar |
|---|---|
| `409 caso-modificado` al guardar | Otro admin lo editó; vuelve a leer el caso (`obtenerCaso`) y aplica tu cambio sobre el actual |
| `422 caso-invalido` | El motivo dice la regla rota (pesos, SKU, plantilla, vacío, largo o modo guía en un caso del sistema) |
| `409 categoria-con-casos` | Mueve o borra los casos de la categoría primero |
| El bot no usa un caso nuevo | Revisa que esté activo, que sea de intención y que su «cuándo aplica» describa la pregunta del cliente |
| El bot sigue con el texto anterior | Espera hasta 5 minutos y revisa que Redis esté arriba |
