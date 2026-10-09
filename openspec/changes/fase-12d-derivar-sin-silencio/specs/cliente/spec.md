# Delta for Cliente

En la pantalla «Casos de uso», un caso del sistema deja de ser de «solo texto»: ahora también se editan su título y su
«cuándo aplica». La API ya lo permitía (CAS4); esta fase quita el bloqueo del cliente. Además, bajo «Cuándo aplica» de un
caso de intención aparece una ayuda con lo que sabe hacer el bot (SHL12), que solo agrega texto al campo. No hay endpoints
nuevos ni cambios en el contrato.

## ADDED Requirements

### Requirement: SHL12 — Ayuda de herramientas bajo «Cuándo aplica»

La ventana de un caso de intención («Nuevo caso» y «Editar») MUST mostrar bajo el campo «Cuándo aplica» una línea de ayuda
que diga que las fichas son sugerencias para redactar y que el bot decide cuándo usar cada capacidad, y una ficha por cada capacidad del bot, con su nombre en palabras simples: buscar productos, ver la ficha, cotizar el envío,
enviar fotos, guardar los datos del cliente, marcar un lead y avisar a un asesor. Tocar una ficha MUST agregar su frase al
final del texto del campo (por ejemplo «cuando haya que cotizar el envío»), separada del texto anterior, sin borrar lo
escrito. El contador de caracteres del campo MUST contar la frase agregada. La ventana de un caso del sistema MUST NOT mostrar
la ayuda. La ayuda MUST NOT agregar campos a la petición: `crearCaso` y `editarCaso` envían el «cuándo aplica» como el mismo
texto plano de siempre. Es solo una ayuda de redacción: no cambia el contrato, el esquema ni lo que recibe el modelo.

Fase que lo implementa: 12d

#### Scenario: Las fichas aparecen en un caso de intención

- Dado la ventana de «Nuevo caso»,
- Cuando el admin la abre,
- Entonces bajo «Cuándo aplica» ve la línea de ayuda, que dice que son sugerencias y que el bot decide, y las siete fichas: buscar productos, ver la ficha, cotizar el envío,
  enviar fotos, guardar los datos del cliente, marcar un lead y avisar a un asesor.

#### Scenario: Tocar una ficha agrega su frase al texto

- Dado la ventana de edición de un caso de intención con «Cuándo aplica» igual a «el cliente pregunta por envíos»,
- Cuando el admin toca la ficha «cotizar el envío»,
- Entonces el campo conserva «el cliente pregunta por envíos» y le agrega al final «cuando haya que cotizar el envío».

#### Scenario: El contador cuenta la frase agregada

- Dado un «Cuándo aplica» vacío en la ventana de un caso de intención,
- Cuando el admin toca una ficha,
- Entonces el contador muestra la longitud de la frase agregada sobre el máximo del campo.

#### Scenario: Un caso del sistema no muestra la ayuda

- Dado la ventana de edición del caso del sistema «Audio recibido»,
- Cuando el admin la abre,
- Entonces bajo «Cuándo aplica» no aparecen la línea de ayuda ni las fichas.

#### Scenario: La petición lleva solo el texto

- Dado un caso de intención en el que el admin tocó la ficha «avisar a un asesor»,
- Cuando guarda,
- Entonces el cliente llama a `editarCaso` con el «cuándo aplica» como texto plano que incluye la frase, y la petición no
  lleva ningún campo adicional.

## MODIFIED Requirements

### Requirement: SHL10 — La pantalla «Casos de uso» reemplaza a «Mensajes fijos»

El área `asistente` MUST tener la pantalla «Casos de uso» (el área `bot` y «Mensajes fijos» desaparecen). MUST listar los
casos agrupados por categoría con un contador, con un buscador (retardo de 300 ms) que llama a `listarCasos` con `q` y con
filtros por categoría y por tipo. «Nuevo caso» y «Editar» MUST abrir la ventana de SHL8 con categoría, título, «cuándo
aplica», texto, modo y activo. Los casos del sistema MUST mostrar la etiqueta «Sistema», una descripción de cuándo se
envían y MUST NOT ofrecer «Borrar» ni «Desactivar»; su ventana de edición MUST permitir cambiar el texto, la categoría, el
título y el «cuándo aplica», y MUST NOT ofrecer el modo ni el estado activo. MUST permitir crear, renombrar, reordenar y borrar categorías; una
categoría con casos MUST mostrar el motivo del servidor y no borrarse. Un caso inactivo MUST verse atenuado con su
etiqueta. Con una lista vacía MUST mostrar un estado vacío con la acción de crear.

