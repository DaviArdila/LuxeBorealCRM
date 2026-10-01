# Proposal: Fase 08d — Avisos al asesor con enlace a la conversación

- Change: `fase-08d-avisos-con-enlace` · Fase de la hoja de ruta: **08d** · Rama: `fase-08d-avisos-con-enlace`
- Fecha: 2026-10-01 · Estado: **spec en revisión** (pendiente de aprobación del dueño)
- Depende de: **08 cerrada** (leads, outbox, Telegram) y **08c cerrada**.

## Intent

El bot atiende hasta que haya un lead caliente o algo que requiera a una persona; desde ahí, la atención es
humana y **el aviso es lo único que le dice al asesor que debe actuar**. Hoy ese aviso falla de tres maneras,
vistas en una prueba real (2026-10-01):

1. **Solo avisa dos motivos** (`lead-caliente`, `pide-persona`). Un traspaso por tope de turnos, falla del LLM,
   techo de gasto, audios repetidos o plazo agotado deja la conversación en `humano` y **nadie se entera**.
2. **No avisa si el cliente escribe mientras espera.** El cliente dijo «Quiero comprarla» a una conversación en
   `humano` y no pasó nada: el bot ya no escucha y el asesor no sabía.
3. **El aviso no dice dónde atender.** Trae temperatura, señales y resumen, pero no cómo llegar a la
   conversación: el asesor tiene que abrir Chatwoot y buscarla.

Esta fase hace que **todo traspaso a una persona avise**, que el aviso diga **por qué** y **de qué producto**, y
que lleve un **enlace que abre la conversación en Chatwoot** (desde el celular también).
Además, avisa cuando un cliente **espera respuesta** y nadie la da.

Éxito: un traspaso por cualquier motivo deja un aviso en Telegram con un enlace tocable a la conversación;
un cliente que escribe en `humano` y no recibe respuesta en `ESPERA_CLIENTE_MIN` minutos provoca un aviso.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| El bot no escribe primero al cliente | Fuera de alcance: el seguimiento proactivo y las plantillas de Meta se descartan | Dueño, 2026-10-01 |
| El aviso es un enlace a Chatwoot | La conversación se atiende desde Chatwoot | Dueño, 2026-10-01 |
| Sin datos personales en el aviso | Se mantiene R14: ni teléfono, cédula, correo ni dirección | R14, NTF1 |
| Texto plano, sin `parse_mode` | Se mantiene: Telegram vuelve tocable una URL sin necesitar formato | Fase 08, matriz de amenazas |

## Scope

### In Scope

1. **Enlace a la conversación** en todos los avisos, con una URL pública configurable (`CHATWOOT_URL_PUBLICA`).
2. **Contenido enriquecido**: motivo en claro y producto de interés (nombre); en el aviso de espera, hace cuántos
   minutos escribió el cliente.
3. **Aviso por todo traspaso a una persona**, no solo por lead: tope de turnos, falla del LLM, techo de gasto,
   audios repetidos, argumentos inválidos y plazo agotado.
4. **Aviso de cliente esperando**: un mensaje del cliente en `humano` o `handoff_pendiente` sin respuesta del asesor
   tras `ESPERA_CLIENTE_MIN` minutos.
5. **Límite por instancia en vez de por contacto** para los avisos que no son de lead (NTF2 modificada).
6. **Guía de operación** de los avisos y evals/e2e del recorrido.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| El bot escribe primero (seguimiento, recordatorio al cliente, plantillas de Meta) | Descartado por el dueño | Ventana de 24 h de WhatsApp, costo y riesgo de molestar al cliente |
| Contexto de Marketplace por nombre del producto (sin SKU) | Fase posterior | Mejora de la entrada, no del aviso |
| Línea de tiempo (trazabilidad) por lead | Fase posterior (11-14) | Exige modelo y pantalla |
| Nombre del cliente en el aviso | Q1, por defecto **no** | R14: con el enlace se ve en Chatwoot |
| Agrupar avisos de `techo-gasto` | Si se vuelve un problema | Ver riesgos |
| Cambios de esquema de base de datos | Q3 | Decisión del dueño; por defecto no hay migración |

## Qué se migra del prototipo

No aplica: mejora del código nuevo. El prototipo no se consulta.

| Prototipo | Decisión | Motivo |
|---|---|---|
| (ninguno) | — | La fase no reemplaza tests ni reglas del prototipo |

## Preguntas abiertas

Registradas en `docs/PREGUNTAS_ABIERTAS.md` como P46 (Q1) a P50 (Q5).

| Id | Estado | Nota |
|---|---|---|
| **Q1** — ¿el aviso lleva el nombre del cliente? | **Abierta** (recomendado: no) | Con el enlace se abre Chatwoot y se ve; evita mandar datos personales a un servicio externo (R14) |
| **Q2** — tiempo de espera del cliente | **Abierta** (recomendado: 10 min, `ESPERA_CLIENTE_MIN`) | Un solo aviso por espera; se reinicia cuando un asesor responde |
| **Q3** — dónde se guarda la marca de «cliente esperando» | **Abierta** (recomendado: Redis, sin migración) | La alternativa es una columna nueva en `conversacion`: es decisión de esquema del dueño (ADR si se elige) |
| **Q4** — URL pública de Chatwoot | **Abierta** | Hoy `CHATWOOT_URL` es `http://localhost:3001`; el celular necesita una URL accesible (VPS o túnel). Variable nueva `CHATWOOT_URL_PUBLICA` con respaldo en `CHATWOOT_URL` |
| **Q5** — el enlace usa el id o el `display_id` de Chatwoot | **`[manual]`** | En la base local coinciden (2); se confirma con el Chatwoot real antes de cerrar |

## Risks

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Inundar el grupo si el LLM cae o se agota el techo de gasto | Un aviso por conversación activa | Un aviso por (conversación, motivo, instancia de traspaso); si molesta, se agrupa en una fase posterior |
| El enlace no abre en el celular | El aviso pierde su valor | `CHATWOOT_URL_PUBLICA`; prueba `[manual]` en el celular; se documenta en la guía |
| El enlace filtra algo | Exposición de la conversación | Contiene solo el id de la conversación; Chatwoot exige login |
| La marca de espera se pierde (Redis reinicia) | Un aviso de espera que no sale | Es un aviso de apoyo; el traspaso ya avisó. Se documenta como límite |
| Falsos avisos de espera (el cliente escribe «gracias») | Ruido | Un solo aviso por espera, con tiempo configurable; no se interpreta el texto |

## Rollback

- Revertir el código devuelve el aviso anterior (sin enlace, solo dos motivos).
- `ESPERA_CLIENTE_MIN` muy alto (o el barrido apagado con `COLAS_TRABAJADORES`) desactiva los avisos de espera sin
  tocar el resto. No hay migración que deshacer (Q3 por defecto).
