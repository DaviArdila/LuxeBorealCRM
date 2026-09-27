# Catálogo Specification

## Purpose

El dominio `catalogo` ya existe (Fase 02, `openspec/specs/catalogo/spec.md`, requisitos CAT1-CAT11:
lectura de productos, ficha, caché de catálogo compacto y cotización de envío). Esta fase le agrega el
lado de **escritura**: el importador que llena las tablas que CAT1-CAT11 leen (`producto`, `foto`,
`tarifa_estimada`, `zona_sin_cobertura`, `parametro`, `excepcion_horario`) desde una hoja de Google
Sheets o un directorio local de CSVs (`--dir <fixtures>`, modo del criterio de salida de esta fase),
todo-o-nada, y reutiliza la invalidación de `CACHE_CATALOGO` ya construida en Fase 02 (CAT5). Ningún
requisito CAT existente se modifica; todo lo de abajo se escribe como `## ADDED Requirements` porque no
había comportamiento de importación previo, aunque el archivo destino (`openspec/specs/catalogo/spec.md`)
ya tenga contenido — `sdd-archive` anexa estos requisitos `IMP#` al final del `spec.md` ya fusionado, sin
tocar CAT1-CAT11.

Decisiones ya tomadas por el usuario que esta spec refleja (proposal.md, tabla "Decisiones ya tomadas" y
"Preguntas abiertas"): Q1 (sin match de departamento/ciudad a DANE → fila inválida, todo-o-nada), Q2
(pestaña nueva `cobertura` para `zona_sin_cobertura`, columnas `departamento`/`ciudad`/`motivo`), Q3
(`parametro.valor` se serializa a `jsonb` con un parser propio por clave conocida; clave desconocida es
advertencia, se guarda tal cual). R15 aplica en todo el dominio de parámetros: los valores de negocio
(`recargo_contraentrega_pct`, `factor_volumetrico`, mensajes, horario) son datos editables por la hoja,
nunca constantes en código.

Fuera de esta spec (ver proposal, Out of Scope): notificación del resultado de la importación (Telegram,
Fase 08), generación de fotos placeholder sintéticas (Q4), poblar `categoria_producto` desde la hoja, y
el despliegue de producción del backend de almacenamiento (Fase 09, ver ADR-0012 y la spec `medios`).

## Nota de implementación

El título exacto de cada escenario **es** el criterio de aceptación, no un detalle de estilo. Cada test
de esta fase MUST nombrarse `"<id del requisito> — <título del escenario>"`, usando el título exacto de
los encabezados `#### Scenario:` de abajo, sin parafrasear.

## ADDED Requirements

### Requirement: IMP1 — Lectura de las pestañas del catálogo desde Sheets o desde un directorio local

El sistema MUST exponer un puerto `FuenteCatalogo` que lee cinco pestañas — `productos`, `tarifas`,
`cobertura` (nueva de esta fase, Q2), `parametros` y `excepciones_horario` — desde (a) el endpoint
público de Google Sheets por pestaña (`--sheet-id <id>`) o (b) un directorio local de archivos CSV con
el mismo formato (`--dir <fixtures>`), sin que el resto del importador distinga cuál de los dos orígenes
se usó.

#### Scenario: Leer desde un directorio local carga las cinco pestañas del catálogo

- Dado un directorio con los archivos `productos.csv`, `tarifas.csv`, `cobertura.csv`, `parametros.csv`
  y `excepciones_horario.csv`,
- Cuando se lee el catálogo con `--dir` apuntando a ese directorio,
- Entonces el resultado trae las cinco pestañas con las filas de sus respectivos archivos.

#### Scenario: Leer desde Google Sheets descarga cada pestaña por su nombre

- Dado un identificador de hoja de Google Sheets compartida como "cualquiera con el enlace: lector",
- Cuando se lee el catálogo con ese identificador de hoja,
- Entonces el sistema descarga cada una de las cinco pestañas desde el endpoint público
  `gviz/tq?tqx=out:csv` de esa hoja, identificándolas por su nombre de pestaña.

