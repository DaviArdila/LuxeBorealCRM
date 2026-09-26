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

El sistema MUST construir la ficha de un producto con `precio_texto` y
`recargo_contraentrega_texto` como texto ya formateado, reutilizando las funciones de
`compartido/dinero` (`formatearCop`, `formatearRecargoContraentrega`) sin reimplementar lógica de
formateo propia (R2: el LLM nunca calcula dinero, solo cita lo que el backend ya formateó). El
porcentaje de recargo contraentrega MUST leerse del parámetro editable `recargo_contraentrega_pct`
(R15), nunca de una constante en código. La ficha MUST indicar si el producto tiene fotos.

#### Scenario: La ficha expone el precio como texto formateado

- Dado un producto activo con `precio_cop = 123456`,
- Cuando se obtiene su ficha,
- Entonces `precio_texto` es el resultado de `formatearCop(123456)`, sin ningún cálculo adicional
  sobre el valor.

#### Scenario: La ficha expone el recargo contraentrega leído del parámetro del negocio

- Dado el parámetro `recargo_contraentrega_pct` con valor `5`,
- Cuando se obtiene la ficha de un producto activo,
- Entonces `recargo_contraentrega_texto` es el resultado de `formatearRecargoContraentrega(5)`.

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
ni redondear nada (R2).

#### Scenario: Cotización con cobertura devuelve el rango y los días ya formateados de la tarifa elegida

- Dada una tarifa elegida con `rango_min_cop = 30000`, `rango_max_cop = 40000`, `dias_min = 2`,
  `dias_max = 4` y `contraentrega_disponible = true`,
- Cuando se cotiza el envío a un destino que resuelve esa tarifa,
- Entonces el resultado es `cobertura: true` con `rango_texto` igual a
  `formatearRangoCop(30000, 40000)`, `dias_texto` igual a `formatearDias(2, 4)` y
  `contraentrega_disponible: true`.

### Requirement: CAT11 — Cotización de envío sin cobertura devuelve un mensaje configurable y ningún rango

Cuando no hay cobertura, el servicio de cotización de envío MUST devolver `cobertura: false` junto
con un mensaje leído del parámetro editable `mensaje_fuera_cobertura` (R15), y MUST NOT incluir
`rango_texto`, `dias_texto` ni `contraentrega_disponible`.

#### Scenario: Sin cobertura se devuelve el mensaje del parámetro del negocio, sin ningún rango

- Dado el parámetro `mensaje_fuera_cobertura` con un texto configurado, y un destino sin ninguna
  tarifa ni exclusión que aplique,
- Cuando se cotiza el envío a ese destino,
- Entonces el resultado es `cobertura: false` con ese mensaje, y no incluye `rango_texto` ni
  `dias_texto`.
