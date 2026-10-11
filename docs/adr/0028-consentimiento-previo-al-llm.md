# 0028. Consentimiento de datos como barrera previa al LLM

- Estado: propuesta
- Fecha: 2026-10-10
- Reabre: la alternativa B de «Cómo se exige el consentimiento» del ADR-0027 (descartada entonces). No reemplaza el ADR-0027:
  la puerta en las herramientas y `registrar_consentimiento` se conservan como defensa en profundidad.
- Aprueba el dueño: es un **cambio de regla de negocio** (R14, qué puede hacer el bot sin aceptación).

## Resumen

Un contacto con consentimiento `pendiente` o `rechazado` ya no conversa con el modelo: recibe un texto fijo y solo avanza al
responder SÍ. Es una política nueva del pipeline, **antes** de las demás, que decide por el texto del mensaje (Fase A). Los
botones de WhatsApp quedan para una Fase B aparte.

## Contexto

- Hoy el consentimiento (PRV1, AGT26) solo bloquea guardar datos y leads dentro de las herramientas
  (`agente/aplicacion/herramientas/con-consentimiento.ts`). Sin aceptar, el bot responde, cotiza y recibe datos que no puede guardar.
- El dueño quiere que sea una regla de seguridad: todo contacto nuevo, o que haya rechazado, no avanza sin decir «sí».
- `RepositorioContactoAgente.consentimientoDe` y `registrarConsentimiento` ya existen; `MotorTurno` recorre `POLITICAS_TURNO` y
  la primera política que responde gana.

## Alternativas

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Política previa al LLM** que lee el estado y entiende SÍ/NO por texto | Determinista; el modelo no interviene; sin cambios de esquema | El cliente no puede preguntar nada antes de aceptar; una respuesta ambigua repite el aviso |
| B | Mantener solo la puerta en herramientas (ADR-0027, A) | Cero cambios | El bot atiende sin autorización; es lo que el dueño quiere cambiar |
| C | Barrera con botones de WhatsApp | Respuesta sin ambigüedad | Depende de que Chatwoot soporte los botones y entregue el clic; es la Fase B |

## Decisión

1. `PoliticaConsentimiento` es la **primera** política de `POLITICAS_TURNO`.
2. `aceptado` deja pasar. `pendiente` y `rechazado` no llegan al LLM: un SÍ registra la aceptación y confirma; un NO registra
   el rechazo y dice que sin autorización no se puede continuar; cualquier otra cosa repite el aviso (pendiente) o el
   recordatorio (rechazado), siempre con «Responde SÍ o NO».
3. Si falla la lectura del estado, **falla cerrado**: responde el recordatorio y no llama al modelo.
4. Los mensajes que no son texto (audio, imagen, sticker) los sigue resolviendo R12 sin llegar al modelo; una ubicación sola
   recibe el recordatorio.
5. Los cuatro textos son casos del sistema editables (R15): `consentimiento_aviso`, `consentimiento_recordatorio`,
   `consentimiento_aceptado` y `consentimiento_rechazado`. El aviso respeta el texto que el dueño ya haya editado
   (`aviso_datos`, legado o `parametro`).
6. La puerta de herramientas y `registrar_consentimiento` se mantienen: ya no son la primera línea, sí la última.

## Consecuencias

**Gana:** R14 se cumple antes de cualquier conversación; el modelo nunca ve a un contacto sin autorización.

**Paga:**

- Un contacto que pide una persona o un asesor antes de aceptar recibe primero el aviso de consentimiento (la política de
  pide-persona queda detrás de la barrera).
- El caso «Tratamiento de datos» deja de ser la vía principal de pedir la aceptación; queda como respaldo del modelo.
- Un SÍ ambiguo («claro, pero antes dime el precio») repite el aviso: el reconocimiento es por frase exacta normalizada.

**Obligatorio o prohibido:** ningún texto del cliente o del contacto se escribe en logs (R14); el tiempo sale del `Clock`; la
salida pasa por el punto único de `conversaciones` (R5).

**Pendiente:** Fase B (botones de WhatsApp) tras verificar el soporte de Chatwoot.