### Requirement: IMP2 — Detección de hoja no compartida o pestaña inexistente

Cuando el origen es una hoja de Google Sheets, el sistema MUST detectar que la respuesta es HTML en vez
de CSV (hoja no compartida por enlace o que exige iniciar sesión) y fallar con un error que lo explique,
en vez de intentar interpretar HTML como filas de catálogo. Cuando una pestaña no existe (en la hoja o
como archivo en el directorio local), el sistema MUST fallar con un error claro que nombre la pestaña
faltante, sin continuar la importación.

#### Scenario: Una hoja no compartida por enlace responde HTML y el importador falla con un error claro

- Dado un identificador de hoja de Google Sheets que no está compartida como "cualquiera con el enlace:
  lector",
- Cuando se intenta leer el catálogo desde esa hoja,
- Entonces el sistema falla con un error que indica que la hoja no está compartida correctamente, sin
  intentar interpretar la respuesta como filas de catálogo.

#### Scenario: Una pestaña inexistente falla con un error que la nombra

- Dado un origen (hoja o directorio local) al que le falta la pestaña `cobertura`,
- Cuando se intenta leer el catálogo desde ese origen,
- Entonces el sistema falla con un error que nombra la pestaña `cobertura` como faltante.

### Requirement: IMP3 — Validación de los campos obligatorios de un producto

El sistema MUST validar, antes de escribir nada, que cada fila de la pestaña `productos` tiene un SKU no
vacío con la forma fija `SKU-XXXX` (letras, números y guiones) y único dentro de la hoja, un nombre no
vacío de máximo 24 caracteres, una descripción corta no vacía de máximo 72 caracteres, una descripción
larga no vacía, y un precio expresado como entero de pesos colombianos mayor que 0. Una fila que
incumple cualquiera de estas condiciones MUST producir un error de validación que identifique la
pestaña, la fila de la hoja y la columna.

#### Scenario: Un SKU vacío o con una forma distinta a SKU-XXXX es un error

- Dado un producto cuyo SKU está vacío, o cuyo SKU no tiene la forma `SKU-XXXX`,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `sku` de esa fila.

#### Scenario: Un SKU repetido en dos filas es un error que cita la primera fila

- Dado un catálogo con dos productos que tienen el mismo SKU (sin distinguir mayúsculas),
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la segunda fila que cita el número de la
  primera fila donde apareció ese SKU.

#### Scenario: Un nombre o una descripción fuera de los límites de las listas de WhatsApp es un error

- Dado un producto con el nombre vacío, o con más de 24 caracteres, o con la descripción corta vacía o
  con más de 72 caracteres, o con la descripción larga vacía,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna correspondiente de esa fila.

#### Scenario: Un precio que no es un entero positivo es un error

- Dado un producto con un precio vacío, no numérico, con decimales, o menor o igual a 0,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `precio_cop` de esa fila.

### Requirement: IMP4 — Validación de las fotos de un producto activo

El sistema MUST validar que cada producto activo tiene entre 1 y 6 enlaces de foto, y que cada enlace
empieza por `http://` o `https://`. Un producto inactivo (`activo = no`) MUST NOT requerir ninguna foto.

#### Scenario: Un producto activo sin fotos o con más de 6 es un error

- Dado un producto activo sin ningún enlace de foto, o con más de 6 enlaces de foto,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `fotos` de esa fila.

#### Scenario: Un enlace de foto que no es http(s) es un error

- Dado un producto activo con un enlace de foto que no empieza por `http://` ni `https://` (por ejemplo,
  una ruta de archivo local),
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `fotos` de esa fila que cita el
  enlace inválido.

#### Scenario: Un producto inactivo no necesita ninguna foto

