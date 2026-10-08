# 0020. El estilo del agente se edita desde la base de datos, con el archivo como respaldo

- Estado: aceptada
- Fecha: 2026-10-01

> **Aceptada el 2026-10-01.** El dueño pidió poder cambiar el comportamiento del bot «a voluntad» sin
> desplegar (P45), eligió clave/valor en `parametro` y aprobó la versión completa (copia en memoria con versión
> en Redis), el tope de 4.000 caracteres y las 10 versiones de historial.
>
> **Enmienda 2026-10-07.** El tope sube de 4.000 a **10.000 caracteres** (`MAX_CARACTERES_ESTILO`). No lo impone
> ningún límite técnico: 10.000 caracteres son unos 2.500 tokens, lejos del contexto del modelo, y su costo se
> mide en `uso_llm`. Sigue siendo una baranda contra un descuido y contra un estilo que compita con las reglas;
> la calidad la miden los evals reales (`EVALS_ESTILO`), no el número. Donde este ADR dice 4.000, rige 10.000.

## Resumen

El **estilo** del agente (tono, longitud, formato, emojis, cómo ofrecer fotos) ya es un archivo aparte,
`estilo.v3.md` (Fase 08b). Se propone leerlo de `parametro` (`prompt_estilo`) con ese archivo como
respaldo, guardar las últimas 10 versiones para volver atrás, validar el texto antes de publicarlo y
mantener una **copia en memoria** que se invalida al publicar, para que el bot no consulte la base en
cada mensaje. Las **reglas no negociables** (dinero, datos, herramientas) y la plantilla del turno **no**
son editables: siguen en código.

## Contexto

- `CargadorPrompts` lee `reglas`, `estilo` y `turno` de `agente/prompts/*.v3.md` una sola vez al arrancar.
  Cambiar el estilo exige editar un archivo y desplegar.
- El agente ya lee textos del negocio de `parametro` con respaldo en código
  (`RepositorioParametroAgentePrisma`, AGT3, R15): una clave ausente, en blanco o que no es texto cae al respaldo.
- El catálogo compacto ya usa una copia en memoria con versión compartida en Redis (CAT4, CAT5): se invalida
  al instante en todos los procesos y tiene un TTL de respaldo de 5 minutos.
- AGT13 exige que el prefijo (reglas + estilo + catálogo) sea idéntico entre conversaciones para aprovechar la
  caché de prompts del proveedor (ADR-0002). Un cambio de estilo la rompe una sola vez y luego vuelve.
- No hay back office hasta las fases 11-14: hoy nadie edita una pantalla; se edita por línea de comandos.
- Los evals reales reprueban hoy al agente (EVL3): un cambio de prompt no debe llegar a clientes sin una corrida real.

## Alternativas

**Dónde se guarda el texto**

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | Clave/valor en `parametro` (`prompt_estilo`) + historial en otra clave | Sin migración ni cambio de esquema; reutiliza el patrón de textos del negocio (R15) | El historial es un `jsonb` y no una tabla: no hay consultas por versión ni vista previa |
| B | Tabla nueva `prompt` con versiones, autor y estado (borrador/activo) | Auditoría, vista previa y borradores de verdad | Es **decisión de esquema del dueño**; mucha más superficie para algo que hoy edita una sola persona |

**Cómo llega el cambio al bot**

| | Qué es | Gana | Paga |
|---|---|---|---|
| 1 | Leer la base en cada turno | Lo más simple; cambio inmediato | Una consulta más por mensaje |
| 2 | Copia en memoria con TTL corto | Sin Redis para esto | Cada proceso tarda hasta el TTL en enterarse |
| 3 | Copia en memoria + versión en Redis (patrón CAT5) | Cambio inmediato en todos los procesos y casi sin consultas | Una lectura de Redis por turno (microsegundos) |

## Decisión (A + 3)

1. **Qué es editable**: solo el estilo, la clave `prompt_estilo` de `parametro` (texto). `reglas` y `turno` siguen en
   archivos de código, versionados, no editables en ejecución.
2. **Respaldo**: si `prompt_estilo` no existe, está en blanco o no es texto, rige `estilo.v3.md`. El bot nunca
   se queda sin estilo.
3. **Validación antes de publicar** (función pura): no vacío, hasta 4.000 caracteres, sin valores en pesos
   (R1, R2), sin patrón de SKU (AGT16), sin marcadores de plantilla `{{...}}`. Un texto inválido se rechaza con el motivo.
4. **Historial**: al publicar, el texto anterior pasa a `prompt_estilo_historial` (arreglo con versión, texto y
   fecha, últimas 10). **Restaurar** una versión la publica como una versión nueva; nunca se reescribe el pasado.
5. **Copia en memoria con versión en Redis** (`agente:prompt:version`, como `catalogo:version`): cada turno compara
   la versión; si cambió, recarga de la base. TTL de respaldo de 5 minutos por si Redis pierde la clave. Si Redis falla,
   el turno lee la base y sigue.
6. **Cómo se edita hoy**: comando `npm run prompt:estilo` (`ver`, `historial`, `publicar --archivo <ruta>`,
   `restaurar --version <n>`). El back office de las fases 11-14 reutilizará los mismos casos de uso.
7. **Evals antes de clientes (EVL3)**: publicar no exige un eval, pero el comando recuerda correr la corrida real y
   el contenido del estilo nunca se escribe en logs (R14): solo la versión.

## Consecuencias

- **Gana**: probar tono y formato en minutos, sin desplegar y con vuelta atrás; el mismo mecanismo que usará el back office.
- **Paga**: el estilo vive ahora en dos lugares (archivo de respaldo y base); la caché de prompts del proveedor se
  rompe una vez por cada cambio; un estilo malo publicado llega al cliente hasta que alguien lo restaure.
- **Queda prohibido**: editar las reglas no negociables o la plantilla del turno desde la base; que el LLM escriba el
  estilo; guardar el texto del estilo en logs.
- **Queda obligatorio**: publicar solo por los casos de uso (que validan y guardan el historial); una corrida real
  de evals antes de exponer un estilo nuevo a clientes.
- **Se revisa** si aparece la necesidad de borradores, vista previa o auditoría por persona: entonces la alternativa B
  (tabla) con su decisión de esquema.
