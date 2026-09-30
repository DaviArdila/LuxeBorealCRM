# Delta for llm

## Purpose

La pasarela deja de hablar solo con OpenRouter: cada modelo del perfil puede llevar un prefijo de
proveedor y conectarse directo con la clave de ese proveedor (`docs/adr/0019-proveedores-llm-configurables.md`,
**propuesta**). Sin prefijo el proveedor es OpenRouter, así que el comportamiento vigente no cambia sin
configuración nueva. El puerto `LlmPort`, el gateway (timeout, reintento, circuito, techo) y **R1/R2/R14**
no cambian. Los proveedores concretos los elige el usuario (P37); esta spec fija el contrato, no la lista.

## Nota de implementación

Igual que en la spec vigente: cada test MUST nombrarse `"<id> — <título del escenario>"` con el título
exacto de abajo. El prefijo `LLM#` continúa desde LLM14.

## MODIFIED Requirements

### Requirement: LLM11 — Adaptadores de proveedor sin reintentos propios (ADR-0002, ADR-0019)

Todo adaptador de proveedor MUST vivir solo en `modulos/llm/infraestructura`; ese directorio MUST ser
el único lugar donde aparecen `ai` y cualquier SDK de proveedor (`@openrouter/ai-sdk-provider`,
`@ai-sdk/*`), y MUST NOT reintentar por su cuenta: ante un fallo hace exactamente un intento contra el
proveedor y propaga el error al gateway, que es el único que decide reintentos, fallback y circuito
(restricción de ADR-0002, no una opción).

(Previously: el adaptador AI SDK sobre OpenRouter era el único lugar donde aparecían `ai` y
`@openrouter/ai-sdk-provider`.)

Fase que lo implementa: 06; ampliado por `proveedores-llm-configurables`

#### Scenario: LLM11 — Adaptador fallido hace un solo intento y propaga el error

- Dado un proveedor que responde un error reintentable,
- Cuando el adaptador ejecuta la llamada,
- Entonces hace exactamente un intento contra el proveedor y propaga el error al gateway sin esperar
  ni reintentar por su cuenta.

#### Scenario: LLM11 — SDK del proveedor solo aparece en la infraestructura de llm

- Dado el árbol de `src/`,
- Cuando corre `npm run fronteras`,
- Entonces ningún import de `ai`, `@openrouter/ai-sdk-provider`, `@ai-sdk/*` ni de otro SDK de
  proveedor fuera de `modulos/llm/infraestructura` pasa la verificación.

## ADDED Requirements

### Requirement: LLM15 — El proveedor se elige por el prefijo del modelo, con OpenRouter por defecto

Un id de modelo de `LLM_*_MODELOS` MUST poder escribirse como `<proveedor>:<modelo>`; el gateway MUST
llamar al proveedor indicado con el id de modelo que sigue al prefijo. Un id sin prefijo MUST
resolverse a OpenRouter con el id completo, exactamente como antes. La fila de `uso_llm` MUST llevar el
proveedor real de cada intento. La configuración por defecto MUST producir el mismo comportamiento que
la vigente.

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM15 — Un id sin prefijo se llama a OpenRouter como hoy

- Dado un perfil cuyo modelo es `openai/gpt-5.6-luna` (sin prefijo de proveedor),
- Cuando se pide una generación,
- Entonces la llamada va a OpenRouter con el id `openai/gpt-5.6-luna` y la fila de `uso_llm` lleva el
  proveedor `openrouter`.

#### Scenario: LLM15 — Un id con prefijo se llama directo al proveedor indicado

- Dado un perfil cuyo modelo es `openai:<modelo>` y la clave de ese proveedor configurada,
- Cuando se pide una generación,
- Entonces la llamada va al proveedor `openai` con el id `<modelo>` (sin el prefijo) y la fila de
  `uso_llm` lleva el proveedor `openai`.

### Requirement: LLM16 — La resolución del proveedor no es ambigua

El prefijo MUST contar como proveedor solo si es un proveedor registrado y no contiene `/`; el
separador es la primera `:`. Un id de OpenRouter con `/` o con sufijo (`:free`, `:nitro`) sin prefijo
registrado MUST resolverse a OpenRouter intacto. Un prefijo con forma de proveedor pero no registrado
MUST impedir el arranque nombrando la variable, sin imprimir claves.

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM16 — Un id de OpenRouter con barra o sufijo no se toma por prefijo

- Dados los ids `meta-llama/llama-3-8b:free` y `openai/gpt-5.6-luna`,
- Cuando se resuelve el proveedor de cada uno,
- Entonces ambos resuelven a OpenRouter con el id completo, sin recortar nada.