- Dado un producto marcado como inactivo, sin ningún enlace de foto,
- Cuando se valida el catálogo,
- Entonces la validación de ese producto no produce ningún error por falta de fotos.

### Requirement: IMP5 — Peso y medidas del producto son opcionales pero deben ser enteros cuando se informan

El sistema MUST aceptar que `peso_gramos`, `largo_mm`, `ancho_mm` y `alto_mm` de un producto vengan
vacíos (el producto pesa 0 gramos para efectos de envío, CAT6); cuando alguno de estos campos trae un
valor, MUST validar que es un entero no negativo, y MUST producir un error de validación en su columna
si no lo es.

#### Scenario: Peso y medidas vacíos se aceptan sin error

- Dado un producto sin `peso_gramos`, `largo_mm`, `ancho_mm` ni `alto_mm` informados,
- Cuando se valida el catálogo,
- Entonces la validación de ese producto no produce ningún error por esos campos.

#### Scenario: Un peso o medida que no es un entero es un error en su columna

- Dado un producto con `peso_gramos = "1,2 kg"`,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `peso_gramos` de esa fila.

### Requirement: IMP6 — Validación de las franjas de peso y del rango de una tarifa

El sistema MUST validar que la franja de peso de una tarifa (`peso_min_g`-`peso_max_g`) tiene el mínimo
menor o igual que el máximo, que el rango de precio (`rango_min_cop`-`rango_max_cop`) tiene el mínimo
menor o igual que el máximo, y que el rango de días de entrega (`dias_min`-`dias_max`) tiene el mínimo
menor o igual que el máximo. El sistema MUST rechazar como error dos filas de tarifa que declaran, para
el mismo departamento y ciudad, franjas de peso que se solapan de forma inválida, incluida una franja
idéntica repetida.

#### Scenario: Una franja de peso, un rango de precio o un rango de días invertido es un error

- Dada una tarifa con `peso_min_g` mayor que `peso_max_g`, o con `rango_min_cop` mayor que
  `rango_max_cop`, o con `dias_min` mayor que `dias_max`,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación que identifica cuál de los tres rangos está
  invertido.

#### Scenario: Dos tarifas con franjas de peso distintas para el mismo destino conviven sin error

- Dadas dos tarifas para el mismo departamento y ciudad, una para pesos de 0 a 5.000 gramos y otra para
  pesos de 5.001 gramos en adelante,
- Cuando se valida el catálogo,
- Entonces la validación no produce ningún error de solape entre esas dos tarifas.

#### Scenario: Dos tarifas con la misma franja de peso para el mismo destino son un error de solape

- Dadas dos tarifas para el mismo departamento y ciudad con exactamente la misma franja de peso,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación que indica que la tarifa está repetida para ese
  destino y esa franja de peso.

### Requirement: IMP7 — Serialización de un parámetro a jsonb según su clave, y advertencia para clave desconocida

El sistema MUST validar y serializar `parametro.valor` a `jsonb` según un parser propio por clave
conocida (Q3, R15: el negocio edita estos valores desde la hoja, nunca son constantes en código):
`horario_atencion` MUST validarse como JSON de un objeto cuyos valores son `null` o una cadena
`"HH:MM-HH:MM"`, y guardarse como ese objeto; `recargo_contraentrega_pct` y `factor_volumetrico` MUST
validarse y guardarse como un número jsonb. Una clave que no está en el registro de claves conocidas
MUST NOT producir un error — MUST producir una advertencia y guardarse tal cual, como valor jsonb de
tipo cadena.

#### Scenario: horario_atencion con JSON válido se guarda como objeto jsonb

- Dado un parámetro `horario_atencion` con el valor `{"lun-vie":"08:00-18:00","dom":null}`,
- Cuando se valida y serializa el catálogo,
- Entonces `parametro.valor` para esa clave queda guardado como ese objeto jsonb, sin ningún error de
  validación.

#### Scenario: horario_atencion con un valor que no es JSON válido es un error

