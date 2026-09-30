# Catálogo Specification

## Purpose

Define el contrato observable de la lectura del catálogo para el resto del sistema (Fase 07 la
conecta al LLM): qué productos se listan y cómo se arma su ficha con el dinero ya formateado (R2),
cómo se invalida la caché de catálogo compacto sin depender del TTL, y cómo se calcula la cobertura
y la tarifa de envío (P4, `MODELO_DATOS.md` §4) sin que el LLM haga ningún cálculo.

Fuera de esta spec (ver proposal, Out of Scope): la búsqueda difusa de catálogo por texto (Q1,
pospuesta a Fase 07) y el contrato de *tool* del LLM (`buscar_producto`, `obtener_ficha`,
`cotizar_envio`, Fase 07). Esta spec cubre el lado "el backend calcula y formatea" de R2; el lado
"el LLM solo cita" ya está descrito en `openspec/specs/agente/spec.md` (R2) sin delta esperado aquí.

## Nota de implementación

El título exacto de cada escenario **es** el criterio de aceptación, no un detalle de estilo. Cada
test de esta fase MUST nombrarse `"<id del requisito> — <título del escenario>"`, usando el título
exacto de los encabezados `#### Scenario:` de abajo, sin parafrasear.

## Requirements

### Requirement: CAT1 — Listado de productos activos sin precio

El sistema MUST exponer un listado de los productos activos que NUNCA incluye el precio ni ningún
otro dato de dinero, para uso del futuro `buscar_producto` (Fase 07) y de la construcción del
catálogo compacto. El listado MUST excluir los productos inactivos.

#### Scenario: El listado de productos activos no lleva precio

- Dado un catálogo con productos activos que sí tienen `precio_cop`,
- Cuando se listan los productos activos,
- Entonces ningún elemento del resultado expone el precio ni ningún valor en pesos.

#### Scenario: El listado excluye productos inactivos

- Dado un catálogo con al menos un producto activo y un producto inactivo,
- Cuando se listan los productos activos,
- Entonces el producto inactivo no aparece en el resultado.

### Requirement: CAT2 — Ficha de producto con dinero ya formateado

El sistema MUST construir la ficha de un producto con `precio_texto` como texto ya formateado,
reutilizando `formatearCop` de `compartido/dinero` sin reimplementar lógica de formateo propia (R2:
el LLM nunca calcula dinero, solo cita lo que el backend ya formateó). La ficha MUST NOT exponer el
recargo contra entrega ni su porcentaje: lo que el cliente debe saber de la contra entrega lo entrega
la política `contra_entrega` (CAT12). La ficha MUST indicar si el producto tiene fotos.

(Previously: la ficha exponía `recargo_contraentrega_texto`, armado con
`formatearRecargoContraentrega` y el porcentaje leído de `recargo_contraentrega_pct`.)

#### Scenario: La ficha expone el precio como texto formateado

- Dado un producto activo con `precio_cop = 123456`,
- Cuando se obtiene su ficha,
- Entonces `precio_texto` es el resultado de `formatearCop(123456)`, sin ningún cálculo adicional
  sobre el valor.

#### Scenario: La ficha no expone ningún dato del recargo contra entrega

- Dado un producto activo y el parámetro `recargo_contraentrega_pct` con valor `5`,
- Cuando se obtiene la ficha del producto,
- Entonces la ficha no incluye ningún campo de recargo y ningún texto de la ficha contiene el
  símbolo de porcentaje.

#### Scenario: La ficha indica si el producto tiene fotos

- Dado un producto activo con al menos una fila en `foto`,
- Cuando se obtiene su ficha,
- Entonces `tiene_fotos` es `true`.

### Requirement: CAT3 — Rechazo de producto inactivo o inexistente

El sistema MUST rechazar la solicitud de ficha cuando el producto no existe o cuando existe pero
está inactivo (`producto.activo = false`), sin devolver ningún dato de ese producto.

#### Scenario: Ficha de un producto inactivo se rechaza

- Dado un producto con `activo = false`,
- Cuando se solicita su ficha por id o por SKU,
- Entonces el sistema devuelve un rechazo y no devuelve `precio_texto` ni ningún otro dato del
  producto.

#### Scenario: Ficha de un producto inexistente se rechaza

