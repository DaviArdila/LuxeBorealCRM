# Proposal: Fase 12 — Casos de uso del asistente, estilo desacoplado y configuración del negocio

- Change: `fase-12-casos-del-asistente` · Fase de la hoja de ruta: **12** · Rama: `fase-12-casos-del-asistente`
- Fecha: 2026-10-05 · Estado: **spec en revisión** (solo el dueño la pasa a `aprobada`)
- Depende de: **11a y 11b cerradas** (sesión, roles, cliente Angular) y fusionadas en `main`.
- ADR: [0024](../../../docs/adr/0024-casos-del-asistente.md) (`propuesta`). Se apoya en 0020, 0022 y 0023.

> **Numeración.** Esta fase se adelanta (nada está en producción, P8 enmendada otra vez). Los números 12-14 del plan
> anterior (Inventario, Ventas, API) se renumeran en el siguiente replanteo de la hoja de ruta; mientras tanto,
> «Fase 12» en el repositorio es esta.

## Intent

Lo que el bot le dice al cliente hoy está repartido en tres mecanismos que no se hablan entre sí:

- **Mensajes fijos**: 10 claves cerradas, declaradas en cuatro módulos (`agente`, `conversaciones`, `catalogo`, `llm`)
  y unidas en `mensajes-fijos/catalogo-real.ts`. Se editan, pero no se pueden agregar.
- **Políticas**: filas `politica_<tema>` de `parametro`, abiertas pero sin pantalla; viven dentro de `catalogo`.
- **Textos sueltos** en `parametro`, cada uno leído por el repositorio de su módulo con la clave escrita a mano.

`parametro` es un cajón clave/valor que mezcla textos al cliente, el estilo y datos del negocio. El dueño no puede
agregar un caso nuevo ni organizarlos, ni cambiar el horario, el recargo o el techo de gasto desde la pantalla.

Esta fase ordena todo con una regla: **si el cliente lo lee → caso de uso; si el código lo usa para calcular o
decidir → parámetro del negocio; cómo habla el bot → estilo.** Entrega:

1. **Casos de uso del asistente**: categorías y casos editables desde la pantalla (crear, editar, activar, borrar,
   buscar), con los 10 mensajes fijos y las políticas de hoy como datos semilla. Un caso sale tal cual (`literal`) o
   sirve de guía al LLM (`guia`). Los casos que el código dispara solo (audio, error, traspaso…) se editan pero no se
   borran.
2. **Estilo desacoplado** en su propia tabla (`version_estilo`), con «quién publicó», sin cambiar cómo funciona.
3. **Configuración del negocio** editable por formulario tipado: horario y excepciones, recargo, factor volumétrico y
   techo de gasto del LLM.
4. **Un menú lateral nuevo** con submódulos y **la edición siempre en ventana emergente**, como patrón único.

Éxito: el dueño crea la categoría «Pagos» y el caso «Medios de pago», pregunta por WhatsApp y el bot lo usa; edita el
texto del caso de audio y el siguiente audio lo usa; cambia el recargo y la siguiente cotización lo refleja; publica un
estilo desde la ventana emergente y ve quién lo publicó. Al cerrar no queda nada del sistema viejo.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Qué es un caso de uso | Todo lo que el cliente lee; reemplaza a los mensajes fijos y a las políticas | Dueño, 2026-10-05 |
| El estilo | Se queda aparte (comportamiento general, no un caso) y se desacopla en su propia tabla | Dueño, 2026-10-05 |
| Qué queda en `parametro` | Solo configuración del negocio que el código usa para calcular o decidir | Dueño, 2026-10-05 |
| Casos que dispara el código | Se editan, no se borran: el bot quedaría mudo en esa situación | Dueño, 2026-10-05 |
| Cómo se edita en el cliente | Siempre en ventana emergente, con un componente compartido | Dueño, 2026-10-05 |
| Menú lateral | Nuevo, con submódulos desplegables, preparado para inventario y ventas | Dueño, 2026-10-05 |
| Producción | Ninguno de los proyectos está en producción: no hay datos que migrar (P7) | Dueño, 2026-10-05 |

## Scope

### In Scope

1. Módulo `asistente` (`servicio/src/modulos/asistente/`): categorías, casos, lista cerrada de casos del sistema con su
   respaldo en código, puerto único de textos, validación, semilla `npm run casos:sembrar` y API de admin con buscador.
2. Los módulos `agente`, `conversaciones`, `catalogo` y `llm` leen sus textos del puerto del asistente; `consultar_politica`
   pasa a `consultar_caso` y el prompt recibe el índice de casos (`reglas.v4.md`).
3. Tabla `version_estilo` detrás del puerto `RepositorioEstilo` (que no cambia), con migración que copia el estilo local.
4. Módulo `configuracion`: registro tipado de parámetros, endpoints por grupo (horario, envíos, gasto del LLM) e
   invalidación de las cachés afectadas.
5. Cliente: menú lateral con submódulos, componente compartido de edición en ventana emergente, área `asistente`
   (Casos de uso, Estilo del bot) y área `configuracion` (Horario, Envíos, Gasto del LLM).
6. Limpieza: se borra el módulo `mensajes-fijos`, las políticas de `catalogo`, los lectores sueltos de `parametro`, la
   pantalla de mensajes fijos y `npm run mensajes:sembrar`.
