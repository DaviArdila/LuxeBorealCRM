# Dinero sin rastro y evals reales

**Resumen.** El bot nunca debe decir una cifra en pesos que no salga de una herramienta (R1, R2). Si el modelo la
inventa, el sistema **no la envía**: pide al modelo que responda de nuevo una vez y, si insiste, **pasa la conversación a
un asesor**. El asesor ve el aviso de fallo del bot. Esta guía explica qué verás, cómo investigarlo y cómo correr las
evals reales que miden todo esto. Los requisitos están en [`AGT23` a `AGT26`](../../openspec/changes/fix-fallas-criticas-evals-agente/specs/agente/spec.md).

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
EVALS_MODO=real node --env-file=.env node_modules/vitest/vitest.mjs run --project evals --testTimeout=1200000
```

- Vitest no carga el `.env` solo: por eso `--env-file=.env`. No imprimas ni pegues el `.env`.
- Cuesta cerca de **0,01 USD** por corrida con `openai:gpt-6-luna`. Tope autorizado: **2 USD por sesión de evals**.
- Cada caso corre 3 veces. Las aserciones **críticas** (dinero con rastro, recargo sin porcentaje, herramienta prohibida,
  handoff no esperado) deben pasar el 100 %; el resto, al menos el 90 % (EVL3).
- Los casos marcados `soloGuionado: true` (hoy `r1-monto-sin-rastro-corregido` y `r1-monto-sin-rastro-persiste`) se
  **omiten** en modo real: su premisa es que el «modelo» invente un monto, y un modelo real no lo hace. El resumen
  termina con `Casos omitidos: N (solo guionado: …)` y la lista. No cambian el umbral.
- Para medir un estilo candidato sin publicarlo, ver [estilo del bot](estilo-del-bot.md).

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
