# Cómo cambiar el estilo del bot

**Resumen.** El estilo del bot (tono, longitud, formato, emojis) es una lista de **secciones** que el admin crea, edita,
ordena y apaga desde la pantalla «Estilo del bot» (`/asistente/estilo`), sin desplegar y con vuelta atrás. El bot recibe
todas las secciones activas juntas, como un solo bloque. Cada versión guarda **quién la publicó**. Solo el estilo es
editable: las reglas de dinero, datos y herramientas no se pueden tocar. Antes de exponer un estilo nuevo a clientes, se
mide con los evals reales. Decisiones de fondo:
[ADR-0020](../adr/0020-estilo-del-agente-editable-desde-la-base-de-datos.md) y
[ADR-0026](../adr/0026-estilo-del-bot-en-secciones.md).

> Los comandos `npm run …` de esta guía se corren dentro de `servicio/` (o desde la raíz con
> `npm --prefix servicio run …`), y el `.env` es `servicio/.env` ([ADR-0023](../adr/0023-estructura-servicio-y-cliente.md)).

## Qué se puede y qué no

| Se puede editar | No se puede editar |
|---|---|
| Quién es el bot, el tono, la longitud de los mensajes | Que el modelo nunca calcula dinero ni inventa datos (R1, R2) |
| Viñetas, saltos de línea, uso de emojis | Cuándo usar cada herramienta, envíos, pagos, ubicación |
| Cómo ofrece fotos y cómo saluda | La plantilla del turno (horario, instrucciones) |

Si no hay estilo publicado, el bot usa el archivo del repositorio (`servicio/src/modulos/agente/prompts/estilo.v3.md`): nunca se
queda sin estilo.

## Las secciones

Una sección es un trozo del estilo con **título** (una línea, hasta 100 caracteres, único) y **texto**. Por ejemplo:
«Tono», «Longitud de los mensajes», «Emojis». Se componen en el orden de la lista; las apagadas no llegan al bot.

| Quiero… | Cómo |
|---|---|
| Agregar una sección | «Nueva sección» en la pantalla: queda al final |
| Cambiar una | Editarla en la ventana; si otro admin la cambió antes, la pantalla avisa y recarga la lista |
| Cambiar el orden | Botones de subir y bajar |
| Quitarla del bot | Apagarla. No hay borrado: se enciende de nuevo cuando haga falta |
| Ver el largo | El contador global muestra el total sobre 10.000 y avisa al llegar al 90 % |
| Volver a una versión | «Restaurar» en el historial: **reemplaza todas las secciones** por las de esa versión |

Cada cambio que altera el estilo compuesto guarda una **versión** (foto del compuesto) en el historial; un cambio que lo
deja igual no crea versión. El tope de **10.000 caracteres** se cuenta sobre el compuesto completo, no por sección. Un
texto de sección no puede tener líneas que empiecen por `# ` (partirían la sección). Las demás reglas están en
«Qué rechaza el comando».

## Cómo lo recibe el bot

El bot recibe **un solo bloque**: las secciones activas por orden, cada una como `# título`, una línea en blanco y su
texto. Va siempre en el prompt, como contexto, y **no es una herramienta**.

- **Por qué no una herramienta.** Que el modelo pidiera sus secciones agregaría una vuelta extra al LLM en cada turno
  (más latencia y costo) y correría el riesgo de que no las pidiera: el tono se perdería sin avisar.
- **Costo de leerlo.** Medido en local (2026-10-07): leer 9 secciones cuesta lo mismo que leer un solo texto
  (~0,55 ms p50). La comprobación de versión por turno es un `GET` de Redis (~0,36 ms).
- **Caché.** El bot guarda el texto compuesto en memoria, compara por turno la versión compartida en Redis y lo relee si
  cambió o pasaron 5 minutos. No consulta las secciones en cada mensaje.

## El estilo inicial de una base nueva

Una base nueva no queda con el estilo genérico del archivo: `npm run casos:sembrar` publica como **versión 1** el estilo
pensado para una tienda colombiana de grifos, accesorios de baño y lavaplatos de acero inoxidable (trato de «usted» por
defecto). El texto está en `servicio/prisma/datos/estilo-inicial.md` y queda partido en secciones por sus encabezados `# `.

- **Cuándo aplica.** Solo si `version_estilo` no tiene ninguna fila, ni vigente ni retirada. Si ya hay un estilo publicado
  (por la pantalla o por el comando), o aunque solo queden versiones retiradas, la semilla no hace nada y nunca pisa lo que
  alguien decidió. Es idempotente: una segunda corrida informa `estilo: ya existía`; la primera, `estilo: sembrado v1`.
- **Cómo se ve.** `npm run prompt:estilo -- ver` lo muestra como «versión 1, origen base de datos»; en la pantalla figura sin
  autor («Comando»), igual que lo publicado con el comando.
- **Cómo se cambia.** Como cualquier estilo: publicar uno nuevo (el flujo de abajo). Editar `estilo-inicial.md` solo afecta a
  bases nuevas; en una base que ya tiene versiones no cambia nada.
- **Cómo volver a él.** En una base que ya tiene versiones, publícalo como una versión nueva:
  `npm run prompt:estilo -- publicar --archivo prisma/datos/estilo-inicial.md` (desde `servicio/`). Sin él, el respaldo
  `estilo.v3.md` rige solo mientras la tabla esté vacía.