7. Specs, ADR, guías de operación y contrato al día en el mismo trabajo.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Tarifas, cobertura y catálogo administrable (productos, fotos) | Fase posterior | Son tablas del catálogo, no parámetros ni casos |
| Escenarios con pasos ordenados y ejemplos del bot (11c original) | Pospuesto | Se retoma solo si un caso real lo pide; los casos con modo `guia` cubren lo común |
| Detección de casos por palabras clave o RAG | Descartado | Frágil / innecesario para decenas de casos (ADR-0024) |
| Historial de versiones de los casos | Posterior (P61) | Se protege la edición simultánea con la fecha de actualización |
| Inventario, ventas, POS | Fases posteriores | No dependen de esta |
| Cambios al bucle del LLM, a las conversaciones o al canal | — | Solo cambia de dónde salen los textos |
| Corrida de evals con el LLM real y prueba por WhatsApp | Dueño (`[manual]`, T12) | Necesitan su clave y su teléfono |

## Qué se migra del prototipo

| Pieza actual | Decisión | Motivo |
|---|---|---|
| Módulo `mensajes-fijos` (CFN1-CFN3, 10 claves) | rediseñar | Pasa a casos del sistema editables dentro de `asistente`; el módulo se borra |
| Políticas `politica_<tema>` y `consultar_politica` (CAT12, AGT8) | rediseñar | Pasan a casos de intención y `consultar_caso` con índice |
| Lectores sueltos de `parametro` para textos (`conversaciones`, `catalogo`, `llm`, `agente`) | descartar | Un único puerto del asistente (acoplamiento por clave escrita a mano) |
| Estilo en `parametro` (`prompt_estilo*`, AGT18-AGT22) | conservar el comportamiento, mover el dato | Tabla `version_estilo`; el puerto no cambia |
| Pantalla «Mensajes fijos» (CLT8) y el área `bot` | descartar / renombrar | La reemplaza «Casos de uso»; el área pasa a llamarse `asistente` |
| Filas de texto en `parametros.csv` y su importación | descartar | El importador solo acepta parámetros tipados; los textos de desarrollo viajan por `casos:sembrar` |

Ningún test del prototipo se reemplaza. Se reemplazan los tests de `mensajes-fijos` y de políticas por los de `asistente`.

## Preguntas abiertas

Registradas en `docs/PREGUNTAS_ABIERTAS.md` como P59 (Q1) a P63 (Q5). Ninguna bloquea: cada una tiene una
recomendación aplicada como defecto, salvo Q4, que es del dueño por tocar el esquema.

| Id | Pregunta | Recomendación aplicada |
|---|---|---|
| **Q1** (P59) | ¿Cómo se llama el concepto en la pantalla? | «Casos de uso» |
| **Q2** (P60) | ¿Un asesor puede ver o editar casos y configuración? | No: solo `admin`; el menú los oculta y el servidor responde `403` |
| **Q3** (P61) | ¿Los casos guardan historial de versiones como el estilo? | No en esta fase; se protege la edición simultánea con `actualizado` |
| **Q4** (P62) | ¿Se aprueban las tres tablas nuevas (`categoria_caso`, `caso_asistente`, `version_estilo`) y retirar del `parametro` los textos y el estilo? | **Decisión del dueño** (esquema): sin su aprobación no arranca T3 |
| **Q5** (P63) | ¿El importador deja de aceptar claves de texto en `parametros.csv`? | Sí: las rechaza con un mensaje claro y los textos de desarrollo pasan a `casos:sembrar` |

## Risks

| Riesgo | Efecto | Mitigación |
|---|---|---|
| El índice de casos crece y encarece o ensucia el prompt de cada turno | Más tokens, respuestas peores | Tope de 60 casos y 6.000 caracteres en el índice, con aviso en el log (sin contenido); evals con índice grande (D5) |
| Un caso mal escrito llega a los clientes (precios, SKU) | R1/R2/AGT16 rotos | Misma validación que el estilo en cada guardado; `literal` se cita palabra por palabra; evals guionadas con casos de cada modo |
| Recablear cuatro módulos cambia por accidente lo que responde el bot | Regresión | T4 y T5 «sin cambio de comportamiento»: las evals guionadas y los e2e existentes deben pasar sin editar sus aserciones |
| Un caso del sistema queda vacío o inexistente | El bot calla | Respaldo en código por clave; un texto vacío se rechaza al guardar; sin fila rige el respaldo y el turno sigue |
| La migración del estilo pierde versiones | Pérdida del historial local | La migración copia vigente e historial con sus números de versión, con test de integración y comprobación `[manual]` |
| Cachés de configuración que no se invalidan | El cambio no rige | Una prueba por clave: guardar y leer en el siguiente mensaje (CFG5) |
| El horario por día no coincide con el formato que lee `horario/` | El bot cree que está abierto o cerrado de más | T9 verifica el lector contra claves de un solo día y escribe los siete días explícitos |
| Un cliente (Angular) que crece sin orden con el menú y las ventanas | Rehacer pantallas después | El menú y el diálogo van primero (T1, T2) y las pantallas nuevas nacen con ellos |
| Tareas de T4, T7, T8, T9 y T10 pasan de ~400 líneas | PR grande | Excepción anticipada aquí: esquema generado, cliente HTTP generado y ~60 % de tests no son autoría; `size:exception` automática en `tasks.md` |
| Colisión de numeración (12-14 del plan anterior) | Confusión de referencias | Nota al inicio de este documento y en `docs/fases/README.md`; se renumera en el replanteo |

## Rollback

- Cada slice es un commit revertible. Las tablas nuevas se agregan sin borrar nada hasta T11 (limpieza), así que
  revertir T4-T10 deja el bot como en la 11b.
- `version_estilo` se pobla copiando de `parametro`; las filas viejas se borran **solo en T11**. Hasta entonces se puede
  volver al adaptador anterior sin pérdida.
- T11 (borrado de lo viejo) es el único punto sin vuelta fácil: se hace al final, con la batería completa y las evals
  guionadas en verde; su revert restaura el código y los datos de `parametro` se recuperan con la semilla.