- Dado un id o SKU que no corresponde a ningún producto guardado,
- Cuando se solicita su ficha,
- Entonces el sistema devuelve un rechazo y no devuelve ninguna ficha.

### Requirement: CAT4 — La caché de catálogo compacto sirve la misma copia mientras la versión no cambia

El sistema MUST mantener una caché del catálogo compacto (texto sku + nombre + descripción corta,
sin precios) detrás de un puerto propio del módulo `catalogo`, implementada como *provider*
inyectable de NestJS — nunca un `let` de módulo abierto al importarse (corrige A1) ni una
dependencia directa del módulo de colas (corrige A3). Mientras la clave de versión no cambie, una
lectura MUST devolver la misma copia sin reflejar escrituras hechas fuera de la operación de
invalidación de esta fase.

#### Scenario: Una escritura directa en producto sin pasar por la invalidación no se refleja de inmediato

- Dado un catálogo compacto ya leído una vez (una copia en caché con la versión actual),
- Cuando se guarda un producto nuevo directamente en la base de datos, sin llamar a la operación de
  invalidación,
- Entonces la siguiente lectura del catálogo compacto sigue devolviendo la copia anterior, sin el
  producto nuevo.

#### Scenario: El catálogo compacto no lleva precios y solo lista productos activos ordenados por nombre

- Dado un catálogo con productos activos e inactivos, con nombres en distinto orden alfabético,
- Cuando se obtiene el catálogo compacto,
- Entonces el texto devuelto lista solo los productos activos, ordenados por nombre, y no contiene
  ningún valor de dinero.

### Requirement: CAT5 — Invalidación de la caché de catálogo por versión, sin esperar el TTL

El sistema MUST exponer una operación explícita de invalidación que incrementa la clave de versión
compartida (Redis); la siguiente lectura del catálogo compacto, en el mismo proceso o en cualquier
otro que comparta la misma clave de versión, MUST descartar la copia en caché y recargar de
inmediato, sin esperar a que expire ningún respaldo temporal.

#### Scenario: Invalidar el catálogo incrementa la versión compartida

- Dado un valor actual de la clave de versión del catálogo,
- Cuando se llama a la operación de invalidación,
- Entonces la clave de versión queda incrementada en uno respecto al valor anterior.

#### Scenario: Invalidar el catálogo hace que la siguiente lectura vea el cambio de inmediato

- Dado un catálogo compacto ya leído una vez, y un producto nuevo guardado después de esa lectura,
- Cuando se llama a la operación de invalidación y luego se vuelve a leer el catálogo compacto,
- Entonces la lectura incluye el producto nuevo, sin esperar ningún tiempo adicional.

#### Scenario: Otro proceso que incrementa la versión compartida invalida esta copia igual

- Dado un catálogo compacto ya leído una vez por este proceso,
- Cuando otro proceso (por ejemplo, un futuro importador de catálogo) incrementa directamente la
  clave de versión compartida, y luego se vuelve a leer el catálogo compacto en este proceso,
- Entonces la lectura recarga desde el origen de datos en vez de devolver la copia anterior.

### Requirement: CAT6 — Cálculo de peso facturable

El sistema MUST calcular el peso facturable de una línea de producto como el mayor entre el peso
real (`cantidad × peso_gramos`) y el peso volumétrico (`cantidad × largo_mm × ancho_mm × alto_mm /
factor_volumetrico`), redondeado hacia arriba a gramos enteros. El `factor_volumetrico` MUST leerse
como parámetro del negocio (R15), nunca como constante en código. Un producto sin peso ni medidas
registradas MUST contar como 0 gramos, sin fallar el cálculo.

#### Scenario: Gana el peso volumétrico cuando el producto es voluminoso y liviano

- Dado un producto con `peso_gramos = 800`, `largo_mm = 300`, `ancho_mm = 200`, `alto_mm = 100` y
  `factor_volumetrico = 4000`,
- Cuando se calcula su peso facturable para una unidad,
- Entonces el resultado es 1.500 gramos (el volumétrico), no los 800 gramos reales.

#### Scenario: Gana el peso real cuando el producto es denso, multiplicado por la cantidad

- Dado un producto con `peso_gramos = 5000`, `largo_mm = 100`, `ancho_mm = 100`, `alto_mm = 100`,
  `factor_volumetrico = 4000` y una cantidad de 3 unidades,
