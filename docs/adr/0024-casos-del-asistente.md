# 0024. Casos de uso del asistente, estilo en su propia tabla y configuración tipada

- Estado: propuesta (implementadas en la Fase 12: `version_estilo` (T3) y las tablas `categoria_caso` y `caso_asistente`, el módulo `asistente`, el puerto de textos y la semilla (T4), y el corte de `agente`, `conversaciones`, `catalogo` y `llm` al puerto de textos (T5); el resto sigue pendiente)
- Fecha: 2026-10-05
- Matiza: ADR-0020 (el estilo sigue siendo editable desde la base con el archivo como respaldo, pero deja de vivir en
  `parametro`)
- Se apoya en: ADR-0007 (UUID v7), ADR-0020, ADR-0022 y ADR-0023
- Aprueba el dueño: el **esquema** (tres tablas nuevas y el retiro de textos y estilo de `parametro`) es decisión suya.

## Resumen

Todo lo que el bot le dice al cliente pasa a ser un **caso de uso** guardado en tablas propias del módulo `asistente`,
con categorías creadas por el dueño y casos que agrega desde la pantalla. Los casos que el **código** dispara solo (audio,
error, traspaso…) se editan pero no se borran. El **estilo** se desacopla en su propia tabla `version_estilo`. `parametro`
queda solo con configuración del negocio, tipada y editable por formulario. Nada está en producción: se reestructura sin
migrar datos.

## Contexto

Hechos del repositorio al 2026-10-05:

- **Mensajes fijos** (Fase 11b): 10 claves cerradas declaradas en cuatro módulos (`agente/dominio/textos-fijos.ts`,
  `conversaciones/dominio/textos-fijos.ts`, `catalogo/dominio/textos-fijos.ts`, `llm/dominio/textos-fijos.ts`) y unidas en
  `mensajes-fijos/catalogo-real.ts`. Se editan desde la pantalla pero no se pueden agregar.
- **Políticas** (CAT12): filas `politica_<tema>` de `parametro` leídas por `consultar_politica`; abiertas, pero sin pantalla y
  dentro de `catalogo`.
- **Lectores sueltos**: cada módulo lee `parametro` con su propio repositorio y la clave escrita a mano
  (`repositorio-parametro-conversaciones-prisma.ts`, `repositorio-parametro-prisma.ts` de `catalogo`,
  `repositorio-parametro-llm-prisma.ts`, `repositorio-parametro-agente-prisma.ts`).
- **`parametro`** es una tabla clave/valor (`clave`, `valor` JSONB, `actualizado`) donde conviven textos al cliente, el estilo
  (`prompt_estilo`, `prompt_estilo_version`, `prompt_estilo_historial`, con el historial como un arreglo JSON armado a mano) y datos
  del negocio (`horario_atencion`, `recargo_contraentrega_pct`, `factor_volumetrico`, `llm_techo_mensual_usd`).
- El dueño quiere agregar casos nuevos, organizarlos en categorías, buscarlos y cambiar los datos del negocio desde la
  pantalla; quiere el estilo aparte y funcionando igual; y quiere una deuda técnica cero tras el refactor.

## Alternativas

**Dónde viven los casos**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Tablas `categoria_caso` y `caso_asistente`** | Modelo explícito (categoría, disparador, modo, activo); consultas, búsqueda y restricciones en la base; un dueño | Cambio de esquema (decisión del dueño); migración y semilla |
| B | Seguir en `parametro` con una convención de claves (`caso_<categoria>_<tema>`) | Sin migración | Sin categoría real, sin orden ni búsqueda sin escanear JSON, sin restricciones; el cajón sigue mezclado |
| C | Un JSON único con todos los casos en una fila de `parametro` | Una sola lectura | Edición concurrente pisa todo, sin restricciones, crece sin límite |

**Cómo se agregan los casos**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Disparador `evento` (lista cerrada en código, se edita) y `intencion` (abierta)** | El dueño agrega casos sin código; el bot nunca queda mudo en una situación que el código detecta | Un caso de evento no se puede crear desde la pantalla |
| B | Todo abierto y sin claves del sistema | Máxima libertad | El código no sabría cuál texto usar; borrar uno deja al bot mudo |

