# Configuración del negocio

**Resumen.** El horario de atención, el recargo de contra entrega, el factor volumétrico y el techo mensual de gasto del
LLM se cambian por la API (y, desde la T10, por las pantallas de «Configuración») sin desplegar. Solo el rol `admin` puede
leerlos o cambiarlos. Lo que guardas rige desde el siguiente mensaje del cliente.

## Qué se puede cambiar

| Grupo | Ruta | Campos | Reglas |
|---|---|---|---|
| Horario | `GET`/`PUT /api/v1/configuracion/horario` | Un rango `desde`-`hasta` (`HH:MM`) por día, de `lun` a `dom`, o `null` si está cerrado | Un rango que cruza la medianoche (`22:00`-`02:00`) vale; `desde` y `hasta` no pueden ser iguales |
| Excepciones de horario | `POST /api/v1/configuracion/horario/excepciones`, `DELETE …/excepciones/{fecha}` | Una fecha `AAAA-MM-DD` y un motivo opcional | Una excepción deja ese día fuera de horario; una fecha solo puede tener una |
| Envíos | `GET`/`PUT /api/v1/configuracion/envios` | `recargoContraentregaPct`, `factorVolumetrico` | Recargo de 0 a 100 con hasta dos decimales; factor entero de 1 a 100.000 |
| Gasto del LLM | `GET`/`PUT /api/v1/configuracion/gasto-llm` | `techoMensualUsd` | Mayor que 0 y de hasta 10.000 USD |

La lectura del gasto trae además el estado del techo (aviso del 80 %, bloqueado) y el gasto del mes; esos dos datos los
escribe el sistema y la API los rechaza si los mandas.

## Cuándo se nota un cambio

| Qué cambias | Cuándo rige |
|---|---|
| Horario o excepciones | En la siguiente consulta de horario: se lee de la base cada vez |
| Factor volumétrico | En la siguiente cotización de envío |
| Techo del LLM | En la siguiente solicitud al modelo |
| Recargo de contra entrega | Queda guardado; el bot **no** lo dice ni lo calcula (R1, R2): lo usará el total de la venta de la Fase 13 |

Al guardar los envíos se descarta también la copia del catálogo en Redis. Si Redis falla en ese momento el valor queda
guardado igual, el servidor deja un aviso sin valores y la copia vieja caduca sola en 5 minutos.

## Si algo no funciona

| Síntoma | Qué mirar |
|---|---|
| `422 configuracion-invalida` | El `detail` nombra cada campo y la regla que rompió; no se guardó nada del grupo |
| `409 excepcion-duplicada` | Ya hay una excepción para esa fecha; bórrala y créala de nuevo si quieres cambiar el motivo |
| `422` al guardar el techo con un campo `estado` | El estado lo escribe el sistema; manda solo `techoMensualUsd` |
| El horario sale todo cerrado | Todavía no se ha guardado ninguno: mientras `horario_atencion` no exista, el bot se considera dentro de horario (HOR2) |
| Aviso `catalogo.parametro-invalido` en los logs | Una fila de `parametro` tiene el tipo equivocado y el catálogo usa el valor por defecto; guárdala de nuevo desde aquí |

## Qué guarda `parametro`

Solo estas cinco claves: `horario_atencion`, `recargo_contraentrega_pct`, `factor_volumetrico`, `llm_techo_mensual_usd` y
`llm_estado_techo`. Los textos que lee el cliente viven en [casos del asistente](casos-del-asistente.md) y el estilo del bot
en [estilo del bot](estilo-del-bot.md). Escribir otra clave por la API se rechaza.
