# Proposal: Políticas del negocio como parámetros, contra entrega y fuera de cobertura

- Change: `politicas-contraentrega` (mantenimiento previo a la Fase 07, no es una fase) · Fecha:
  2026-09-29 · Estado: **spec en revisión** (redactada, pendiente de aprobación del usuario)
- Depende de: Fases 00a-06 cerradas. Toca `modulos/catalogo` (Fases 02/03), `compartido/dinero` (00a) y
  el texto de las specs `catalogo`, `compartido` y `agente`.
- Insumo: la conversación del 2026-09-29 con el usuario (decisiones abajo), `MODELO_DATOS.md`
  (tabla `parametro`), `docs/PREGUNTAS_ABIERTAS.md` (P4) y el código de
  `src/modulos/catalogo/{aplicacion,dominio,infraestructura}/`.

## Intent

Hoy el bot no tiene dónde apoyarse para hablar de las condiciones del negocio (contra entrega,
devoluciones, garantía…): nada de eso está escrito en el proyecto. Además hay dos textos al cliente
que no dicen lo que el negocio quiere:

- **El recargo contra entrega se cita como porcentaje** (`5% adicional si pagas contra entrega`), y si
  el parámetro no está cargado el código asume 0 % y la ficha diría «0% adicional», que es falso. El
  negocio quiere que el cliente solo sepa que el recargo **se suma al total de su compra**; el
  porcentaje es un dato interno (Fase 13) y, si el cliente lo pregunta, lo responde un asesor.
- **El texto de fuera de cobertura promete un contacto** («Un asesor revisará tu caso y te
  contactará») que solo sería cierto cuando la Fase 08 defina el seguimiento.

Este cambio da a las políticas del negocio un lugar único y editable, y corrige esos dos textos, **antes**
de que la Fase 07 conecte estos servicios al LLM.

## Decisiones ya tomadas por el usuario (no se reabren)

| Tema | Decisión |
|---|---|
| Recargo al cliente | Nunca se dice el porcentaje; solo que el recargo «se suma al total de tu compra». El 5 % queda como dato interno (`recargo_contraentrega_pct`, Fase 13) |
| Política de contra entrega | Texto aprobado el 2026-09-29 (ver `design.md` D3); se envía al cliente y sirve de contexto cuando pregunten |
| Políticas del negocio | Una política = una fila `politica_<tema>` de la tabla `parametro`; cualquier tema ajeno a productos (devoluciones, garantía…) se agrega como una fila, sin tocar el código |
| Herramientas del LLM | Las políticas son la séptima herramienta (`consultar_politica`), que construye la Fase 07 |
| Cobertura | Sigue siendo por exclusión (lista corta de lugares sin cobertura); sin cambio |
| Fuera de cobertura | Texto sin promesa, editable en `parametro.mensaje_fuera_cobertura` |
| Carga | Sigue por la hoja/CSV actual; el reemplazo por archivo con exportación previa es el ADR-0015, cambio aparte |

## Scope

### In Scope

1. **Convención `politica_<tema>`** en `parametro`: validación en el importador (texto no vacío, hasta
   1.200 caracteres, tema en minúsculas/dígitos/guion bajo) y lectura genérica por tema.
2. **Caso de uso `ConsultarPolitica`** en `catalogo` (que la Fase 07 expone como herramienta) con puerto
   `RepositorioPolitica`, adaptador Prisma y el texto aprobado de `contra_entrega` como respaldo.
3. **La cotización de envío con contra entrega devuelve `politica_contraentrega_texto`** para que el bot
   la cite literal; sin contra entrega no la incluye.
4. **La ficha deja de exponer el recargo**: se elimina `recargo_contraentrega_texto`, el puerto deja de
   leer el porcentaje y se retira `formatearRecargoContraentrega` de `compartido/dinero`.
5. **Texto de respaldo de fuera de cobertura** sin promesa: «Por ahora no tenemos cobertura de envío a
   tu ciudad. Si quieres, indícame otra dirección de entrega.»
6. **Specs y docs:** deltas de `catalogo` (CAT2, CAT10, CAT11, IMP7, CAT12 nuevo), `compartido` (CMP1) y
   `agente` (R1: siete herramientas; R2: recargo sin porcentaje), `MODELO_DATOS.md` e inventario.

### Out of Scope

