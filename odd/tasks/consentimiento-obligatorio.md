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
- [x] T2 `PoliticaConsentimiento` + registro en `POLITICAS_TURNO` antes de `contenido-llm` (TDD).
- [x] T3 Textos del aviso/recordatorio/confirmaciones como datos y siembra idempotente.
- [ ] T4 Specs (`privacidad`, `agente`), evals y e2e ajustados.
- [ ] T5 Batería completa local.

## Ruta
Delegada: un writer (más de 2 archivos no triviales y lectura previa a la escritura).

## Evidencia
(se completa por tarea)
- T1: `docs/adr/0028-consentimiento-previo-al-llm.md`, indice del README de ADR y P76 en PREGUNTAS_ABIERTAS. Passive (solo documentos): lectura estructural. Commit: ver Evidencia final.
- T2: RED observado (politica-consentimiento.spec.ts fallaba: modulo inexistente); GREEN: `npx vitest run --project unit politica-consentimiento`: 25 pasan. Primera politica del pipeline; las 4 claves `consentimiento_*` se definen en `sistema.ts` (necesarias para compilar). `typecheck` y `eslint` limpios sobre agente/asistente. Ruta: delegada (writer unico).
- T3: `planificarSemilla` siembra los 4 textos (idempotente por clave/titulo) y el aviso hereda `aviso_datos` (fila legada, luego parametro). `npx vitest run --project unit asistente`: 13 archivos, 156 pasan; typecheck y eslint limpios. Excepcion TDD: la implementacion se escribio antes de las pruebas de herencia (sin RED observado para T3). Nota: en una base ya migrada el texto editado vive en el caso «Tratamiento de datos»; el aviso nuevo nace con el respaldo y se edita desde el admin.
