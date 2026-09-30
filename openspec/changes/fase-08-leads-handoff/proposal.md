# Proposal: Fase 08 — Leads y handoff

- Change: `fase-08-leads-handoff` · Fase de la hoja de ruta: **08** · Rama: `fase-08-leads-handoff`
- Fecha: 2026-09-30 · Estado: **aprobada** (2026-09-30, con las recomendaciones de Q1-Q4)
- Depende de: **07a, 07b y 07c cerradas** (agente con LLM, `EVALUADOR_LEAD`, evals guionadas).

## Intent

Hoy `marcar_lead_caliente` solo *propone*: `EvaluadorLeadSinEscala` responde siempre `derivado: false`,
no se escribe nada en `lead` y nadie se entera. Esta fase completa el ciclo de R9-R11: una **escala
determinista** confirma (o no) lo que propone el LLM, un lead confirmado se **guarda**, se **deriva** a un
asesor (dentro de horario) o se **captura** con sus datos (fuera de horario), y el asesor recibe un
**aviso por Telegram** con reintento, sin duplicados y solo después de que el estado quedó confirmado.

Éxito (fila 08 de `docs/fases/README.md`): tests 10-14 y 21 del prototipo reescritos y en verde, y un
aviso real en Telegram.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Aviso de leads | Telegram **y** notificaciones de Chatwoot; se revisa tras unas semanas | P12 |
| Efectos externos | Todo pasa por el outbox (`plataforma/outbox`), nunca una llamada directa | ADR-0004 |
| Composición | El agente implementa el puerto de `conversaciones`; los demás módulos se enchufan por puertos | ADR-0016 |
| Datos personales | `lead.resumen` sin teléfono, cédula, correo ni dirección; nada de eso en logs | R14, P15 |
| Modelo de datos | La tabla `lead` ya existe con todos los campos que se necesitan (sin migración) | `MODELO_DATOS.md` §5 |

## Scope

### In Scope

1. **Escala determinista** (R9): vocabulario cerrado de señales fuertes y débiles y umbral (≥1 fuerte o
   ≥2 débiles); función pura y probada.
2. **Módulo `leads`**: guarda el lead, evalúa la propuesta del LLM (real, reemplaza a
   `EvaluadorLeadSinEscala`), sin lead cuando el destino no tiene cobertura, un lead abierto por
   conversación.
3. **"Pide hablar con una persona" sin LLM** (R9): nueva política del pipeline del agente que deriva de
   inmediato.
4. **Derivación**: dentro de horario, handoff con motivo `lead-caliente` y etiqueta `lead-caliente` en
   Chatwoot.
5. **Captura fuera de horario** (R10): el bot sigue atendiendo, pide y guarda los datos del cliente, y
   solo entonces avisa; la conversación no se aparca.
6. **Módulo `notificaciones`** (R11): puerto `Notificador`, adaptador de Telegram, máximo 1 aviso por
   contacto cada 24 h, aviso después de confirmar el estado, reintento por el outbox.
7. **Recordatorios** al asesor de leads derivados que siguen sin atender.
8. Casos de evals y un e2e por webhook de los flujos nuevos.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Atributos del contacto en Chatwoot y asignación automática a un asesor | 11 (Dashboard App, P14) | Chatwoot ya avisa al asignar (P12) y la asignación exige usuarios/roles que llegan con la Fase 11 |
| Embudo de leads (`en_atencion`, `ganado`, `perdido`) y ventas | 12-14 | Back office posterior al corte (P8) |
| `meta/indicadorEscribiendo.ts` (única llamada directa a Meta) | 10 | Requiere el token de Meta y el corte; no aporta antes |
| Kill switch y observabilidad de notificaciones | 09 | Operación |

## Qué se migra del prototipo

El prototipo `../ChatLuxeCRM` **no está disponible en este entorno**: las reglas se toman de los specs
vigentes (R9-R11), de `docs/analisis/01` y de `docs/migracion/inventario.md`. Lo que solo vive en el
código del prototipo (listas de señales, guion de captura, intervalo del recordatorio) queda como
**pregunta abierta** con una recomendación; no se inventa.

| Prototipo | Decisión | Destino | Motivo |
|---|---|---|---|
| `leads/senales.ts`, `calificar.ts` | Conservar la regla / Rediseñar | `leads/dominio/escala-lead.ts` | R9; vocabulario cerrado para que sea determinista (**Q1**) |
| `leads/derivar.ts` (aviso) | Rediseñar | `leads/aplicacion` + outbox | B3: la derivación pasa a eventos + outbox |
| `leads/capturaFueraHorario.ts`, captura en `systemPrompt.ts:41-56` | Rediseñar | Instrucciones del turno + política de captura | R10; el guion es un dato del negocio (R15, **Q2**) |
| `telegram/*` | Rediseñar | `notificaciones/` (puerto `Notificador` + outbox) | ADR-0004; ventana de 24 h persistida |
| `queue/leadsQueue.ts` | Rediseñar | Job repetible BullMQ | Mismo patrón que `barrido-vencimientos` (**Q3**) |
| `estado/handoffExplicito` (detección "pide persona") | Rediseñar | Política del pipeline del agente | R9; sin pasar por el LLM |
| Tests 10-14 y 21 (`calificar`, `fase3Flujos`, `handoffExplicito`) | Rediseñar | Unitarios + e2e | Se reescriben, no se copian |
| `meta/indicadorEscribiendo.ts` | Posponer | Fase 10 | Ver Out of Scope |

