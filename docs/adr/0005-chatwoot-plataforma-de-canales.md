# 0005. Chatwoot como plataforma de canales, historial y bandeja: delegar antes de construir

- Estado: propuesta
- Fecha: 2026-09-22

## Contexto

Chatwoot (Community, MIT) ya es el dueño del webhook de Meta y la bandeja humana en el prototipo.
Además normaliza WhatsApp, Instagram, Messenger, widget web y otros canales, guarda el historial,
une contactos entre canales, asigna, etiqueta, reporta y permite embeber apps propias. El usuario
pidió no construir lo que Chatwoot ya hace (P3) y quitar el teléfono como identidad (P1).
Inventario completo en `docs/analisis/04-chatwoot-delegar-vs-construir.md`.

## Alternativas

1. Construir canales, historial e identidad propios (independencia total de Chatwoot).
2. Delegar en Chatwoot todo lo que la edición Community resuelve y aislarlo detrás de un puerto.

## Decisión

Opción 2. Chatwoot es el único adaptador de canal; el agente es agnóstico al canal y consulta un
perfil de capacidades (`docs/analisis/05-multicanal.md`). No guardamos mensajes; la identidad del
cliente es `contacto.chatwoot_contact_id`. Solo se delega en funciones Community.

## Consecuencias

- Mucho menos código propio (canales, historial, reportes de atención, asignación).
- Dependencia fuerte de Chatwoot, mitigada con un puerto de canal: cambiarlo sería escribir otro
  adaptador y resolver la identidad de otra forma.
- Obligatorio: antes de construir una capacidad, revisar el doc 04.
- Prohibido: guardar contenido de mensajes; depender de funciones de pago de Chatwoot.