- Cuando se calcula el peso facturable de esa línea,
- Entonces el resultado es 15.000 gramos.

#### Scenario: Un producto sin peso ni medidas pesa cero

- Dado un producto sin `peso_gramos`, `largo_mm`, `ancho_mm` ni `alto_mm` registrados,
- Cuando se calcula su peso facturable,
- Entonces el resultado es 0 gramos y el cálculo no falla.

### Requirement: CAT7 — La exclusión de cobertura tiene prioridad sobre cualquier tarifa

El sistema MUST comprobar primero si el destino (departamento y, si se dio, ciudad) está en
`zona_sin_cobertura`; si lo está, MUST tratarse como sin cobertura sin buscar ninguna tarifa en
`tarifa_estimada`, sin importar que exista una tarifa que en principio calzaría.

#### Scenario: Un destino en zona_sin_cobertura se trata como sin cobertura aunque exista una tarifa que calzaría

- Dado un departamento guardado en `zona_sin_cobertura` (toda la ciudad nula, es decir todo el
  departamento excluido) y también una fila en `tarifa_estimada` para ese mismo departamento,
- Cuando se cotiza el envío a ese departamento,
- Entonces el resultado es sin cobertura, y la tarifa existente no se usa.

### Requirement: CAT8 — Elección de tarifa por especificidad: ciudad exacta → departamento por defecto → nacional

Cuando el destino no está excluido, el sistema MUST elegir, entre las filas de `tarifa_estimada`
cuya franja de peso (`peso_min_g`-`peso_max_g`) contiene el peso facturable, la más específica en
este orden: la tarifa de la ciudad exacta del destino, luego la tarifa por defecto del departamento
(`ciudad_id` nulo), luego la tarifa nacional (`departamento_id` nulo). La comparación de nombres de
departamento y ciudad MUST ignorar tildes, mayúsculas y puntuación. Cuando la ciudad pedida no tiene
tarifa propia, o su tarifa propia no cubre el peso, el sistema MUST caer a la tarifa por defecto del
departamento. Cuando el departamento resuelto de otra forma no tiene tarifa pero la ciudad sí existe
como tarifa de otro departamento (ciudad-distrito registrada bajo un departamento distinto, ej.
"Cundinamarca" / "Bogotá"), el sistema MUST resolver por la ciudad. Sin ninguna tarifa que aplique,
el resultado MUST ser sin cobertura (Q2: esta especificidad se resuelve con este algoritmo
determinístico, sin restricción nueva de esquema).

#### Scenario: La ciudad exacta gana sobre la tarifa por defecto del departamento

- Dado una tarifa por defecto para "Antioquia" y una tarifa específica para "Antioquia" / "Medellín"
  que cubren el mismo peso,
- Cuando se cotiza el envío a "Antioquia" / "Medellín" con ese peso,
- Entonces se elige la tarifa específica de "Medellín", ignorando tildes y mayúsculas en la entrada.

#### Scenario: Una ciudad sin tarifa propia cae a la tarifa por defecto de su departamento

- Dado una tarifa por defecto para "Antioquia" y ninguna tarifa específica para "Rionegro",
- Cuando se cotiza el envío a "Antioquia" / "Rionegro",
- Entonces se elige la tarifa por defecto del departamento.

#### Scenario: Una ciudad con tarifa propia que no cubre el peso cae a la tarifa del departamento

- Dado una tarifa específica para "Medellín" cuya franja de peso no cubre el peso facturable pedido,
  y una tarifa por defecto de "Antioquia" que sí lo cubre,
- Cuando se cotiza el envío a "Antioquia" / "Medellín" con ese peso,
- Entonces se elige la tarifa por defecto del departamento, no la de la ciudad.

#### Scenario: Una ciudad-distrito registrada bajo otro departamento se resuelve por la ciudad

- Dado una tarifa por defecto guardada para el departamento "Bogotá D.C." y ninguna tarifa para
  "Cundinamarca",
- Cuando se cotiza el envío a "Cundinamarca" / "Bogotá",
- Entonces se elige la tarifa de "Bogotá D.C.", resuelta por el nombre de la ciudad.

#### Scenario: Se elige la franja de peso que contiene el peso facturable

