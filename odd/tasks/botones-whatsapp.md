# Botones de respuesta de WhatsApp (Fase B del consentimiento)

Rama: `feat/botones-whatsapp`. Trabajo fuera de fase (ODD). Continúa `odd/tasks/consentimiento-obligatorio.md`.

## Objetivo
Un paso de salida genérico «texto con opciones» (hasta 3 botones) que viaja por el puerto de salida (R5) y el
adaptador de Chatwoot, reutilizable por cualquier política, herramienta o caso. Primer uso: el aviso de
consentimiento con «Sí, autorizo» / «No autorizo». El texto «Responde SÍ o NO» se conserva como respaldo.

## Evidencia de diseño (Chatwoot v4.17.1, leída en el código fuente, no probada contra WhatsApp real)
- Salida: mensaje con `content_type: "input_select"` y `content_attributes.items = [{title, value}]`;
  ≤3 ítems = botones de respuesta, >3 = lista. Solo inbox WhatsApp Cloud oficial. Título ≤20 caracteres (Meta).
- Entrada: un clic llega como mensaje de texto cuyo contenido es el TÍTULO del botón (el valor/id se descarta).
  Por eso quien interprete el clic compara por título; los títulos de un flujo no deben repetirse.

## Alcance autorizado
Puertos y adaptador de salida, paso `botones`, política de consentimiento, textos como datos (R15), specs,
tests. Sin cambios al esquema de datos. Listas (>3 opciones) quedan fuera.

## Tareas
- [x] B1 Paso de salida `botones` en conversaciones/canales (puertos, validación de límites, respaldo de texto
  para canales sin soporte) y método del adaptador Chatwoot (TDD). Commit `ae94fe6`.
- [x] B2 La política de consentimiento devuelve el aviso con botones; textos de botones como datos; el parser
  entiende los títulos (TDD). Commit `196b3cf`.
- [x] B3 Specs (`conversaciones` CNV16, `canales` CAN11, `privacidad`, `agente`, `asistente`), operación
  (`casos-del-asistente.md`), ADR-0028, e2e/evals ajustados. En `ae94fe6` (CAN11, CNV16) y `196b3cf` (el resto).
- [x] B4 Batería completa local con Docker (resultados abajo).

## Ruta
Delegada: un writer (más de 2 archivos no triviales, lectura previa a la escritura). Disparador: escritura en más de 2
archivos no triviales de tres módulos.

## Evidencia
- Decisión de diseño: la validación (1 a 3 opciones, título ≤20, sin repetirse) vive en `canales/dominio/opciones-botones.ts`
  y `conversaciones` la reexporta para que `agente` la use sin saltarse la frontera. El respaldo en texto numerado lo decide
  `EnviarRespuestaTurno` (R5) según el perfil de capacidades (WhatsApp: `limitesInteractivos` no nulo). Opciones inválidas
  degradan a texto con un `warn` sin contenido, para no perder el aviso.
- RED observado: `opciones-botones.spec` (módulo inexistente), `enviarBotones` en adaptador y publicador (4 fallas),
  `admiteBotonesTurno` (1 falla), política de consentimiento (9 fallas), tope de título en `validarCaso` (2 fallas),
  evals de AGT29 (4 fallas al ver el paso nuevo). Excepción: el spec de integración de `EnviarRespuestaTurno` no dio un RED
  limpio (falló al cargar por un error de sintaxis mío); pasó en verde tras corregirlo.
- B4 (desde `servicio/`, Docker activo): `lint`, `typecheck`, `fronteras`, `contrato:deriva` (sin cambios al contrato) y
  `commits`: exit 0. Vitest `unit` 1774/1774, `integracion` 497/497, `e2e` 122/122, `evals` 49 pasan + 1 omitido (APROBADA 100 %).
  Una corrida previa de `e2e` dio 3 fallas (asistente, configuración, estilo-admin: 403/estilo) que no se repitieron al
  correrlas aisladas ni en la corrida completa final: sin causa raíz hallada (posible contención con el servicio dev).
- No probado contra WhatsApp Cloud real: solo el código fuente de Chatwoot v4.17.1 y su doble de pruebas.
- Tamaño: `ae94fe6` +494/-9, `196b3cf` +304/-27 (≈834 líneas de autoría contando tests y docs; el código de producción es
  una fracción). Supera el heurístico de ~400: se entrega partido en B1 (`ae94fe6`) y B2 (`196b3cf`) como dos PRs apilados.
- Revisión nativa (`gentle-ai review`): no ejecutada por este writer; queda al orquestador.