- Dado un parámetro `horario_atencion` con el valor `"8 a 6"`,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `valor` de esa fila.

#### Scenario: recargo_contraentrega_pct y factor_volumetrico se guardan como número jsonb

- Dados los parámetros `recargo_contraentrega_pct` con valor `"5"` y `factor_volumetrico` con valor
  `"4000"`,
- Cuando se valida y serializa el catálogo,
- Entonces ambos quedan guardados como el número jsonb `5` y `4000` respectivamente.

#### Scenario: recargo_contraentrega_pct o factor_volumetrico no numérico es un error

- Dado un parámetro `factor_volumetrico` con el valor `"cuatro mil"`,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `valor` de esa fila.

#### Scenario: Una clave desconocida solo genera una advertencia y se guarda tal cual

- Dado un parámetro con la clave `color_favorito` (no está en el registro de claves conocidas) y valor
  `"azul"`,
- Cuando se valida y serializa el catálogo,
- Entonces el resultado no incluye ningún error por esa fila, incluye una advertencia que nombra la
  clave `color_favorito`, y `parametro.valor` para esa clave queda guardado tal cual, como valor jsonb
  de tipo cadena.

### Requirement: IMP8 — Fecha de excepción de horario parseable

El sistema MUST validar que la columna `fecha` de la pestaña `excepciones_horario` es una fecha real en
formato `YYYY-MM-DD` o `DD/MM/YYYY`, y MUST producir un error de validación cuando no lo es (incluida una
fecha con día o mes fuera de rango, como el 30 de febrero).

#### Scenario: Una fecha en formato YYYY-MM-DD o DD/MM/YYYY se acepta

- Dadas dos excepciones de horario con fecha `"2026-12-25"` y `"31/12/2026"` respectivamente,
- Cuando se valida el catálogo,
- Entonces ambas filas se aceptan sin error de validación.

#### Scenario: Una fecha que no existe en el calendario es un error

- Dada una excepción de horario con fecha `"2026-02-30"`,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `fecha` de esa fila.

### Requirement: IMP9 — Resolución de departamento y ciudad a código DANE en cobertura y tarifas

El sistema MUST traducir el texto de departamento y ciudad de cada fila de las pestañas `cobertura` y
`tarifas` a `departamento_id`/`ciudad_id` (códigos DANE), reutilizando el repositorio de `geografia` y el
mismo criterio de comparación de nombres que CAT8 (ignora tildes, mayúsculas y puntuación). Cuando el
texto de una fila no matchea ningún nombre de `geografia`, el sistema MUST tratar esa fila como inválida
(Q1: nunca se adivina el departamento o la ciudad), y el mensaje de error MUST citar el texto exacto de
la hoja que no matcheó.

#### Scenario: Un departamento y ciudad de la hoja se resuelven a su código DANE

- Dada una fila de `tarifas` con `departamento = "antioquia"` y `ciudad = "Medellín"`, y esos nombres
  existentes en `geografia`,
- Cuando se valida y resuelve el catálogo,
- Entonces esa fila queda asociada al `departamento_id` y `ciudad_id` DANE correspondientes, ignorando
  mayúsculas y tildes en la entrada.

#### Scenario: Un departamento sin match en geografia es una fila inválida que cita el texto exacto

- Dada una fila de `cobertura` con `departamento = "Antioqia"` (con un error de tipeo, sin match en
  `geografia`),
- Cuando se valida y resuelve el catálogo,
- Entonces el resultado incluye un error de validación que cita el texto exacto `"Antioqia"` como el
  departamento que no matcheó, y ninguna escritura ocurre para esa importación (IMP10).

#### Scenario: Una fila de cobertura con departamento y sin ciudad excluye todo el departamento

- Dada una fila de `cobertura` con `departamento = "Chocó"` y `ciudad` vacía,
- Cuando se valida y resuelve el catálogo,
- Entonces esa fila queda asociada solo al `departamento_id` de "Chocó", con `ciudad_id` vacío (todo el
  departamento excluido).