- Dadas dos tarifas del mismo departamento, una para pesos de 0 a 5.000 gramos y otra para pesos de
  5.001 a 50.000 gramos,
- Cuando se cotiza el envío con un peso facturable de 5.001 gramos,
- Entonces se elige la tarifa de la franja pesada, no la liviana.

#### Scenario: Sin ninguna tarifa que aplique, el resultado es sin cobertura

- Dado un departamento sin ninguna fila de `tarifa_estimada` que lo cubra, ni tarifa nacional
  configurada,
- Cuando se cotiza el envío a ese departamento,
- Entonces el resultado es sin cobertura.

### Requirement: CAT9 — Registro de evento fuera de cobertura

Cuando la cotización de envío resulta sin cobertura, ya sea por exclusión (CAT7) o por ausencia de
tarifa que aplique (CAT8), el sistema MUST registrar una fila en `evento_fuera_cobertura` con el
producto (si se conoce), el departamento y la ciudad tal como los escribió el cliente, y MUST NOT
ofrecer ningún rango de precio ni de días.

#### Scenario: Sin cobertura por ausencia de tarifa se registra el evento con el producto y el destino

- Dado un producto activo y un departamento sin ninguna tarifa que aplique,
- Cuando se cotiza el envío de ese producto a ese departamento,
- Entonces queda una fila en `evento_fuera_cobertura` con ese `producto_id` y ese departamento, y el
  resultado de la cotización no incluye ningún rango de precio.

### Requirement: CAT10 — Cotización de envío con cobertura devuelve rango, días y contraentrega ya formateados

Cuando hay cobertura, el servicio de cotización de envío MUST devolver `cobertura: true`,
`rango_texto` (resultado de `formatearRangoCop` sobre `rango_min_cop`/`rango_max_cop` de la tarifa
elegida), `dias_texto` (resultado de `formatearDias` sobre `dias_min`/`dias_max`) y
`contraentrega_disponible` tomado de la tarifa elegida, sin que el LLM (Fase 07) tenga que calcular
ni redondear nada (R2). Cuando `contraentrega_disponible` es `true`, MUST devolver además
`politica_contraentrega_texto` con el texto de la política `contra_entrega` (CAT12), para que el bot
lo cite literal; cuando es `false`, MUST NOT incluirlo.

(Previously: la cotización no devolvía ninguna política; el bot no tenía dónde apoyarse para explicar
la contra entrega.)

#### Scenario: Cotización con cobertura devuelve el rango y los días ya formateados de la tarifa elegida

- Dada una tarifa elegida con `rango_min_cop = 30000`, `rango_max_cop = 40000`, `dias_min = 2`,
  `dias_max = 4` y `contraentrega_disponible = true`,
- Cuando se cotiza el envío a un destino que resuelve esa tarifa,
- Entonces el resultado es `cobertura: true` con `rango_texto` igual a
  `formatearRangoCop(30000, 40000)`, `dias_texto` igual a `formatearDias(2, 4)`,
  `contraentrega_disponible: true` y `politica_contraentrega_texto` igual al texto de la política
  `contra_entrega`.

#### Scenario: Cotización con cobertura sin contra entrega no incluye la política

- Dada una tarifa elegida con `contraentrega_disponible = false`,
- Cuando se cotiza el envío a un destino que resuelve esa tarifa,
- Entonces el resultado es `cobertura: true` con `contraentrega_disponible: false` y no incluye
  `politica_contraentrega_texto`.

#### Scenario: La política de contra entrega configurada por el negocio reemplaza al texto de respaldo

- Dado el parámetro `politica_contra_entrega` con un texto configurado y una tarifa elegida con
  `contraentrega_disponible = true`,
- Cuando se cotiza el envío a un destino que resuelve esa tarifa,
- Entonces `politica_contraentrega_texto` es ese texto configurado, sin modificar.

### Requirement: CAT11 — Cotización de envío sin cobertura devuelve un mensaje configurable y ningún rango

Cuando no hay cobertura, el servicio de cotización de envío MUST devolver `cobertura: false` junto
con un mensaje leído del parámetro editable `mensaje_fuera_cobertura` (R15), y MUST NOT incluir
`rango_texto`, `dias_texto` ni `contraentrega_disponible`. Si `mensaje_fuera_cobertura` no está
configurado, MUST usar un texto por defecto que informe la falta de cobertura y no prometa ningún
contacto ni seguimiento (esa promesa depende de la Fase 08).

