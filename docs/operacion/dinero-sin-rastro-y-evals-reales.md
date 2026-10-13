# Dinero sin rastro y evals reales

**Resumen.** El bot nunca debe decir una cifra en pesos que no salga de una herramienta (R1, R2). Si el modelo la
inventa, el sistema **no la envía**: pide al modelo que responda de nuevo una vez y, si insiste, **pasa la conversación a
un asesor**. El asesor ve el aviso de fallo del bot. Esta guía explica qué verás, cómo investigarlo y cómo correr las
evals reales que miden todo esto. Los requisitos están en [`AGT23` a `AGT26`](../../openspec/changes/fix-fallas-criticas-evals-agente/specs/agente/spec.md).

> Los comandos `npm run …` de esta guía se corren dentro de `servicio/` (o desde la raíz con
> `npm --prefix servicio run …`), y el `.env` es `servicio/.env` ([ADR-0023](../adr/0023-estructura-servicio-y-cliente.md)).

## Qué pasa cuando el bot dice un monto sin rastro

| Paso | Qué hace el sistema | Qué ve el cliente |
|---|---|---|
| 1 | El modelo escribe un texto con un monto que ninguna herramienta devolvió en ese turno | Nada todavía |
| 2 | **Un reintento**: se le avisa al modelo que no use ese monto y responda de nuevo | Nada todavía |
| 3a | El texto nuevo no trae montos sin rastro | Ese texto, como una respuesta normal |
| 3b | El texto nuevo vuelve a traer un monto sin rastro | El texto de cortesía `mensaje_error_llm` y el traspaso |

El motivo interno del traspaso es `dinero-sin-rastro`. Para `conversaciones` y para el aviso de Telegram cuenta como un
**fallo del bot** (`fallo-llm`), así que el asesor lee `Traspaso: el bot no pudo responder por una falla técnica.`
(ver [avisos al asesor](avisos-al-asesor.md)). El aviso no dice que la causa fue dinero: se averigua en el log.

Cuenta como rastro el resultado de cualquier herramienta del turno y también **una cifra que el cliente escribió en ese
mismo turno** (con moneda). Si el cliente dice «tengo $200.000» y el bot repite «$200.000», no se bloquea.

## Cómo investigarlo

1. Busca en los logs el evento `agente.dinero-sin-rastro`. Trae solo la **cantidad** de montos (`montos`) y si fue el
   reintento (`reintento: false` es el primer bloqueo; `true`, el segundo y último). Nunca trae el texto ni las cifras (R14).
2. Dos eventos seguidos en la misma conversación, el segundo con `reintento: true`, significan traspaso. Un solo evento
   con `reintento: false` significa que el reintento corrigió el texto.
3. Para ver **qué** dijo el modelo no hay texto en el log: reproduce el caso con las evals (abajo) o revisa la conversación
   en Chatwoot, donde el texto bloqueado no aparece porque nunca se envió.
4. Si pasa seguido, mira primero si el producto o la cotización de ese turno devolvieron datos: sin llamada a herramienta,
   cualquier precio es inventado. Después revisa el prompt (`reglas`) y el modelo.

## Límites conocidos

| Límite | Efecto | Qué hacer |
|---|---|---|
| El parser exige moneda: `$`, `COP`, «pesos», «mil», «millones» | Un número suelto («2 días», un año, un teléfono) no se audita | Nada: es a propósito |
| Una cifra del cliente **sin moneda** («tengo 200 mil») no respalda un `$200.000` del bot | El bot se reintenta y, si repite, se traspasa: un falso positivo | Aceptado: cuesta una llamada más o un traspaso, nunca un precio inventado |
| Solo se auditan montos en pesos | Otras monedas no se revisan | Ninguna en el negocio hoy |
| El historial y lo que dijo el bot antes no cuentan como rastro | Un precio dicho en un turno anterior se reconsulta | Esperado: obliga a llamar la herramienta |

## Cómo correr las evals reales

Las evals guionadas (`npm run evals`) corren en CI y no cuestan nada. Las **reales** llaman al modelo de verdad, cuestan
dinero y **nunca** corren en CI.

```
EVALS_MODO=real node --env-file=.env node_modules/vitest/vitest.mjs run --project evals
```

- Vitest no carga el `.env` solo: por eso `--env-file=.env`. No imprimas ni pegues el `.env`.
- Ya no hace falta `--testTimeout`: cada caso es una prueba propia con su plazo, `repeticiones × turnos × 2 × 60 s + 30 s`
  (`plazoCasoRealMs`). Un caso lento o colgado falla solo, y el resto sigue.