## Capabilities

### New Capabilities

- `notificaciones`: aviso al asesor por Telegram con ventana, orden y reintento (NTF1-NTF4).

### Modified Capabilities

- `leads`: ADDED LDS1-LDS5 (escala, persistencia y derivación, "pide persona", captura, recordatorio).
- `agente`: MODIFIED AGT11 (la herramienta deja de ser solo una propuesta) y ADDED AGT14 (política de
  "pide persona" en el pipeline).
- `conversaciones`: ADDED CNV11 (motivo de handoff `pide-persona`).

## Approach

Nueve tareas (detalle en `tasks.md`), en orden de dependencia: escala pura → módulo `leads` →
"pide persona" → derivación → captura fuera de horario → notificaciones → recordatorios → evals y e2e →
cierre. TDD estricto con Vitest. Entrega en PRs apilados de ~400 líneas (`stacked-to-main`), uno por
slice del `tasks.md`.

## Affected Areas

| Área | Impacto |
|---|---|
| `src/modulos/leads/` | **Nuevo**: dominio (escala, señales), aplicación (evaluar, derivar, recordar), infraestructura Prisma |
| `src/modulos/notificaciones/` | **Nuevo**: puerto, adaptador Telegram, manejador de outbox |
| `src/modulos/agente/` | Política "pide persona", binding real de `EVALUADOR_LEAD`, vocabulario cerrado de señales en la herramienta, instrucciones de captura |
| `src/modulos/conversaciones/` | Motivo de handoff `pide-persona` |
| `src/plataforma/config/esquema.ts`, `.env.example` | Variables de Telegram y de leads |
| `test/evals/casos/sinteticos/` | Casos de escala, "pide persona" y captura |
| Esquema | **Sin cambios** (la tabla `lead` ya tiene los campos) |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Las listas de señales del prototipo no se pueden leer y la escala queda distinta a la de producción | Alta | **Q1**: el usuario aprueba el vocabulario antes de implementar; el vocabulario y el umbral son datos versionados |
| Avisar antes de que el estado se confirme (R11) | Media | El aviso se encola en el outbox **después** de la transición confirmada; test de orden |
| Notificar dos veces al mismo contacto por una condición de carrera | Media | La ventana de 24 h se comprueba y se marca con un `UPDATE ... WHERE` atómico sobre `lead.notificado_en` |
| Token de Telegram filtrado | Baja | Solo por entorno; `npm run secretos`; nunca en logs (R14) |
| Cambiar `senales` de texto libre a un vocabulario cerrado rompe al modelo real | Media | Las evals guionadas lo cubren; la corrida real (P32) lo mide |

## Rollback Plan

Volver a enchufar `EvaluadorLeadSinEscala` en `AgenteModule` (un binding) y quitar la política de
"pide persona" del pipeline; no hay migración de esquema que revertir.

## Dependencies

- 07a-07c cerradas.
- Aviso **real** en Telegram: un bot y un grupo de Telegram del usuario (**Q4**, `[manual]`).

## Preguntas resueltas (2026-09-30)

| # | Pregunta | Bloqueaba | Respuesta (recomendación aceptada) |
|---|---|---|---|
| Q1 → P33 | ¿Cuáles son las señales fuertes y débiles? El código del prototipo no está disponible | T1 | Fuertes: `pide_pagar`, `pide_apartar`, `confirma_pedido`, `da_datos_de_entrega`, `pregunta_medios_de_pago`. Débiles: `pregunta_precio`, `pregunta_envio`, `pide_fotos`, `pregunta_disponibilidad`, `compara_productos`, `vuelve_a_escribir`. Umbral: ≥1 fuerte o ≥2 débiles (R9) |
| Q2 → P34 | ¿Qué datos pide el guion de captura fuera de horario y con qué texto? | T5 | Los mismos cuatro de `guardar_datos_contacto` (nombre completo, teléfono de contacto, dirección, localidad); el texto de cierre es el parámetro `mensaje_captura_completa`, editable sin desplegar (R15) |
| Q3 → P35 | ¿Cuándo se recuerda un lead que nadie atendió y cuántas veces? | T7 | Un solo recordatorio a los 30 min de derivado (mismo valor que `HANDOFF_ESPERA_MIN`), configurable |
| Q4 → P36 | Bot y grupo de Telegram para el aviso real | T6 `[manual]` | El usuario crea el bot con @BotFather, lo agrega al grupo y pone `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` en su entorno; los tests usan un Telegram falso |

## Success Criteria

- [ ] Un lead propuesto por el LLM solo se deriva si la escala lo confirma (R9), con tests.
- [ ] "Pide hablar con una persona" deriva sin llamar al LLM.
- [ ] Fuera de horario el bot captura los datos, avisa y **sigue atendiendo** (R10).
- [ ] Máximo 1 aviso por contacto cada 24 h, después de confirmar el estado, con reintento (R11).
- [ ] `npm run ci` en verde; evals guionadas con los casos nuevos.
- [ ] `[manual]` Aviso real recibido en el grupo de Telegram.
