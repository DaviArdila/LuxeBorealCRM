# Delta for catalogo

## Purpose

Da a las políticas del negocio un lugar único y editable (`politica_<tema>` en `parametro`, CAT12),
hace que la cotización con contra entrega devuelva la política de contra entrega ya lista para citar
(CAT10), quita de la ficha cualquier dato del recargo (CAT2) porque el cliente solo debe saber que se
suma al total, y deja el texto de fuera de cobertura sin promesas (CAT11). El importador valida las
claves `politica_*` (IMP7). El porcentaje `recargo_contraentrega_pct` sigue existiendo como dato
interno del negocio (Fase 13) y ya no lo lee ningún servicio de este módulo.

## MODIFIED Requirements

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

## ADDED Requirements

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