#### Scenario: LLM16 — Un prefijo de proveedor desconocido impide el arranque

- Dada una variable `LLM_*_MODELOS` con un id `desconocido:modelo`,
- Cuando se intenta arrancar la aplicación,
- Entonces el proceso no acepta tráfico y el error nombra la variable y el prefijo, sin imprimir
  ningún valor secreto.

### Requirement: LLM17 — Claves por proveedor, exigidas solo al proveedor usado

Cada proveedor MUST tener su propia variable de clave. En producción (`NODE_ENV=production`) MUST exigirse
la clave únicamente de los proveedores que algún perfil usa; la clave de un proveedor que ningún perfil
usa MUST NOT ser obligatoria. Los tests y el desarrollo MUST arrancar sin claves reales (**R15**,
PLT1).

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM17 — Producción exige la clave de cada proveedor usado

- Dado `NODE_ENV=production` y un perfil con un modelo `openai:<modelo>` sin la clave de `openai`,
- Cuando se intenta arrancar la aplicación,
- Entonces el proceso no acepta tráfico y el error nombra la variable de clave que falta.

#### Scenario: LLM17 — Un proveedor sin uso no exige clave

- Dado `NODE_ENV=production` con todos los modelos de los perfiles sin prefijo (solo OpenRouter),
- Cuando se intenta arrancar sin la clave de ningún proveedor directo,
- Entonces la aplicación arranca si `OPENROUTER_API_KEY` está presente.

### Requirement: LLM18 — Uso y caché normalizados por adaptador hacia UsoReportado

Cada adaptador MUST convertir lo que su proveedor reporta a `UsoReportado` con la misma semántica:
`tokensEntrada` **sin** los tokens servidos desde caché, `tokensSalida` y `tokensCache`. El gateway MUST
recibir siempre `UsoReportado` y MUST NOT leer metadatos propios de un proveedor. Si el proveedor no
reporta la caché, `tokensCache` MUST ser 0.

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM18 — Un proveedor que incluye la caché en la entrada se separa

- Dado un proveedor que reporta 1 000 tokens de entrada de los que 400 vienen de caché,
- Cuando el adaptador arma el uso,
- Entonces `tokensEntrada` es 600 y `tokensCache` es 400.

#### Scenario: LLM18 — Un proveedor sin dato de caché reporta cero

- Dado un proveedor que no informa tokens de caché,
- Cuando el adaptador arma el uso,
- Entonces `tokensCache` es 0 y `tokensEntrada` es el total reportado.

### Requirement: LLM19 — El costo sale de LLM_PRECIOS_USD_JSON con el id completo (R13, R15)

El costo estimado de cada intento MUST calcularse con el precio de `LLM_PRECIOS_USD_JSON` cuya clave
es el id de modelo **tal como se configuró** (con prefijo si lo tiene), sin depender de ningún costo
que devuelva el proveedor. Los modelos de perfil MUST tener precio (D6 de la Fase 06). Un modelo sin
precio MUST seguir dejando `0` y un `warn` sin contenido, como hoy.

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM19 — El costo se calcula con el precio del id configurado

- Dado un modelo `openai:<modelo>` con precio en `LLM_PRECIOS_USD_JSON` y un uso reportado,
- Cuando el gateway registra el intento,
- Entonces `costoEstimadoUsd` sale de ese precio y de `UsoReportado`, aunque el proveedor devolviera
  otro valor de costo.

#### Scenario: LLM19 — Un perfil con un modelo sin precio impide el arranque

- Dado un perfil con `openai:<modelo>` que no está en `LLM_PRECIOS_USD_JSON`,
- Cuando se intenta arrancar la aplicación,
- Entonces el proceso no acepta tráfico y el error nombra la variable del perfil.

### Requirement: LLM20 — Un archivo por SDK de proveedor y fronteras

Cada SDK de proveedor MUST importarse en un único archivo de `modulos/llm/infraestructura`; el mapeo de
mensajes, herramientas y la clasificación de errores MUST vivir una sola vez, en el adaptador genérico.
La regla de fronteras MUST cubrir `@ai-sdk/`.

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM20 — Cada SDK de proveedor aparece en un solo archivo

- Dado el árbol de `src/modulos/llm/infraestructura`,
- Cuando se buscan los imports de cada paquete `@ai-sdk/*` y `@openrouter/*`,
- Entonces cada paquete aparece en exactamente un archivo, y `ai` solo en el adaptador genérico.

