# Design: Fase 08b — Comportamiento del agente y fotos

- Change: `fase-08b-comportamiento-agente` · Fecha: 2026-10-01 · Estado: **diseño en revisión**
- Proposal: `proposal.md` · Specs: `agente` (AGT9, AGT13 modificados; AGT15-AGT17), `conversaciones`
  (R13 modificado), `catalogo` (CAT14 modificado; IMP14, IMP15), `medios` (MED8 modificado)
- ADRs: [0002](../../../docs/adr/0002-llm-y-openrouter.md) (prefijo estable), [0019](../../../docs/adr/0019-proveedores-llm-configurables.md)

## Technical Approach

Cuatro módulos tocados sin ningún puerto ni módulo nuevo: `agente` (prompt, herramientas, evals),
`catalogo` (fotos con ángulo, pie de foto, importador), `medios` (collage) y `plataforma/config` (una
variable). El agente sigue consumiendo `catalogo` solo por su barril (`index.ts`). El comportamiento que
**no se negocia** (dinero, datos, herramientas) queda en código y en `reglas`; lo que el dueño quiere
probar a voluntad (tono, formato, emojis) queda en `estilo`, un archivo aparte que la Fase 08c moverá a la
base de datos sin cambiar el ensamblador.

```
prompts/reglas.v2.md ─┐
prompts/estilo.v2.md ─┼─▶ EnsamblarPrompt ─▶ [reglas][estilo][catálogo compacto][turno]   (AGT13)
prompts/turno.v2.md  ─┘

enviar_fotos(id, angulo?) ─▶ ObtenerFotosProducto ─▶ { clave, angulosDisponibles, leyenda } ─▶ efecto
```

## Architecture Decisions

### D1: `reglas` y `estilo` son archivos distintos y la versión sube a `v2`

**Choice**: `reglas.v2.md` conserva datos solo de herramientas, dinero, herramientas, envíos y pagos y
ubicación. `estilo.v2.md` recibe «Quién eres», tono, longitud, formato (viñetas, sin pegotes), emojis y
cómo ofrecer fotos. `CargadorPrompts` carga los tres (`reglas`, `estilo`, `turno`) con una sola versión.
`EnsamblarPrompt` los une en el orden de AGT13.
**Alternatives**: dejar un solo archivo con una sección de estilo (el dueño no podría editar solo el
estilo); versiones por archivo (más piezas para registrar en el log). **Rationale**: el dueño quiere probar
estilos sin tocar lo no negociable; el cargador ya dice que un cambio de prompt sube la versión.

### D2: el modelo maneja el `id`, no el SKU

**Choice**: el catálogo compacto pasa de `- SKU: nombre — descripción` a `- id: nombre — descripción`;
`buscar_producto` y `obtener_ficha` dejan de devolver `sku`. `id_producto` sigue aceptando id o SKU como
entrada (AGT12). **Alternatives**: dejar el SKU visible y prohibir citarlo en el prompt (los evals reales
muestran que una orden de prompt no es una garantía; quitarlo del contexto sí lo es). **Rationale**: lo que
el modelo no ve no lo puede decir. **Costo**: el `id` es más largo que el SKU (≈ 10 tokens más por línea
del catálogo); aceptable con el catálogo actual y a revisar si crece mucho.

### D3: `foto.angulo` es texto nulo validado en código

**Choice**: columna `angulo text null` en `foto`. Los valores válidos (`frente`, `lateral_izquierdo`,
`lateral_derecho`, `detalle`, `uso`) viven en una constante del dominio de `catalogo` y se validan en el
importador y en la herramienta. Si un producto tiene dos fotos del mismo ángulo, gana la de menor `orden`.
**Alternatives**: enum de Prisma (cada ángulo nuevo exige migración); tabla de ángulos (excesivo). Primero
`MODELO_DATOS.md`, después `prisma/schema.prisma` (regla del repo); es decisión de esquema del dueño,
**ya dada (opción A)**. **Rationale**: nullable y sin índice nuevo, así que revertir es dejar de leerla.

### D4: `enviar_fotos` pierde el parámetro `modo`

**Choice**: `enviar_fotos({ id_producto, angulo? })` envía una sola foto. El contador de la sesión sigue
existiendo (`AGENTE_FOTOS_INDIVIDUALES_MAX`, ahora tope de fotos enviadas por sesión). La descripción de la
herramienta indica «una foto; pide otro ángulo solo si el cliente lo pide» y la ficha entrega la lista de
ángulos disponibles para que el modelo sepa qué puede pedir. La cantidad la hace cumplir el código, no el
prompt. **Alternatives**: mantener `modo` y solo cambiar el valor por defecto (el modelo puede pedir todas
de golpe, que es lo que pasa hoy).

### D5: el pie de foto lo arma `ObtenerFotosProducto`

**Choice**: `leyenda = "<nombre> — <descripción corta>\n<precio_texto>"`, calculada donde ya está el
formateo de dinero de CAT2, sin SKU. La `leyenda` ya viaja de punta a punta hasta el adaptador de
Chatwoot; solo falta rellenarla. **Rationale**: R2, el LLM no escribe cifras.
**Pendiente (Q1)**: si el dueño quiere atributos aparte (material, acabado, medidas), requeriría otra
columna y otra decisión de esquema; esta fase usa `descripcion_corta`.

### D6: collage opcional, sin casillas vacías

**Choice**: `CATALOGO_GENERAR_COLLAGE` (bool, `false`) lo gobierna; `ProcesarFotos` lo recibe por
configuración. `construirCollage` ajusta la grilla: 1 foto → sin collage; 2 → 2×1; 3 → 2×2 con la tercera
ocupando la fila inferior completa; 4 → 2×2; 5 → 2×3 con la quinta ocupando la fila inferior completa;
6 → 2×3. Causa del defecto actual: el lienzo es siempre 2×2 como mínimo, así que con una sola foto
quedan tres casillas en blanco.

### D7: aserciones de evals nuevas

**Choice**: `sin_emojis` y `sin_sku` entran al conjunto de aserciones de `test/evals/` con sus casos
negativos (una respuesta que sí los trae debe fallar). Los evals guionados prueban las aserciones; la
corrida real con el LLM decide si el modelo cumple (EVL3, `[manual]`).

## Configuración nueva

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `CATALOGO_GENERAR_COLLAGE` | `false` | El importador genera collage solo si es `true` |

`AGENTE_FOTOS_INDIVIDUALES_MAX` conserva nombre y valor (4) para no romper `.env` existentes; su descripción
pasa a «fotos enviadas por sesión».

## Riesgos de diseño

| Riesgo | Mitigación |
|---|---|
| El `id` largo encarece el catálogo compacto | Medir con el catálogo real; si pesa, un código corto interno en otra fase |
| Fotos viejas sin ángulo | Funcionan: la portada es la de por defecto y no se pueden pedir por ángulo hasta que se etiqueten |
| Alguien edita `estilo` y rompe una regla | Las reglas no negociables viven en `reglas`; en la 08c habrá versionado y evals antes de activar |