### Requirement: IMP10 — Cualquier fila inválida o foto no descargable deja la base exactamente como estaba

El sistema MUST validar todas las pestañas antes de intentar escribir cualquier dato, y MUST comprobar
que cada foto de un producto activo se puede descargar antes de escribir en la base de datos (las fotos
se procesan fuera de la transacción, antes que cualquier escritura de base de datos). Cuando existe al
menos un error de validación, o al menos una foto que no se pudo descargar, el sistema MUST NOT escribir
ningún cambio en `producto`, `foto`, `tarifa_estimada`, `zona_sin_cobertura`, `parametro` ni
`excepcion_horario`.

#### Scenario: Un SKU repetido deja la base sin ningún cambio

- Dado un catálogo con un SKU repetido en dos filas de `productos`, y un estado inicial conocido de la
  base de datos,
- Cuando se ejecuta la importación,
- Entonces la importación falla con el error de validación correspondiente y la base de datos queda
  exactamente igual que antes de ejecutarla.

#### Scenario: Una foto que no se puede descargar aborta la importación sin escribir nada

- Dado un producto activo cuyo enlace de foto responde con un error de red o con HTML en vez de una
  imagen, y un estado inicial conocido de la base de datos,
- Cuando se ejecuta la importación,
- Entonces la importación falla citando ese enlace y la base de datos queda exactamente igual que antes
  de ejecutarla, sin ningún producto, foto ni tarifa nueva o modificada.

#### Scenario: Un departamento sin match DANE deja la base sin ningún cambio

- Dado un catálogo válido en todo lo demás, con una fila de `tarifas` cuyo departamento no matchea
  ningún nombre de `geografia`, y un estado inicial conocido de la base de datos,
- Cuando se ejecuta la importación,
- Entonces la importación falla con el error de validación de IMP9 y la base de datos queda exactamente
  igual que antes de ejecutarla.

### Requirement: IMP11 — Escritura todo-o-nada del catálogo dentro de una sola transacción

Cuando la validación y la descarga de fotos son exitosas, el sistema MUST escribir todos los cambios del
catálogo dentro de una sola transacción de base de datos: upsert de cada producto de la hoja (por SKU),
reemplazo completo de las fotos de un producto actualizado, desactivación (nunca borrado) de los
productos existentes que no aparecen en la hoja, reemplazo completo de `tarifa_estimada` y de
`zona_sin_cobertura` con las filas de la importación actual, y sincronización de `excepcion_horario`
reemplazando solo las excepciones futuras (las fechas anteriores a hoy se conservan como historial y
nunca se tocan). Si cualquier escritura dentro de esa transacción falla, el sistema MUST revertir todos
los cambios de esa importación.

#### Scenario: Un producto nuevo se crea y uno existente se actualiza por su SKU

- Dado un producto ya existente con un SKU dado y un producto nuevo con otro SKU, ambos en la hoja,
- Cuando se ejecuta la importación,
- Entonces el producto existente queda actualizado con los datos de la hoja y el producto nuevo queda
  creado, ambos identificados por su SKU.

#### Scenario: Las fotos de un producto actualizado se reemplazan por completo

- Dado un producto existente con 3 fotos guardadas, y la misma fila en la hoja con solo 2 enlaces de
  foto,
- Cuando se ejecuta la importación,
- Entonces ese producto queda con exactamente 2 fotos después de importar, sin ningún resto de la
  tercera foto anterior.

#### Scenario: Un producto ausente de la hoja se desactiva, nunca se borra

- Dado un producto activo guardado en la base de datos cuyo SKU no aparece en la pestaña `productos` de
  esta importación,
- Cuando se ejecuta la importación,
- Entonces ese producto queda con `activo = false` después de importar, y sigue existiendo la fila en
  `producto` (no se borra).