## Dónde vive y quién publicó

Desde la Fase 12 el historial vive en su propia tabla, `version_estilo` ([MODELO_DATOS.md](../../MODELO_DATOS.md)): una fila
por versión (la foto del estilo compuesto), con el texto, la fecha de publicación y el autor. La pantalla muestra la versión vigente con su autor y el
historial con el autor de cada versión. Lo publicado por la pantalla lleva el nombre del usuario; lo publicado con
`npm run prompt:estilo` no tiene usuario y se muestra como «Comando». Restaurar una versión deja como autor de la
versión nueva a quien restauró. El nombre se guarda tal como estaba al publicar: si el usuario cambia de nombre, el
historial no cambia.

La migración copió el estilo y su historial desde `parametro` conservando los números de versión. Las claves viejas
(`prompt_estilo`, `prompt_estilo_version`, `prompt_estilo_historial`) las borró la migración de limpieza: el estilo vive en
`seccion_estilo` (lo editable) y `version_estilo` (sus fotos).

## El flujo recomendado

1. **Escribe el estilo** en un archivo de texto, por ejemplo `mi-estilo.md`, con un encabezado `# ` por sección. Mira el
   actual con `npm run prompt:estilo -- ver` y parte de ahí.
   Para un cambio chico, edita la sección en la pantalla: es más simple que el archivo.
2. **Mídelo antes de publicarlo** con el LLM real (cuesta unos centavos, necesita tu clave de OpenAI):
   `EVALS_MODO=real EVALS_ESTILO=./mi-estilo.md npm run evals`. El estilo se publica solo en la base de la corrida, no en
   la tuya. Debe quedar **APROBADA**.
3. **Publícalo**: `npm run prompt:estilo -- publicar --archivo ./mi-estilo.md`. Reemplaza todas las secciones por las del
   archivo. El siguiente mensaje del bot ya lo usa.
4. **Pruébalo por WhatsApp** con una conversación real.
5. **Si no te gusta**, vuelve atrás (ver abajo).

## Los comandos

| Comando | Qué hace |
|---|---|
| `npm run prompt:estilo -- ver` | Muestra el estilo que usa el bot, su versión y si viene de la base o del archivo |
| `npm run prompt:estilo -- historial` | Lista las versiones anteriores (versión, fecha en que dejaron de estar vigentes y tamaño) |
| `npm run prompt:estilo -- secciones` | Lista las secciones del estilo (orden, activa o apagada, título y largo); no muestra sus textos. Para crearlas o editarlas usa la pantalla |
| `npm run prompt:estilo -- publicar --archivo <ruta>` | Valida y publica un estilo nuevo; lo parte por sus encabezados `# ` y reemplaza las secciones por esas partes |
| `npm run prompt:estilo -- restaurar --version <n>` | Publica el texto de una versión anterior como una versión nueva y vuelve a partirlo en secciones |

## Qué rechaza el comando

| Motivo | Por qué |
|---|---|
| Vacío | El bot no puede quedarse sin estilo |
| Más de 10.000 caracteres | Viaja en cada mensaje y no debe competir con las reglas |
| Un valor en pesos (`$389.000`) | El dinero solo sale de las herramientas (R1, R2) |
| Un SKU (`SKU-GL001`) | El SKU es interno y el cliente no lo ve |
| Marcadores `{{...}}` | Son de la plantilla del turno |

Un estilo rechazado no cambia nada: el vigente sigue igual y el comando termina con error y el motivo.

## Volver atrás

- **A una versión estable:** `npm run prompt:estilo -- historial` para ver las versiones y
  `npm run prompt:estilo -- restaurar --version <n>`. No borra nada: la restaurada pasa a ser una versión nueva (con sus secciones) y el
  historial conserva las anteriores (últimas 10).
- **Al archivo del repositorio:** vacía la tabla `version_estilo` (`DELETE FROM version_estilo;`; las secciones quedan, pero no rigen sin versión vigente). El bot vuelve al archivo
  en cuanto expira su copia (máximo 5 minutos) o alguien publica de nuevo.

## Cosas que conviene saber

- **Cuándo se nota el cambio.** Al instante: publicar sube una versión compartida en Redis y cada mensaje la compara. Si
  Redis falla en ese momento, el estilo queda publicado igual y los demás procesos lo toman en 5 minutos como máximo.
- **Costo.** El proveedor del LLM guarda en caché el inicio del prompt para abaratar. Cada cambio de estilo la rompe una
  vez; después vuelve a funcionar.
- **Privacidad.** El comando nunca escribe el texto del estilo en los logs (R14). Solo `ver` lo muestra, en tu terminal.
- **Editar a mano en la base.** No lo hagas: se salta la validación y el historial. La base garantiza una sola versión
  vigente (índice único parcial), pero no revisa el contenido.
- **El archivo de respaldo** también cambia con un commit (versión `v3` del prompt si hace falta); eso sí exige desplegar.

## Si algo no funciona

| Síntoma | Qué mirar |
|---|---|
| El comando dice «no se pudo leer el archivo» | La ruta; se resuelve desde donde ejecutas el comando |
| «No se publicó: …» | El motivo de la tabla de arriba |
| El bot sigue con el estilo anterior | Espera hasta 5 minutos y revisa que Redis esté arriba; `ver` muestra lo que usaría |
| `restaurar` dice que la versión no está en el historial | Mira `historial`: solo se guardan las últimas 10 |
