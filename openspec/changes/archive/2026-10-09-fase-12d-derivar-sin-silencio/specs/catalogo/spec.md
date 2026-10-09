# Delta for Catálogo

La cotización de envío deja de adjuntar textos al cliente: devuelve solo datos y el LLM consulta el caso de uso que
corresponda (`asistente`, CAS12). Con eso `catalogo` deja de depender del puerto de textos del asistente.

## MODIFIED Requirements

### Requirement: CAT10 — Cotización de envío con cobertura devuelve rango, días y contraentrega ya formateados

Cuando hay cobertura, el servicio de cotización de envío MUST devolver `cobertura: true`,
`rango_texto` (resultado de `formatearRangoCop` sobre `rango_min_cop`/`rango_max_cop` de la tarifa
elegida), `dias_texto` (resultado de `formatearDias` sobre `dias_min`/`dias_max`) y
`contraentrega_disponible` tomado de la tarifa elegida, sin que el LLM (Fase 07) tenga que calcular
ni redondear nada (R2). MUST NOT devolver ningún texto de política: ni con `contraentrega_disponible` en `true` ni en `false`.
Si el dueño tiene un caso de uso de contra entrega, el LLM lo consulta (CAS12); la semilla no lo crea (CAS13).

(Previously: con `contraentrega_disponible` en `true`, devolvía además `politica_contraentrega_texto` con el texto del caso del
sistema `contra_entrega`, para que el bot lo citara literal.)

Fase que lo implementa: 12d (se retira el texto adjunto)

#### Scenario: Cotización con cobertura devuelve el rango y los días ya formateados de la tarifa elegida

- Dada una tarifa elegida con `rango_min_cop = 30000`, `rango_max_cop = 40000`, `dias_min = 2`,
  `dias_max = 4` y `contraentrega_disponible = true`,
- Cuando se cotiza el envío a un destino que resuelve esa tarifa,
- Entonces el resultado es `cobertura: true` con `rango_texto` igual a
  `formatearRangoCop(30000, 40000)`, `dias_texto` igual a `formatearDias(2, 4)` y
  `contraentrega_disponible: true`.

#### Scenario: La cotización con contra entrega no trae ningún texto de política

- Dada una tarifa elegida con `contraentrega_disponible = true`,
- Cuando se cotiza el envío a un destino que resuelve esa tarifa,
- Entonces el resultado no incluye `politica_contraentrega_texto` ni ningún otro texto de política.

#### Scenario: Cotización con cobertura sin contra entrega

- Dada una tarifa elegida con `contraentrega_disponible = false`,
- Cuando se cotiza el envío a un destino que resuelve esa tarifa,
- Entonces el resultado es `cobertura: true` con `contraentrega_disponible: false` y ningún texto de política.

#### Scenario: Cotizar no consulta el puerto de textos del asistente

- Dado el servicio de cotización construido sin ningún puerto de textos,
- Cuando se cotiza con y sin contra entrega,
- Entonces la cotización se calcula con normalidad.

### Requirement: CAT11 — Cotización de envío sin cobertura devuelve `cobertura: false` y ningún rango ni texto

Cuando no hay cobertura, el servicio de cotización de envío MUST devolver `cobertura: false` y MUST NOT incluir
`rango_texto`, `dias_texto`, `contraentrega_disponible` ni ningún mensaje. El texto que el cliente lee lo consulta el LLM como
un caso de uso del dueño si existe (CAS12; la semilla no lo crea); si no existe, el LLM informa la falta de cobertura sin
inventar condiciones ni prometer ningún contacto.

(Previously: devolvía además el texto del caso del sistema `mensaje_fuera_cobertura` y, sin caso, un texto de respaldo.)

Fase que lo implementa: 12d (se retira el mensaje adjunto)

#### Scenario: Sin cobertura se devuelve solo cobertura falsa, sin ningún rango

- Dado un destino sin ninguna tarifa ni exclusión que aplique,
- Cuando se cotiza el envío a ese destino,
- Entonces el resultado es `cobertura: false`, no incluye `rango_texto` ni `dias_texto` y no incluye ningún mensaje.

#### Scenario: Un destino excluido de la cobertura tampoco trae mensaje

- Dado un destino excluido de la cobertura,
- Cuando se cotiza el envío a ese destino,
- Entonces el resultado es `cobertura: false` sin mensaje y queda el evento fuera de cobertura registrado (CAT9).

### Requirement: IMP7 — Serialización de un parámetro a jsonb según su clave, y advertencia para clave desconocida

El sistema MUST validar y serializar `parametro.valor` a `jsonb` según un parser propio por clave
conocida (Q3, R15: el negocio edita estos valores desde la hoja, nunca son constantes en código):
`horario_atencion` MUST validarse como JSON de un objeto cuyos valores son `null` o una cadena
`"HH:MM-HH:MM"`, y guardarse como ese objeto; `recargo_contraentrega_pct` y `factor_volumetrico` MUST
validarse y guardarse como un número jsonb. Una clave de texto (`mensaje_*`, `aviso_*`, `politica_*` o `prompt_estilo*`) MUST rechazarse con un error de validación que
nombre la fila y diga que los textos se editan en «Casos de uso» (CFG6): los textos son casos del asistente y `parametro`
solo guarda configuración del negocio. Una clave que no está en el registro de claves conocidas ni es de texto MUST NOT
producir un error — MUST producir una advertencia y guardarse tal cual, como valor jsonb de tipo cadena.

(Previously: el escenario de rechazo de una clave de texto citaba `mensaje_fuera_cobertura` y `aviso_datos`, que dejan de ser
claves del sistema en la Fase 12d; el rechazo por prefijo no cambia.)

Fase que lo implementa: 12d (ejemplos del escenario de rechazo)

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

#### Scenario: Una fila de texto se rechaza y dice dónde se editan los textos

- Dado un parámetro con la clave `politica_devoluciones`, `mensaje_error_llm`, `aviso_datos` o `prompt_estilo`,
- Cuando se valida el catálogo,
- Entonces el resultado incluye un error de validación en la columna `clave` de esa fila que menciona «Casos de uso», y no
  se importa nada.