#### Scenario: tarifa_estimada y zona_sin_cobertura se reemplazan por completo en cada importación

- Dadas tarifas y zonas sin cobertura guardadas de una importación anterior que no aparecen en la hoja
  actual,
- Cuando se ejecuta la importación,
- Entonces después de importar solo existen las filas de `tarifa_estimada` y `zona_sin_cobertura` de la
  hoja actual; las de la importación anterior que ya no están en la hoja desaparecen.

#### Scenario: Las excepciones de horario futuras se sincronizan conservando las pasadas

- Dada una excepción de horario con fecha pasada guardada en la base de datos que no está en la hoja
  actual, y una excepción con fecha futura en la hoja actual,
- Cuando se ejecuta la importación,
- Entonces la excepción con fecha pasada sigue existiendo sin cambios, y la excepción con fecha futura
  de la hoja queda guardada.

#### Scenario: Un fallo dentro de la transacción revierte todos los cambios de esa importación

- Dada una importación cuyos productos y tarifas validan correctamente pero cuya escritura falla a mitad
  de la transacción (por ejemplo, una restricción de la base de datos),
- Cuando se ejecuta la importación,
- Entonces ningún producto, foto, tarifa, zona sin cobertura, parámetro ni excepción de esa importación
  queda parcialmente escrito: la base vuelve al estado anterior a la importación.

### Requirement: IMP12 — Invalidación de CACHE_CATALOGO al finalizar una importación exitosa

El sistema MUST invalidar `CACHE_CATALOGO` (la operación de invalidación de CAT5, ya construida en Fase
02) inmediatamente después de que la transacción de escritura del catálogo confirma con éxito, sin
reimplementar ninguna lógica de invalidación propia.

#### Scenario: Una importación exitosa invalida la caché de catálogo compacto

- Dado un catálogo compacto ya leído una vez antes de importar (CAT4),
- Cuando se ejecuta una importación exitosa que agrega un producto nuevo,
- Entonces la siguiente lectura del catálogo compacto incluye el producto nuevo, sin esperar ningún
  tiempo adicional (mismo contrato observable que CAT5).

### Requirement: IMP13 — Comando CLI catalogo:importar con --sheet-id, --dir y --solo-validar

El sistema MUST exponer un comando `npm run catalogo:importar -- [--sheet-id <id> | --dir <fixtures>]
[--solo-validar]` que construye su propio contexto de aplicación al ejecutarse (nunca una conexión
abierta al importar el módulo, corrige A1) y que exige exactamente uno de `--sheet-id` o `--dir`. Con
`--solo-validar`, el comando MUST validar la hoja y comprobar que cada foto de un producto activo se
puede descargar, MUST NOT escribir ningún cambio en la base de datos, y MUST reportar si el catálogo es
válido para importar.

#### Scenario: --solo-validar reporta un catálogo válido sin escribir nada

- Dado un catálogo sin errores de validación y con todas sus fotos accesibles,
- Cuando se ejecuta el comando con `--solo-validar`,
- Entonces el comando reporta que el catálogo es válido, y ningún dato de `producto`, `foto`,
  `tarifa_estimada`, `zona_sin_cobertura`, `parametro` ni `excepcion_horario` cambia en la base de datos.

#### Scenario: --solo-validar reporta los errores de validación y de fotos inaccesibles sin escribir nada

- Dado un catálogo con un error de validación en una fila y, además, una foto de otro producto activo
  que no se puede descargar,
- Cuando se ejecuta el comando con `--solo-validar`,
- Entonces el comando reporta ambos problemas y ningún dato de la base de datos cambia.

#### Scenario: Ejecutar el comando sin --sheet-id ni --dir falla con un error claro

- Dado ningún `--sheet-id` ni `--dir` en los argumentos del comando,
- Cuando se ejecuta el comando `catalogo:importar`,
- Entonces el comando falla con un error que indica que se debe pasar exactamente uno de los dos.
