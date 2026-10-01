# Proposal: Fase 08b — Comportamiento del agente y fotos

- Change: `fase-08b-comportamiento-agente` · Fase de la hoja de ruta: **08b** · Rama: `fase-08b-comportamiento-agente`
- Fecha: 2026-10-01 · Estado: **aprobada** por el dueño (2026-10-01; Q1 y Q2 resueltas)
- Depende de: **08 cerrada**. Seguimiento previo: `odd/tasks/comportamiento-del-bot.md`.
- Siguiente: **08c — Prompts en base de datos** (fase aparte, ver «Out of Scope»).

## Intent

En pruebas reales con Chatwoot el agente usa emojis, responde pegado y sin viñetas, muestra el SKU al
cliente, manda un collage casi vacío o todas las fotos de golpe, y los evals reales lo reprueban
(`gpt-6-luna`: 5 críticas; `gpt-5.6-luna`: 0 críticas y 67,9 % en las no críticas). Esta fase corrige el
**comportamiento** sin tocar las reglas de negocio: separa lo no negociable de lo editable en el prompt,
deja el SKU como referencia interna, y cambia las fotos a «una por defecto, otra por ángulo bajo demanda,
cada una con su pie».

Éxito: una conversación de prueba sin emojis ni SKU, con una sola foto por defecto, la foto de otro
ángulo cuando el cliente la pide (con pie de foto), y una corrida real de evals por encima del umbral
(EVL3) con el prompt nuevo.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Estilo | Sin emojis, mejor tono, viñetas o listas cortas cuando ayuden, sin pegotes | Dueño, 2026-10-01 |
| SKU | Solo referencia interna; el cliente ve el nombre con sus atributos | P42 |
| Prompt | Lo **no negociable** en un archivo (`reglas`); el **estilo**, editable, en otro (`estilo`) | Dueño, 2026-10-01 |
| Fotos | Una por defecto (la portada); más solo si el cliente pide otro ángulo; cada una con pie de foto | Dueño, 2026-10-01 |
| Ángulo | Columna `angulo` opcional en `foto` (opción A): `frente`, `lateral_izquierdo`, `lateral_derecho`, `detalle`, `uso` | Dueño, 2026-10-01 |
| Tope de fotos | 6 por producto (sin cambio); P43 resuelta | P43 |
| Collage | Apagado por defecto, opcional por configuración; el dueño sube el suyo si quiere | P44 |

## Scope

### In Scope

1. **Prompt en dos archivos**: `reglas.v1.md` queda solo con lo no negociable (datos solo de herramientas,
   dinero, herramientas, envíos y pagos, ubicación) y un archivo nuevo `estilo.v1.md` con identidad, tono,
   longitud, emojis, formato y cómo ofrecer fotos. El ensamblador los une en ese orden (AGT13).
2. **Estilo nuevo** en `estilo.v1.md` y aserción de evals «sin emojis».
3. **SKU interno**: el modelo y el cliente dejan de ver el SKU (catálogo compacto y resultados de las
   herramientas); la clave que maneja el modelo es el `id` del producto. Una herramienta sigue aceptando un
   SKU como entrada (contexto inicial por `wa.me`, AGT12).
4. **Esquema**: `foto.angulo` (texto, nulo), con migración y `MODELO_DATOS.md` primero (decisión del dueño).
5. **Importador**: columna opcional `fotos_angulos` (mismo orden que `fotos`); el collage deja de
   generarse salvo que `CATALOGO_GENERAR_COLLAGE=true`; el collage opcional ya no deja casillas vacías.
6. **`enviar_fotos`** con portada por defecto y ángulo opcional; la ficha lista los ángulos disponibles.
7. **Pie de foto** (`leyenda`) armado en el backend: nombre del producto con su descripción corta y
   `precio_texto` (R2).
8. **Evals y e2e** nuevos con negativos; ajuste de los que asumían collage.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Prompts editables desde la base de datos (clave/valor en `parametro`, caché con invalidación, versionado) | **08c** | Es un cambio de arquitectura con ADR y spec propios; esta fase deja el estilo separado para que 08c solo cambie de dónde se lee |
| `CHATWOOT_API_TOKEN_LECTURA` obligatorio en producción | Cambio aparte | P41 sin responder; es un `superRefine` independiente |
| Anthropic, Google y endpoint compatible | Proveedores LLM T5-T7 | Pospuestos (P37) |
| Verificación real por WhatsApp y corrida real de evals | `[manual]` del dueño | Exigen Chatwoot, Meta y la clave de OpenAI |

## Qué se migra del prototipo

No aplica: es una mejora del código nuevo, no una migración. El prototipo no se consulta.

| Prototipo | Decisión | Motivo |
|---|---|---|
| (ninguno) | — | La fase no reemplaza tests ni reglas del prototipo |

## Preguntas abiertas

| Id | Estado | Nota |
|---|---|---|
| P43, P44, P45 | Resueltas por el dueño (2026-10-01) | P45 se ejecuta en la 08c |
| **Q1** — «nombre con atributos» | **Resuelta (2026-10-01)** | El pie usa `nombre` + `descripcion_corta`. Atributos aparte serían otra columna y otra decisión de esquema |
| **Q2** — formato del ángulo en la hoja | **Resuelta (2026-10-01)** | Columna `fotos_angulos` con los ángulos separados por `;` en el mismo orden que `fotos`; si falta, las fotos quedan sin ángulo |
| P41 | Sin responder | No bloquea esta fase |

## Risks

| Riesgo | Efecto | Mitigación |
|---|---|---|
| El modelo ignora el estilo aunque esté en el prompt | Sigue con emojis | Los evals guionados prueban la aserción; la corrida real (manual) decide el modelo |
| Quitar el SKU rompe la búsqueda por `wa.me` | El cliente llega con un producto y el bot no lo reconoce | La herramienta sigue aceptando SKU como entrada; escenario propio en AGT12 |
| Quitar el collage cambia lo que ve el cliente | Menos fotos de golpe | Es lo pedido; el collage queda opcional |
| T4 (migración) y T6 (herramienta) superan ~400 líneas por tests | PR grande | Excepción anticipada en `tasks.md` (size:exception) |

## Rollback

- Estilo y reglas: volver al `reglas.v1.md` anterior (un commit).
- Migración: `angulo` es nullable y no la lee nadie más; revertir el código deja la columna sin uso.
- Collage: `CATALOGO_GENERAR_COLLAGE=true` lo restituye sin código.
