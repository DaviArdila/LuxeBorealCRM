# Catálogo: peso y medidas en la ficha del producto (`medidas_texto`)

Rama: `feat/medidas-en-ficha` (trabajo fuera de fase, solo ODD; no es parte de la Fase 12d). Origen: P74 de
`docs/PREGUNTAS_ABIERTAS.md`, resuelta por el dueño el 2026-10-09.

**Estado: sin empezar, a la espera de la orden del dueño.**

## Objetivo
Que el bot pueda decirle al cliente el peso y las medidas de un producto, con los mismos datos con los que se cotiza el envío.

## Problema
`armarFicha` (`servicio/src/modulos/catalogo/dominio/producto.ts:84`) no entrega peso ni medidas, y `FichaProducto`
(`producto.ts:31`) no tiene ese campo. El producto sí tiene `pesoGramos`, `largoMm`, `anchoMm` y `altoMm` (nulos si no se
cargaron), que el importador ya carga, pero hoy solo los usa `cotizar-envio.ts:42` para el peso facturable (CAT6,
`dominio/envio.ts`). Si el cliente pregunta cuánto pesa o mide algo, el bot no tiene de dónde sacarlo.

## Por qué
- El dueño quiere que el bot lo diga y que sea **consistente con el envío**: una sola fuente de datos para la ficha y para
  `cotizar_envio`.
- R1: el LLM solo sabe lo que le dan las herramientas. R2 no aplica (no es dinero), pero se sigue el mismo patrón: el backend
  arma el texto y el modelo lo cita tal cual.

## Alcance
- `armarFicha` agrega `medidasTexto`, armado por el backend desde `pesoGramos`, `largoMm`, `anchoMm` y `altoMm` (las mismas
  columnas que lee `cotizar_envio`), por ejemplo «Peso 800 g · 30 × 20 × 10 cm».
- `obtener_ficha` devuelve `medidas_texto` al modelo.
- CAT2 de `openspec/specs/catalogo/spec.md` se actualiza en el **mismo commit**, con sus escenarios.

## Restricciones
- No se calcula ni se inventa nada: un valor nulo se omite; sin ningún valor, `medidas_texto` queda vacío o no se envía.
- Sin cambios de esquema ni de importador.
- La conversión de unidades (mm → cm, g) es solo de formato y vive en el dominio de `catalogo`, con su prueba.
- Las reglas de seguridad del prompt no cambian (1: datos solo de herramientas; 2: citar tal cual).

## Tareas
- [ ] T1 — RED en `servicio/src/modulos/catalogo/dominio/producto.spec.ts` (ficha con todas las medidas, con alguna nula y sin
  ninguna); GREEN en `armarFicha` y `FichaProducto.medidasTexto`; salida `medidas_texto` de `obtener_ficha`; CAT2 en
  `openspec/specs/catalogo/spec.md` en el mismo commit. Ruta: inline o un escritor delegado si toca más de dos archivos no
  triviales.
- [ ] T2 `[manual]` — Confirmar con datos reales (consulta de solo lectura a `producto`) qué productos tienen las medidas
  cargadas; si faltan muchas, el dueño decide si completa el catálogo antes de anunciarlo.

## Criterios de aceptación
- Un producto con peso y medidas devuelve un `medidas_texto` legible armado por el backend.
- Un producto sin alguno de esos valores no muestra el que falta; ninguno se inventa.
- La ficha y `cotizar_envio` leen las mismas columnas.

## Verificación
`npm --prefix servicio test` (RED/GREEN de `producto.spec.ts`), `npm --prefix servicio run typecheck`,
`npm --prefix servicio run contrato:deriva`, `npm --prefix servicio run evals` y, antes del push, la batería completa de
`CLAUDE.md`.

## Entrega
Un PR a `main` de ~80 líneas (dentro del presupuesto de ~400). Commit de unidad de trabajo con Conventional Commits.

## Progreso
Sin empezar.

## Siguiente paso
Que el dueño dé la orden de empezar; entonces T1 con TDD y, en paralelo, la consulta de T2.