| Qué | Dónde |
|---|---|
| La herramienta `consultar_politica`, su registro en el motor y la regla de **cuándo** citar cada política (solo cuando preguntan por envío o pago, o al confirmar el pedido, una vez) | Fase 07 |
| Exportar la base a `.xlsx`/CSV, control de versión por fila, vista previa y retiro de Google Sheets | ADR-0015 (propuesta), cambio propio posterior a la Fase 07 |
| Pantalla de edición de políticas y sincronización desde el cliente | Fases 11 y 14 |
| Calcular el total de una venta con el recargo | Fase 13 |
| Cambios de esquema Prisma | Ninguno: `parametro` ya guarda cualquier clave |

## Qué se migra del prototipo

No aplica: en el prototipo no existía una política de contra entrega ni la idea de políticas como datos.

## Capabilities

### Modified Capabilities

- `catalogo`: CAT2 (ficha sin recargo), CAT10 (cotización con la política de contra entrega), CAT11
  (texto por defecto sin promesa), IMP7 (reglas de las claves `politica_*`); **CAT12 nuevo** (políticas
  del negocio).
- `compartido`: CMP1 (deja de formatear el recargo).
- `agente`: R1 (siete herramientas, incluye `consultar_politica`), R2 (el recargo no se cita como
  porcentaje). Su implementación es de la Fase 07; aquí solo se actualiza el texto de la spec.

## Approach

Cinco tareas, cada una con su commit: (T1) funciones puras de política; (T2) reglas del importador;
(T3) puerto, adaptador y caso de uso `ConsultarPolitica`; (T4) cotización con política, ficha sin recargo y
retiro del formateador; (T5) texto de fuera de cobertura, `MODELO_DATOS.md` e inventario. TDD estricto, un
RED observado por tarea. Entrega en 3 PRs apilados dentro del presupuesto de 400 líneas (ver `tasks.md`).

## Affected Areas

| Área | Impacto |
|---|---|
| `src/modulos/catalogo/{dominio,aplicacion,puertos,infraestructura}` | Nuevo `politica.ts`, `consultar-politica.ts`, `repositorio-politica*.ts`; cambios en `producto.ts`, `envio.ts`, `cotizar-envio.ts`, `obtener-ficha-producto.ts`, `validar-catalogo.ts`, `repositorio-parametro-prisma.ts` |
| `src/compartido/dinero/` | Se elimina `formatearRecargoContraentrega` y su test |
| `openspec/specs/{catalogo,compartido,agente}/` | Se actualizan al archivar |
| `MODELO_DATOS.md`, `docs/migracion/inventario.md` | Documentan la convención y el recargo interno |
| `prisma/`, `openapi/` | Sin cambio |

## Risks

| Riesgo | Mitigación |
|---|---|
| Alguien depende de `recargo_contraentrega_texto` o de `obtenerRecargoContraentregaPct` | Se verifica con búsqueda en todo `src/` y `test/` antes de borrar; hoy solo los consumen la ficha y sus tests |
| Una política enorme infla cada conversación | Tope de 1.200 caracteres validado al importar |
| El bot cita una política de forma distinta a su texto | Es del motor de la Fase 07: la regla «cita literal» y sus evals; aquí el servicio solo entrega texto listo |
| Una fila `politica_*` mal escrita en la hoja | El importador la rechaza con pestaña, fila y columna; todo o nada, la base queda como estaba |

## Rollback Plan

Revertir los PRs. No hay migración de esquema ni datos que deshacer: las filas `politica_*` de `parametro`
son inertes sin el código (IMP7 ya las guardaría como una clave desconocida con una advertencia).

## Dependencies

Ninguna externa. La Fase 07 consume el resultado de este cambio.

## Preguntas abiertas

Ninguna bloqueante: los textos y el alcance los aprobó el usuario el 2026-09-29. Queda como criterio
propio, revisable en la review de esta spec: el tope de 1.200 caracteres por política.

## Success Criteria

- [ ] Una política `politica_<tema>` cargada por el importador se consulta por tema y se devuelve tal cual.
- [ ] `politica_contra_entrega` sin cargar devuelve el texto aprobado; un tema inexistente no inventa texto.
- [ ] La cotización con contra entrega incluye la política; sin contra entrega no.
- [ ] Ninguna respuesta del servicio de catálogo contiene un porcentaje de recargo.
- [ ] El texto de fuera de cobertura por defecto no promete ningún contacto.
- [ ] `npm run verify` en verde; cada escenario nuevo o modificado tiene su test `<ID> — <título>`.
