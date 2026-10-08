# 0026. Estilo del bot en secciones: un bloque compuesto, no una herramienta

- Estado: propuesta
- Fecha: 2026-10-07

> **Nota 2026-10-07.** El tope de 4.000 caracteres que cita este ADR sube a 10.000 ([ADR-0020](0020-estilo-del-agente-editable-desde-la-base-de-datos.md), enmienda). Se sigue aplicando a la suma de las secciones activas.

## Contexto

El estilo del bot era un único texto (hasta 4.000 caracteres) en `version_estilo` ([ADR-0020](0020-estilo-del-agente-editable-desde-la-base-de-datos.md),
[ADR-0024](0024-casos-del-asistente.md)). Cambiar una sola regla exigía reescribir y republicar todo el texto, y dos
admins podían pisarse sin saberlo. Los casos del asistente ya se administran uno por uno, y se quiso lo mismo para el estilo.

Medición local (2026-10-07, Postgres real): leer 9 secciones cuesta lo mismo que leer un texto (~0,55 ms p50). La
comprobación de versión por turno sigue siendo un `GET` de Redis (~0,36 ms).

## Alternativas

| Opción | Lo bueno | Lo que cuesta |
|---|---|---|
| Un solo texto (estado anterior) | Simple | Editar es todo o nada; sin conflicto parcial; difícil de leer en la pantalla |
| Secciones como herramienta o a demanda, como los casos | El prompt lleva solo lo que se necesita | Una vuelta extra al LLM por turno (latencia y costo) y el riesgo de que no la invoque: el tono se perdería sin avisar |
| Secciones como filas versionadas por separado | Historial por sección | Restaurar y medir con evals exige reconstruir un estilo coherente desde versiones sueltas; rompe el historial único, la CLI y `EVALS_ESTILO` |
| Secciones agrupadas en categorías | Orden visual | Rechazada por el usuario: añade un nivel sin necesidad |

## Decisión

El estilo se compone de secciones (`seccion_estilo`): título único, texto, orden y activa o apagada, sin categorías ni
borrado. El bot sigue recibiendo **un solo bloque** como contexto siempre activo: las secciones activas por orden, cada
una como `# título` y su texto. `ProveedorEstilo` cachea ese texto compuesto como hasta ahora.

`version_estilo` pasa a ser la foto del compuesto: cada cambio que lo altera guarda una versión en la misma transacción,
de modo que el historial (diez versiones), restaurar, la CLI y los evals no cambian. Publicar un texto completo o
restaurar una versión reemplaza las secciones partiendo por `# `. El tope de 4.000 caracteres se aplica a la suma. La
edición usa bloqueo optimista por la marca `actualizado`. Requisitos: `EST-S1` a `EST-S5`, `EST-API` y `EST-CLI` en
[`openspec/specs/agente/spec.md`](../../openspec/specs/agente/spec.md).

## Consecuencias

- El admin cambia una regla sin tocar las demás; dos admins no se pisan (409 `seccion-modificada`).
- El prompt del bot no cambia de forma: los evals y la caché del proveedor siguen igual, y la equivalencia con el estilo
  inicial está probada.
- Se paga una tabla nueva y una migración que parte el estilo vigente por `# `.
- Un texto de sección no puede tener líneas que empiecen por `# ` (partirían la sección al restaurar).
- Queda prohibido convertir el estilo en herramienta sin medir antes el costo de la vuelta extra y el riesgo de omisión.
- Reordenar es con botones de subir y bajar; arrastrar queda fuera de alcance.
