# Delta for configuracion-negocio

## Purpose

Sin importador (P79), la única forma de escribir `parametro` es el módulo `configuracion`. Se quita el escenario que
hablaba del importador.

## MODIFIED Requirements

### Requirement: CFG6 — `parametro` solo guarda configuración tipada del negocio

La tabla `parametro` MUST contener únicamente las claves del registro tipado de `configuracion`
(`horario_atencion`, `recargo_contraentrega_pct`, `factor_volumetrico`, `llm_techo_mensual_usd`, `llm_estado_techo`) y las
que otras fases declaren allí. Escribir una clave fuera del registro MUST rechazarse. Un valor guardado con el tipo
equivocado MUST ignorarse con un aviso y regir el valor por defecto del módulo dueño (comportamiento de hoy). `parametro`
MUST NOT contener claves `mensaje_*`, `aviso_*`, `politica_*` ni `prompt_estilo*`.

(Previously: además, el importador rechazaba una fila de texto en `parametros.csv`; el importador se retiró en la 13a.)

Fase que lo implementa: 12; 12d; 13a (sin importador)

#### Scenario: Escribir una clave fuera del registro se rechaza

- Dado una clave que no está en el registro tipado,
- Cuando el servicio intenta guardarla,
- Entonces el guardado se rechaza y no se escribe nada.

#### Scenario: Un valor del tipo equivocado rige el valor por defecto

- Dado `recargo_contraentrega_pct` guardado como un texto,
- Cuando el catálogo lo lee,
- Entonces registra un aviso y usa el valor por defecto, sin lanzar.

#### Scenario: Después de la limpieza no quedan textos ni estilo en parametro

- Dado una base con la fase aplicada y la semilla corrida,
- Cuando se consulta `parametro`,
- Entonces ninguna clave empieza con `mensaje_`, `aviso_`, `politica_` ni `prompt_estilo`.
