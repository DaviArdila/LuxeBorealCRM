# Consentimiento de tratamiento de datos obligatorio

Rama: `feat/consentimiento-obligatorio`. Trabajo fuera de fase (ODD). Plan: `C:\Users\ASUS\.claude\plans\pasted-content-id-bb54-quiero-poner-clever-garden.md`.

## Objetivo
Todo contacto con consentimiento `pendiente` o `rechazado` recibe un mensaje fijo (sin LLM) y no avanza hasta
responder SÍ. Texto primero (Fase A); botones reales de WhatsApp quedan para una fase B aparte.

## Alcance autorizado
Política previa al LLM en `agente`, textos como datos (R15), ADR nuevo (propuesta), specs `privacidad` y `agente`,
tests y evals. Sin cambios al esquema de datos.

## Tareas
- [x] T1 ADR (propuesta) que reabre la alternativa B del ADR-0027 + nota en PREGUNTAS_ABIERTAS. (ADR-0028 y P76; hash: ver Evidencia)
- [ ] T2 `PoliticaConsentimiento` + registro en `POLITICAS_TURNO` antes de `contenido-llm` (TDD).
- [ ] T3 Textos del aviso/recordatorio/confirmaciones como datos y siembra idempotente.
- [ ] T4 Specs (`privacidad`, `agente`), evals y e2e ajustados.
- [ ] T5 Batería completa local.

## Ruta
Delegada: un writer (más de 2 archivos no triviales y lectura previa a la escritura).

## Evidencia
(se completa por tarea)
- T1: `docs/adr/0028-consentimiento-previo-al-llm.md`, indice del README de ADR y P76 en PREGUNTAS_ABIERTAS. Passive (solo documentos): lectura estructural. Commit: ver Evidencia final.