(Previously: el texto por defecto prometía «Un asesor revisará tu caso y te contactará».)

#### Scenario: Sin cobertura se devuelve el mensaje del parámetro del negocio, sin ningún rango

- Dado el parámetro `mensaje_fuera_cobertura` con un texto configurado, y un destino sin ninguna
  tarifa ni exclusión que aplique,
- Cuando se cotiza el envío a ese destino,
- Entonces el resultado es `cobertura: false` con ese mensaje, y no incluye `rango_texto` ni
  `dias_texto`.

#### Scenario: Sin parámetro configurado el mensaje por defecto no promete ningún contacto

- Dado que el parámetro `mensaje_fuera_cobertura` no existe, y un destino excluido de la cobertura,
- Cuando se cotiza el envío a ese destino,
- Entonces el resultado es `cobertura: false` con un mensaje que informa la falta de cobertura y que
  no contiene una promesa de contacto de un asesor.

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
validarse y guardarse como un número jsonb. Una clave cuyo nombre empieza por `politica_` MUST
validarse como una política del negocio (CAT12): el tema (lo que sigue al prefijo) MUST ser no vacío y
estar formado solo por letras minúsculas sin acentos, dígitos y guion bajo; el valor MUST ser un texto
no vacío tras recortar espacios y de hasta 1.200 caracteres, y se guarda como una cadena jsonb; una
clave `politica_*` inválida MUST producir un error de validación, no una advertencia. Una clave que no
está en el registro de claves conocidas ni sigue el patrón de política MUST NOT producir un error —
MUST producir una advertencia y guardarse tal cual, como valor jsonb de tipo cadena.

(Previously: una clave `politica_*` era una clave desconocida, con advertencia y sin validar su
contenido.)

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

#### Scenario: Una política válida se guarda como cadena sin advertencia

- Dado un parámetro con la clave `politica_devoluciones` y un texto de política con espacios al
  principio y al final,
- Cuando se valida y serializa el catálogo,
- Entonces el resultado no incluye ningún error ni advertencia por esa fila, y `parametro.valor` queda
  guardado como el texto recortado, como cadena jsonb.

#### Scenario: Una política vacía es un error

- Dado un parámetro con la clave `politica_garantia` y un valor en blanco,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `valor` de esa fila.

#### Scenario: Una política de más de 1200 caracteres es un error

- Dado un parámetro con la clave `politica_garantia` y un texto de 1201 caracteres,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `valor` de esa fila.

#### Scenario: Un tema de política con mayúsculas o espacios es un error

- Dadas las claves `politica_Devoluciones` y `politica_cambio de talla` con un texto válido,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `clave` de cada una de esas
  filas.

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

### Requirement: CAT12 — Políticas del negocio como parámetros politica_<tema>

El sistema MUST tratar como políticas del negocio las filas de `parametro` cuya clave sigue el patrón
`politica_<tema>` (R15: son datos editables, nunca constantes en código). Un caso de uso de consulta
MUST devolver, para un tema, el texto de la política tal cual está guardado, sin interpretarlo ni
reescribirlo (R1, R2). Si el tema es `contra_entrega` y no tiene fila, MUST devolver el texto de
respaldo aprobado por el negocio: «Tu pedido se envía contra entrega: pagas cuando lo recibes. El
recargo por contra entrega se suma al total de tu compra. Te enviaremos la evidencia del despacho
(guía y foto del paquete). Al recibirlo tienes derecho a abrirlo y revisarlo: verifica que sea
exactamente lo que pediste y, si presenta cualquier novedad, puedes devolverlo de inmediato.». Si el
tema no existe, MUST indicar que no fue encontrado junto con los temas disponibles, sin inventar ningún
texto. Los temas disponibles MUST ser la unión, ordenada alfabéticamente y sin repetir, de los
configurados en `parametro` y los de respaldo.

Fase que lo implementa: este cambio (`politicas-contraentrega`); 07 (herramienta `consultar_politica`)

#### Scenario: Una política configurada se devuelve tal cual

- Dado el parámetro `politica_devoluciones` con un texto configurado,
- Cuando se consulta el tema `devoluciones`,
- Entonces el resultado es `encontrada: true` con ese texto exacto, sin ninguna modificación.