#### Scenario: LLM20 — La regla de fronteras rechaza un SDK de proveedor fuera de infraestructura

- Dado un archivo fuera de `modulos/llm/infraestructura` que importa un paquete `@ai-sdk/*`,
- Cuando corre `npm run fronteras`,
- Entonces la verificación falla nombrando la regla `ai-solo-en-infraestructura-llm`.

### Requirement: LLM21 — El fallback puede cruzar proveedores (nivel 1); el nivel 2 sigue pospuesto

Un perfil MUST poder mezclar ids de distintos proveedores; el gateway MUST recorrerlos en orden como
en LLM5, una llamada por modelo, con su fila en `uso_llm` y su circuito por id completo. El nivel 2
(`ULTIMO_RECURSO_LLM`) MUST seguir sin implementación. Si fallan todos los modelos del perfil, el error
tipado MUST ser `proveedor-caido`, como hoy.

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM21 — La caída de un proveedor deriva al modelo de otro proveedor

- Dado un perfil con `openai:<modelo>` seguido de `anthropic:<modelo>` y el primer proveedor caído,
- Cuando se pide una generación,
- Entonces el llamador recibe la respuesta del segundo proveedor y `uso_llm` registra el intento
  fallido con proveedor `openai` y el exitoso con proveedor `anthropic`.

#### Scenario: LLM21 — Con todos los modelos caídos el error sigue siendo proveedor-caido

- Dado un perfil cuyos modelos, de proveedores distintos, fallan todos,
- Cuando se pide una generación,
- Entonces el gateway devuelve el error tipado `proveedor-caido` sin llamar a ningún último recurso.

### Requirement: LLM22 — Los errores se clasifican igual con cualquier proveedor

Cada adaptador MUST clasificar sus fallos con la misma regla de hoy: aborto o timeout, 408, 429 y 5xx
como `reintentable`; cualquier otro 4xx como `no-reintentable`; un error sin respuesta como
`reintentable`. La clasificación MUST vivir una sola vez (LLM20).

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM22 — Un 429 y un 5xx de un proveedor directo son reintentables

- Dado un proveedor directo que responde 429 o 503,
- Cuando el adaptador clasifica el fallo,
- Entonces lo propaga como `reintentable` con su estado HTTP.

#### Scenario: LLM22 — Una clave rechazada por un proveedor directo no se reintenta

- Dado un proveedor directo que responde 401 o 403,
- Cuando el adaptador clasifica el fallo,
- Entonces lo propaga como `no-reintentable` y el gateway no repite el intento contra ese modelo.

### Requirement: LLM23 — R1, R2 y R14 no cambian con ningún proveedor

Ningún adaptador MUST interpretar definiciones ni llamadas de herramientas, ni calcular dinero (R1,
R2); los metadatos del proveedor de una llamada de herramienta MUST volver idénticos en el turno
siguiente (B7). Ningún adaptador MUST emitir prompts, respuestas ni datos personales a logs o trazas
(R14, LLM10).

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM23 — Los metadatos de una llamada de herramienta vuelven idénticos con un proveedor directo

- Dado que un proveedor directo devuelve una llamada de herramienta con metadatos propios,
- Cuando el turno siguiente reenvía esa llamada al mismo proveedor,
- Entonces los metadatos viajan idénticos y sin interpretar.

#### Scenario: LLM23 — Los logs del adaptador directo no contienen contenido ni PII

- Dada una generación con prompt, herramientas y respuesta cualesquiera contra un proveedor directo,
- Cuando se inspeccionan los logs emitidos,
- Entonces ninguno contiene el texto del prompt ni de la respuesta, ni números completos, cédula,
  correo o tokens.

### Requirement: LLM24 — Las claves nunca se registran

Ninguna clave de proveedor MUST aparecer en logs, trazas, errores tipados, filas de `uso_llm` ni en
mensajes de error de validación de la configuración. Los errores de configuración MUST nombrar la
variable sin imprimir su valor.

Change que lo implementa: `proveedores-llm-configurables`

#### Scenario: LLM24 — Un error de proveedor no filtra la clave

- Dado un proveedor directo que responde 401 y una clave conocida en la configuración,
- Cuando se inspecciona el error propagado y todos los logs emitidos,
- Entonces la clave no aparece en ninguno.

#### Scenario: LLM24 — Un error de configuración nombra la variable sin su valor

- Dada una variable de clave con un valor inválido,
- Cuando falla la validación de arranque,
- Entonces el mensaje nombra la variable y no contiene el valor.
