# Verify report: Fase 08 — Leads y handoff

- Fecha: 2026-09-30 · Ramas: `fase-08-p1-escala` … `fase-08-p7-recordatorios` (7 PRs apilados,
  `stacked-to-main`)
- Change: `openspec/changes/archive/2026-09-30-fase-08-leads-handoff/`
- Commits de unidad de trabajo: T1 `03af064`; T2 `7542daa`; T3 `d19f1f1`; T4 `da092c0`; T5 `a6e73e2`;
  T6 `a002378` `2c70788` `b80238d`; T7 `f0a19dc` `9326fa9`; T8 `d0b2328`; cierre documental en este commit. Además `b675b14` (fuera de la
  tarea): el puerto fijo del servidor de fotos de la Fase 03 cayó en el rango efimero de Linux y chocó
  en CI con un `listen(0)` de los servidores falsos (`EADDRINUSE`); se movió a 18785.

## Alcance verificado

Las nueve tareas `[x]`. **T6 queda con un pendiente `[manual]` (Q4/P36)**: el aviso real en el grupo de
Telegram necesita el bot y el grupo del usuario. Lo automático está completo: escala determinista con
vocabulario cerrado, detección de «pide persona», lead guardado y derivado una vez por conversación,
handoff por lead con su etiqueta, captura fuera de horario sin aparcar la conversación, módulo
`notificaciones` (Telegram por outbox) con ventana de 24 h por contacto y recordatorio único de leads sin
atender. **No se llamó a Telegram real**: todo corrió contra `TelegramFalso`, un servidor HTTP local.

## Checks ejecutados (comandos reales)

Entorno: sin Docker; Postgres 16 y Redis locales con un `globalSetup` alterno fuera del repo (MinIO no
disponible).

| Comando | Resultado |
|---|---|
| `npm run lint` · `typecheck` · `fronteras` · `contrato:deriva` · `commits` | Verde |
| `vitest --project unit` | 937 pasan; 7 fallan por necesitar Docker (los mismos de `main`) |
| `vitest --project integracion` (locales) | 243 pasan; 7 fallan por necesitar MinIO |
| `vitest --project e2e` (locales) | Verde: 33 tests (9 de `leads.e2e-spec.ts`) |
| `vitest --project evals` (guionado, locales) | Verde: 31 pasan, 1 omitido (el modo real); 19 casos |

`npm run ci` de GitHub corrió en verde en cada PR de la cadena antes de fusionarlo.

## Escenarios de spec — cobertura real

| Requisito | Escenarios | Dónde se prueba |
|---|---|---|
| LDS1 | 5 | `escala-lead.spec.ts` |
| LDS2 | 6 | `evaluar-propuesta-lead.spec.ts`, `redactar-resumen.spec.ts`, integración de `RepositorioLeadPrisma` |
| LDS3 | 4 | `detectar-pide-persona.spec.ts`, `registrar-pide-persona.spec.ts`, e2e (dos escenarios) |
| LDS4 | 4 | `captura-lead.spec.ts`, `armar-contexto-inicial.spec.ts`, e2e de captura de dos turnos |
| LDS5 | 3 | `recordar-leads.spec.ts`, reclamo contra Postgres, e2e del job repetible |
| NTF1 | 2 | `armar-aviso.spec.ts`, `notificador-telegram.spec.ts`, e2e |
| NTF2 | 3 | `avisar-lead.spec.ts`, ventana atómica contra Postgres (concurrencia real), e2e |
| NTF3 | 2 | `procesar-turno.spec.ts` (`enviar → transicionar → observar`), `aviso-lead-en-handoff.spec.ts` |
| NTF4 | 3 | `notificador-telegram.spec.ts` (200/429/500/401/400/caído/sin credenciales), e2e (500→200, 401) |
| AGT11 (mod.) + AGT14 | 3 + 2 | `evaluador-lead-de-leads.spec.ts`, `politica-pide-persona.spec.ts`, e2e |
| CNV11 | 3 | `transicionar-conversacion.spec.ts`, `procesar-turno.spec.ts`, e2e |

## Límites conocidos

- El aviso a Telegram nunca salió a la red real: el token, el formato de `chat_id` de grupo y los límites de
  la Bot API reales están sin verificar hasta el `[manual]` de T6.
- El aviso no lleva el producto ni el enlace a la conversación de Chatwoot (ver desviación 3 de T6); el
  asesor entra por la bandeja de Chatwoot, donde queda la conversación con la etiqueta `lead-caliente`.
- El recordatorio cuenta desde el aviso: un lead cuyo aviso suprimió la ventana de 24 h del contacto no se
  recuerda.
- «Un lead abierto por conversación» lo garantiza el lock del turno, no una restricción única: un proceso
  externo que escribiera en `lead` fuera del turno podría duplicarlo.
- Las evals guionadas prueban el arnés y la escala real, no lo que un modelo real propone como señales: la
  corrida real de la 07c (P32) sigue pendiente.

## Pendientes abiertos

- `[manual]` Q4/P36: crear el bot y el grupo de Telegram, poner `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`
  y correr un lead de prueba; anotar el resultado en `tasks.md` de esta carpeta.
- Heredados de la 07c: corrida real de evals (P32), set dorado (P30), modelo de respaldo (T5).

## Qué aprendimos que cambia las fases siguientes

1. Un `UPDATE ... WHERE NOT EXISTS` no basta para «una sola vez» entre filas distintas bajo
   `READ COMMITTED`: hace falta bloquear una fila común (aquí el contacto) o un lock consultivo. La prueba
   con dos llamadas simultáneas contra Postgres real lo cazó; un doble en memoria no habría podido.
2. Los observadores de handoff (`RegistroObservadoresHandoff`) resuelven «reaccionar a algo de un módulo de
   abajo sin importarlo». Las fases 09-13 que reaccionen a una transición de conversación deben registrarse
   ahí y no llamar a `conversaciones`.
3. Cada vez que se agrega un colaborador a `ProcesarTurno` se rompen los tests de integración que lo
   construyen a mano: correr **integración y e2e completos en local antes de cada push**, no solo unit.
4. La configuración de las pruebas se centraliza en `test/soporte/configuracion-agente-de-prueba.ts`:
   una variable nueva se agrega ahí una vez en vez de tocar decenas de archivos.
5. Las filas de un mismo `grupo` de outbox salen en orden estricto: un grupo compartido entre avisos de
   leads distintos haría que un rechazo permanente bloquee a todos los demás. Se usa un grupo por lead.