(Previously: la ventana de un caso del sistema dejaba editables solo el texto y la categoría; el título y el «cuándo aplica»
estaban bloqueados aunque la API los aceptaba.)

Fase que lo implementa: 12; 12d (título y «cuándo aplica» editables en los casos del sistema)

#### Scenario: Los casos se agrupan por categoría

- Dado casos en las categorías «Sistema» y «Políticas»,
- Cuando un admin abre «Casos de uso»,
- Entonces ve cada categoría con su contador y sus casos.

#### Scenario: El buscador llama al servidor con retardo

- Dado la pantalla abierta,
- Cuando el admin escribe «garan»,
- Entonces tras 300 ms el cliente llama a `listarCasos` con `q=garan` y muestra solo lo que responde.

#### Scenario: Crear un caso desde la ventana

- Dado la ventana de «Nuevo caso» con categoría, título, «cuándo aplica» y texto,
- Cuando el admin guarda,
- Entonces el cliente llama a `crearCaso`, cierra la ventana y el caso aparece en su categoría.

#### Scenario: Un caso del sistema no se puede borrar ni desactivar

- Dado el caso `mensaje_error_llm`,
- Cuando el admin lo ve,
- Entonces tiene la etiqueta «Sistema», su descripción, y no hay botones para borrarlo ni desactivarlo.

#### Scenario: El título de un caso del sistema se edita desde la ventana

- Dado la ventana de edición del caso del sistema «Audio recibido»,
- Cuando el admin cambia el título a «Audios» y guarda,
- Entonces el cliente llama a `editarCaso` con el título nuevo y la lista muestra «Audios».

#### Scenario: El «cuándo aplica» de un caso del sistema se edita desde la ventana

- Dado la ventana de edición del caso del sistema «Espera del asesor»,
- Cuando el admin cambia el «cuándo aplica» y guarda,
- Entonces el cliente llama a `editarCaso` con ese «cuándo aplica».

#### Scenario: El modo y el estado de un caso del sistema no se ofrecen

- Dado la ventana de edición de un caso del sistema,
- Cuando el admin la abre,
- Entonces no aparecen los controles de modo ni de activo, y la petición de `editarCaso` no los envía.

#### Scenario: Un título duplicado muestra el motivo del servidor

- Dado la ventana de un caso del sistema y un `409 caso-duplicado` del servidor,
- Cuando el admin guarda un título que ya existe,
- Entonces la ventana muestra el motivo y no se cierra.

#### Scenario: Los casos convertidos se pueden borrar y desactivar

- Dado el caso de intención «Contra entrega», que antes tenía clave del sistema,
- Cuando el admin lo ve,
- Entonces no tiene la etiqueta «Sistema» y sí ofrece «Borrar» y «Desactivar».

#### Scenario: Una categoría con casos no se borra

- Dado una categoría con casos y un `409 categoria-con-casos` del servidor,
- Cuando el admin intenta borrarla,
- Entonces la pantalla muestra el motivo y la categoría sigue.

#### Scenario: Gestionar categorías

- Dado la pantalla «Casos de uso»,
- Cuando el admin crea, renombra y reordena una categoría,
- Entonces el cliente llama a `crearCategoriaCaso`, `renombrarCategoriaCaso` y `ordenarCategoriasCaso` y refleja el resultado.

#### Scenario: Un caso inactivo se ve atenuado

- Dado un caso de intención inactivo,
- Cuando el admin abre la pantalla,
- Entonces el caso se ve atenuado con la etiqueta «Inactivo».

#### Scenario: Sin casos se muestra un estado vacío

- Dado un listado vacío,
- Cuando el admin abre la pantalla,
- Entonces ve un mensaje de que no hay casos y el botón «Nuevo caso».
