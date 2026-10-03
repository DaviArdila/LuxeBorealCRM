# Cómo cambiar el estilo del bot

**Resumen.** El estilo del bot (tono, longitud, formato, emojis) se cambia con un comando, sin desplegar y con
vuelta atrás. Solo el estilo es editable: las reglas de dinero, datos y herramientas no se pueden tocar. Antes de
exponer un estilo nuevo a clientes, se mide con los evals reales. Decisión de fondo:
[ADR-0020](../adr/0020-estilo-del-agente-editable-desde-la-base-de-datos.md).

## Qué se puede y qué no

| Se puede editar | No se puede editar |
|---|---|
| Quién es el bot, el tono, la longitud de los mensajes | Que el modelo nunca calcula dinero ni inventa datos (R1, R2) |
| Viñetas, saltos de línea, uso de emojis | Cuándo usar cada herramienta, envíos, pagos, ubicación |
| Cómo ofrece fotos y cómo saluda | La plantilla del turno (horario, instrucciones) |

Si no hay estilo publicado, el bot usa el archivo del repositorio (`src/modulos/agente/prompts/estilo.v3.md`): nunca se
queda sin estilo.

## El flujo recomendado

1. **Escribe el estilo** en un archivo de texto, por ejemplo `mi-estilo.md`. Mira el actual con
   `npm run prompt:estilo -- ver` y parte de ahí.
2. **Mídelo antes de publicarlo** con el LLM real (cuesta unos centavos, necesita tu clave de OpenAI):
   `EVALS_MODO=real EVALS_ESTILO=./mi-estilo.md npm run evals`. El estilo se publica solo en la base de la corrida, no en
   la tuya. Debe quedar **APROBADA**.
3. **Publícalo**: `npm run prompt:estilo -- publicar --archivo ./mi-estilo.md`. El siguiente mensaje del bot ya lo usa.
4. **Pruébalo por WhatsApp** con una conversación real.
5. **Si no te gusta**, vuelve atrás (ver abajo).

## Los comandos

| Comando | Qué hace |
|---|---|
| `npm run prompt:estilo -- ver` | Muestra el estilo que usa el bot, su versión y si viene de la base o del archivo |
| `npm run prompt:estilo -- historial` | Lista las versiones anteriores (versión, fecha en que dejaron de estar vigentes y tamaño) |
| `npm run prompt:estilo -- publicar --archivo <ruta>` | Valida y publica un estilo nuevo |
| `npm run prompt:estilo -- restaurar --version <n>` | Publica el texto de una versión anterior como una versión nueva |

## Qué rechaza el comando

| Motivo | Por qué |
|---|---|
| Vacío | El bot no puede quedarse sin estilo |
| Más de 4.000 caracteres | Viaja en cada mensaje y no debe competir con las reglas |
| Un valor en pesos (`$389.000`) | El dinero solo sale de las herramientas (R1, R2) |
| Un SKU (`SKU-GL001`) | El SKU es interno y el cliente no lo ve |
| Marcadores `{{...}}` | Son de la plantilla del turno |

Un estilo rechazado no cambia nada: el vigente sigue igual y el comando termina con error y el motivo.

## Volver atrás

- **A una versión estable:** `npm run prompt:estilo -- historial` para ver las versiones y
  `npm run prompt:estilo -- restaurar --version <n>`. No borra nada: la restaurada pasa a ser una versión nueva y el
  historial conserva las anteriores (últimas 10).
- **Al archivo del repositorio:** borra las filas `prompt_estilo`, `prompt_estilo_version` y `prompt_estilo_historial` de la
  tabla `parametro`. El bot vuelve al archivo en cuanto expira su copia (máximo 5 minutos) o alguien publica de nuevo.

## Cosas que conviene saber

- **Cuándo se nota el cambio.** Al instante: publicar sube una versión compartida en Redis y cada mensaje la compara. Si
  Redis falla en ese momento, el estilo queda publicado igual y los demás procesos lo toman en 5 minutos como máximo.
- **Costo.** El proveedor del LLM guarda en caché el inicio del prompt para abaratar. Cada cambio de estilo la rompe una
  vez; después vuelve a funcionar.
- **Privacidad.** El comando nunca escribe el texto del estilo en los logs (R14). Solo `ver` lo muestra, en tu terminal.
- **Editar a mano en la base.** No lo hagas: se salta la validación y el historial. Si ocurre, el bot lo usa igual (versión 1 si
  no hay versión) pero esa versión no queda en el historial.
- **El archivo de respaldo** también cambia con un commit (versión `v3` del prompt si hace falta); eso sí exige desplegar.

## Si algo no funciona

| Síntoma | Qué mirar |
|---|---|
| El comando dice «no se pudo leer el archivo» | La ruta; se resuelve desde donde ejecutas el comando |
| «No se publicó: …» | El motivo de la tabla de arriba |
| El bot sigue con el estilo anterior | Espera hasta 5 minutos y revisa que Redis esté arriba; `ver` muestra lo que usaría |
| `restaurar` dice que la versión no está en el historial | Mira `historial`: solo se guardan las últimas 10 |
