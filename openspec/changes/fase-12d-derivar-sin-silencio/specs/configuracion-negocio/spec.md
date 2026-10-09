# Delta for Configuración del negocio

Cambio mínimo: `mensaje_fuera_cobertura` deja de ser una clave del sistema (en las bases existentes pasa a ser el caso de uso
«Sin cobertura de envío», `asistente` CAS14), así que el escenario del importador ya no puede usarla como ejemplo. La regla no cambia: una
fila de texto en `parametros.csv` sigue rechazándose por su prefijo.

## MODIFIED Requirements

### Requirement: CFG6 — `parametro` solo guarda configuración tipada del negocio

La tabla `parametro` MUST contener únicamente las claves del registro tipado de `configuracion`
(`horario_atencion`, `recargo_contraentrega_pct`, `factor_volumetrico`, `llm_techo_mensual_usd`, `llm_estado_techo`) y las
que otras fases declaren allí. Escribir una clave fuera del registro MUST rechazarse. Un valor guardado con el tipo
equivocado MUST ignorarse con un aviso y regir el valor por defecto del módulo dueño (comportamiento de hoy). Tras esta
fase, `parametro` MUST NOT contener claves `mensaje_*`, `aviso_*`, `politica_*` ni `prompt_estilo*`, y el importador MUST
rechazar con un mensaje claro una fila de texto en `parametros.csv`.

(Previously: el escenario del importador usaba la fila `mensaje_fuera_cobertura`, que desde la Fase 12d es un caso de uso y no
una clave del sistema.)

Fase que lo implementa: 12; 12d (ejemplo del escenario del importador)

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

#### Scenario: El importador rechaza una clave de texto

- Dado un `parametros.csv` con una fila `politica_devoluciones`,
- Cuando se corre `npm run catalogo:importar`,
- Entonces termina con error que nombra la fila, indica que los textos se editan en Casos de uso, y no escribe nada (todo o nada).