- La clave que hace falta es la del proveedor de los modelos de `LLM_EVALS_MODELOS`: `OPENAI_API_KEY` para `openai:`
  (el valor por defecto es `openai:gpt-6-luna`) y `ANTHROPIC_API_KEY` para `anthropic:`. Un id sin uno de esos
  prefijos hace que la corrida se niegue antes de llamar: OpenRouter se retiró ([ADR-0029](../adr/0029-proveedor-anthropic-y-retiro-de-openrouter.md)).
- Modelos soportados por ahora: `openai:gpt-6-luna` (por defecto) y `anthropic:claude-haiku-5-5`; `gpt-5.6-luna` se
  retiró. Para correrlas con cada uno, `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` y, si hace falta, `LLM_EVALS_MODELOS`.
- Precios por defecto de `LLM_PRECIOS_USD_JSON` (USD por millón de tokens: entrada / salida / lectura de caché):
  `gpt-6-luna` 0,10 / 0,50 / 0,01, dados por el dueño (contexto 1.050.000, salida máxima 128.000, razonamiento
  none/low/medium por defecto/high/xhigh/max), y Haiku 0,10 / 0,50 / 0,01, donde el `cache` es una **estimación
  pendiente de confirmar** (10 % de la entrada). El costo impreso de la corrida depende de ellos.
- La tabla de precios **no tiene campo de escritura en caché**: la escritura (0,125 en `gpt-6-luna`; 1,25 veces la
  entrada en Anthropic) no se cobra aparte en el cálculo, así que el costo queda levemente subestimado.
- Cuesta cerca de **0,01 USD** por corrida con `openai:gpt-6-luna`. Tope autorizado: **2 USD por sesión de evals**.
- Para medir un estilo candidato sin publicarlo, ver [estilo del bot](estilo-del-bot.md).

### Con Claude Haiku 5.5 (Anthropic directo)

El proveedor `anthropic` habla directo con la API de Anthropic ([ADR-0029](../adr/0029-proveedor-anthropic-y-retiro-de-openrouter.md)).
Para correr las evals reales con Claude Haiku 5.5, agrega a `servicio/.env` estas tres variables:

```
ANTHROPIC_API_KEY=<tu clave de Anthropic>
LLM_EVALS_MODELOS=anthropic:claude-haiku-5-5
LLM_PRECIOS_USD_JSON={"anthropic:claude-haiku-5-5":{"entrada":0.1,"salida":0.5,"cache":0.01}}
```

Después corre el mismo comando de arriba. Si falta `ANTHROPIC_API_KEY`, la corrida se niega antes de hacer una sola
llamada y nombra la variable.

| Dato | Valor |
|---|---|
| Precio de entrada, salida y lectura de caché | 0,10 / 0,50 / 0,01 USD por millón de tokens, para prompts de hasta 100 000 tokens. **Verifica** los valores en la página de precios de Anthropic antes de cargarlos: el precio es del dueño, no del código (R2) |
| Escritura en caché | Anthropic la cobra a 1,25 veces la entrada; aquí se registra al precio de entrada, así que el costo queda un poco por debajo del real |
| Razonamiento | Cada llamada pide esfuerzo `low`: Haiku 5.5 razona por defecto y ese razonamiento cuenta dentro de `max_tokens` (400 en el perfil de conversación) |
| Caché | Se marca un punto de corte en el prompt de sistema. Si `tokensCache` sigue en cero tras varias llamadas, el prefijo cambió entre llamadas o es más corto que el mínimo que el modelo cachea |

### Cómo leer el resultado

| Lo que ves | Qué significa |
|---|---|
| Un caso en rojo | Ese caso tuvo una aserción **crítica** fallida en alguna repetición (dinero sin rastro, recargo con porcentaje, herramienta prohibida, handoff no esperado). La corrida queda reprobada |
| `EVL3 — veredicto de la corrida real` en rojo | Hubo críticas fallidas, las no críticas pasan menos del **90 %**, o algún caso no terminó sus 3 repeticiones (EVL3) |
| `repeticiones sin fallas: 1/3` | De las 3 repeticiones del caso, solo una pasó todo |
| `✗ menciona: … — en 2 de 3 repeticiones` | La misma falla en 2 repeticiones: si sale en 3 de 3 es sistemática; en 1 de 3, ocasional |
| `Casos sin terminar: N` | Esos casos se cortaron por plazo o fallaron antes de evaluar; la corrida queda reprobada |
| `Casos omitidos: N (solo guionado: …)` | Casos cuya premisa es el guion; no corren en modo real y no cuentan para el umbral |

El resumen se imprime siempre, al final, aunque haya casos en rojo. Nunca trae texto del cliente ni de la respuesta (R14).

## Qué exigen los casos

Los casos miden al bot contra el prompt y las herramientas **vigentes**. Si un caso pide algo que el prompt prohíbe, el
caso está mal, no el modelo.