**Cómo los conoce el agente**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Índice en el prompt + herramienta `consultar_caso`** | El LLM decide con el «cuándo aplica» del dueño; el texto se cita literal (R1, R2) | Tokens del índice (acotado) |
| B | Todos los textos dentro del prompt | Sin herramienta | Cuesta tokens y mezcla datos con instrucciones |
| C | Detección por palabras clave | Determinista | Frágil ante cualquier forma de preguntar |
| D | RAG | Escala a miles | Innecesario para decenas; infraestructura nueva |

**Dónde vive el estilo**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Tabla `version_estilo` detrás del puerto `RepositorioEstilo`** | Una fila por versión, autor, historial sin JSON a mano; el resto del sistema no cambia | Migración que copia el estilo local |
| B | Dejarlo en `parametro` | Cero cambios | Sin autor; el historial sigue siendo un arreglo JSON; el cajón sigue mezclado |

**Cómo se edita la configuración del negocio**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Formularios tipados por grupo con registro Zod por clave** | Se valida al guardar; un error de tipeo no rompe el horario | Un controlador por grupo |
| B | Editor genérico clave/valor | Una sola pantalla | Un JSON mal escrito deja al bot sin horario |

## Decisión

1. **Regla de pertenencia**: si el cliente lo lee → caso de uso; si el código lo usa para calcular o decidir → parámetro del
   negocio; cómo habla el bot → estilo.
2. **Módulo `asistente`** dueño de todo lo que el bot le dice al cliente, con las tablas `categoria_caso` y `caso_asistente`.
   Cada caso tiene categoría, título único, «cuándo aplica», texto, modo `literal` o `guia`, disparador `evento` o `intencion`,
   clave del sistema opcional, activo y fecha de actualización.
3. **Casos del sistema**: una lista cerrada en `asistente/dominio/sistema.ts` (los diez mensajes fijos y `contra_entrega`)
   con respaldo en código. Se editan; no se crean desde la API, no se borran y no se desactivan.
4. **Un puerto único** `TextosAsistente` con copia en memoria invalidada por una versión en Redis (el mecanismo del estilo).
   Ningún otro módulo lee un texto desde `parametro`.
5. **`consultar_caso` e índice** de casos de intención en el prompt, con tope de 60 casos y 6.000 caracteres; reemplaza a
   `consultar_politica`. Los textos se validan como el estilo (sin pesos, SKU ni marcadores).
6. **Estilo en `version_estilo`** (versión, texto, vigente, fecha, autor con su nombre como instantánea), con índice único parcial
   de la vigente. El puerto `RepositorioEstilo` y su comportamiento externo no cambian.
7. **Módulo `configuracion`** con registro tipado por clave y formularios por grupo (horario con excepciones, recargo, factor
   volumétrico, techo de gasto del LLM); `parametro` solo guarda esas claves.
8. **Cliente**: menú lateral con submódulos y edición siempre en ventana emergente, con un componente compartido.
9. Se retiran `mensajes-fijos`, las políticas de `catalogo`, los lectores sueltos y `npm run mensajes:sembrar`; lo reemplaza
   `npm run casos:sembrar`.

## Consecuencias

**Gana el proyecto**

- El dueño crea, organiza y busca casos sin código, y cambia horario, recargo, factor volumétrico y techo desde la pantalla.
- Un dueño para los textos al cliente, una caché, una validación, un puerto.
- El estilo con autor e historial en filas, sin tocar su comportamiento.
- `parametro` deja de ser un cajón mezclado.

**Paga**

- Tres tablas nuevas y una migración que copia el estilo; la semilla retira de `parametro` lo que copia.
- El índice de casos agrega tokens a cada turno y exige evals nuevas y una corrida real antes de exponerlo (EVL3).
- Una situación nueva que el código deba detectar (p. ej. un video) sigue pidiendo código y una entrada en la lista del sistema.

**Queda obligatorio o prohibido**

- Prohibido leer un texto al cliente desde `parametro` fuera de `asistente` (test estático de fronteras).
- Prohibido guardar en `parametro` una clave que no esté en el registro tipado de `configuracion`.
- Obligatorio que todo caso del sistema tenga texto de respaldo en código y que el guardado rechace un texto vacío.
- Obligatorio validar el texto de un caso con las mismas reglas del estilo (R1, R2, AGT16, sin marcadores).
- Fuera de alcance, sin ADR todavía: historial de versiones de los casos (P61), escenarios con pasos ordenados y búsqueda
  con `pg_trgm` si la cantidad de casos llegara a miles.