#### Scenario: La política de contra entrega sin configurar usa el texto aprobado por el negocio

- Dado que no existe el parámetro `politica_contra_entrega`,
- Cuando se consulta el tema `contra_entrega`,
- Entonces el resultado es `encontrada: true` con el texto de respaldo aprobado por el negocio.

#### Scenario: Un tema sin política devuelve los temas disponibles y no inventa texto

- Dado que no existe el parámetro `politica_garantia` y sí existe `politica_devoluciones`,
- Cuando se consulta el tema `garantia`,
- Entonces el resultado es `encontrada: false` con la lista de temas disponibles
  (`contra_entrega`, `devoluciones`) y ningún texto de política.

#### Scenario: Los temas disponibles unen los configurados y los de respaldo sin repetirse

- Dados los parámetros `politica_contra_entrega` y `politica_devoluciones` configurados,
- Cuando se listan los temas disponibles,
- Entonces el resultado es `contra_entrega` y `devoluciones`, ordenados alfabéticamente y sin que
  `contra_entrega` aparezca dos veces.

### Requirement: CAT13 — Búsqueda de productos activos por palabras clave, sin precio

El sistema MUST exponer un caso de uso de búsqueda que, dado un texto, devuelva como máximo 5
productos activos cuyo nombre o descripción corta contengan alguna de sus palabras clave, ordenados
por número de palabras que coinciden (más coincidencias primero), sin distinguir tildes ni mayúsculas
(`normalizarTexto`, `palabrasClave` de `compartido/texto`). El resultado MUST NOT incluir precio ni
ningún valor en pesos (CAT1) y MUST reutilizar el listado cacheado de activos (CAT4), sin consultar la
base por cada búsqueda.

Fase que lo implementa: 07b (herramienta `buscar_producto`)

#### Scenario: Una coincidencia exacta devuelve un solo resultado

- Dado un catálogo con una sola lámpara activa,
- Cuando se busca "lámpara",
- Entonces el resultado tiene un solo producto, sin precio.

#### Scenario: La búsqueda ignora tildes y mayúsculas

- Dado un producto activo llamado "Lámpara de mesa",
- Cuando se busca "LAMPARA",
- Entonces el producto aparece en el resultado.

#### Scenario: Los productos con más palabras en común van primero

- Dado un producto "Lámpara de mesa roble" y otro "Mesa de centro",
- Cuando se busca "lámpara mesa",
- Entonces "Lámpara de mesa roble" aparece antes que "Mesa de centro".

#### Scenario: La búsqueda devuelve como máximo cinco productos y nunca inactivos

- Dado siete productos activos y uno inactivo que coinciden con el texto,
- Cuando se busca,
- Entonces el resultado tiene exactamente cinco productos y ninguno es el inactivo.

#### Scenario: Una búsqueda sin coincidencias devuelve una lista vacía

- Dado un catálogo sin productos que coincidan,
- Cuando se busca "zapatos",
- Entonces el resultado es una lista vacía.

### Requirement: CAT14 — Fotos de un producto listas para enviar

El sistema MUST exponer un caso de uso que, dado el id o SKU de un producto activo, devuelva la clave
de objeto de su collage (si existe) y las claves de sus fotos individuales en orden (portada primero,
luego por `orden`), hasta un máximo pedido por quien llama. Si el producto no existe o está inactivo,
MUST rechazarse como en CAT3. Solo devuelve claves de objeto (MED1), nunca rutas ni URLs.

Fase que lo implementa: 07b (herramienta `enviar_fotos`)

#### Scenario: Un producto con fotos devuelve su collage y las fotos en orden

- Dado un producto activo con collage y tres fotos, una de ellas portada,
- Cuando se piden sus fotos con un máximo de 4,
- Entonces el resultado trae la clave del collage y las tres claves, con la portada primero.

#### Scenario: El máximo pedido limita las fotos individuales

- Dado un producto activo con cinco fotos,
- Cuando se piden sus fotos con un máximo de 2,
- Entonces el resultado trae exactamente dos claves de fotos individuales.

#### Scenario: Las fotos de un producto inactivo se rechazan

- Dado un producto inactivo con fotos,
- Cuando se piden sus fotos,
- Entonces el sistema devuelve un rechazo y ninguna clave.