| Regla del contrato | Cómo la respeta el caso |
|---|---|
| Con pocos casos de uso, su texto ya viaja en el prompt y el modelo **no** llama `consultar_caso` (CAS8) | Ningún caso exige `consultar_caso` salvo `caso-indice-grande`, cuyo relleno no cabe en el prompt |
| `buscar_producto` trae la ficha de sus 3 primeros resultados; no se llama `obtener_ficha` para ellos (AGT8) | Los casos de precio aceptan `obtener_ficha` **o** `buscar_producto` (`algunaDe`) |
| Si no hay caso para lo que se pregunta, se dice y se ofrece un asesor (regla 4 de seguridad) | Los casos «inexistentes» no exigen herramienta: piden no inventar y ofrecer el asesor |

Dos aserciones cambiaron de forma:

- **`textoLiteral`** acepta como fuente el texto de un caso sembrado (`{ "caso": "Devoluciones" }`), venga del prompt o de
  `consultar_caso`, y alternativas (`algunaDe`). Si la herramienta de la fuente no se llamó, **no cuenta**: esa ausencia
  ya la vigila `herramientasEsperadas`. Un salto de línea no cuenta como cambio; una palabra sí.
- **`herramientasEsperadas`** acepta alternativas: `{ "algunaDe": [{ "nombre": "obtener_ficha" }, { "nombre": "buscar_producto" }] }`.

## Qué casos corren en modo real

El modo real ignora el guion: un caso cuya premisa es lo que «dice» el guion no se puede reproducir con un modelo de verdad.

| Caso | En modo real | Por qué |
|---|---|---|
| `r1-monto-sin-rastro-corregido`, `r1-monto-sin-rastro-persiste` | Omitido (`soloGuionado`) | Su premisa es que el modelo invente un monto |
| `lead-escala-no-confirmada` | Omitido (`soloGuionado`) | Su premisa es que el modelo proponga «caliente» con una señal débil; la escala que lo frena se prueba con el guion |
| `consentimiento-con-si-se-registra-y-guarda`, `tratamiento-datos-acepta-y-guarda` | Corre | El cliente ahora da su teléfono en el mensaje; antes solo estaba en el guion y lo correcto era pedirlo |
| `entrada-sku-inexistente` | Corre | `menciona` acepta «no encuentro», «no tenemos», «no aparece», «no está»… en vez de la frase exacta del guion |
| `r2-cotizacion-con-cobertura` | Corre | Se retiró `menciona: aproximad, transportadora`: ninguna instrucción del prompt ni caso sembrado se lo pide al modelo (ver abajo) |

> **R2 sin instrucción.** La spec de R2 pide citar el envío «como un rango aproximado» que «confirma la transportadora», pero
> desde ADR-0027 esa conducta vive en un caso de uso del dueño, y las evals no siembran ninguno. Mientras el dueño no lo cree,
> ningún modelo tiene de dónde sacarlo.

**Set dorado.** La carpeta `test/evals/casos/dorado` no existe todavía: ninguna corrida real ha medido conversaciones reales
anonimizadas, solo casos sintéticos (P30).

## Corridas reales del 2026-10-13

`openai:gpt-5.6-luna` (modelo ya retirado; 5 críticas fallidas, 74,6 % no críticas) y `anthropic:claude-haiku-5-5` (3 críticas, 72,3 %)
reprobaron con resultados idénticos en 24 de 32 casos. La causa principal fue el diseño de los casos, no los modelos: se
corrigió en `odd/tasks/rediseno-evals-reales.md`. Hace falta **una corrida nueva** para saber cómo queda. Una crítica
sigue abierta como decisión del dueño: `agt28-asesor-confirma-apartado` prohíbe marcar el lead caliente (P77).

## Resultado de la corrida real del 2026-10-02

Modelo `openai:gpt-6-luna`, con el arnés corregido y las guardas de este change.

| Dato | Valor |
|---|---|
| Veredicto | **REPROBADA** |
| Críticas fallidas | 2, ambas en una repetición de `r2-sin-cobertura`: el modelo llamó `marcar_lead_caliente` y hubo traspaso `lead-caliente` |
| No críticas que pasan | 91,1 % |
| Costo | 0,0090 USD |
| Críticas de dinero de la corrida previa (4) | Desaparecieron tras corregir el arnés y añadir las guardas |

**Lo que esto significa.** Mejoró, pero la corrida sigue reprobada: aún falta una corrida que alcance el umbral (EVL3)
antes de dar el modelo o el prompt por buenos. **No hay evidencia para decir que el bot esté listo para clientes.**
Las dos fallas restantes no son de dinero: están en `r2-sin-cobertura`, donde el modelo marcó un lead caliente que
la escala confirmó. Su causa no está investigada.
