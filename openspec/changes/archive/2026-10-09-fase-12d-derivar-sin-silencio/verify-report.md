# Verify report: Fase 12d — Derivar avisa sin silenciar al bot, consentimiento de datos y casos del sistema mínimos

- Fecha: 2026-10-09 · Spec aprobada por el dueño el 2026-10-09
- Change: `openspec/changes/archive/2026-10-09-fase-12d-derivar-sin-silencio/`
- Decisión de fondo: [ADR-0027](../../../../docs/adr/0027-derivar-avisa-sin-silenciar-al-bot.md) (sigue `aceptada`)
- Guías de operación: [`avisos-al-asesor.md`](../../../../docs/operacion/avisos-al-asesor.md),
  [`casos-del-asistente.md`](../../../../docs/operacion/casos-del-asistente.md) (con los casos de ejemplo) y
  [`cliente-back-office.md`](../../../../docs/operacion/cliente-back-office.md)

## ¿Se cumplió el objetivo?

Sí. Las diez tareas (T0-T9) quedan `[x]`. Lo funcional de la fase:

| Criterio de salida | Cómo quedó probado |
|---|---|
| Pedir un asesor genera **un** aviso y el bot responde en el mismo turno | e2e `aviso-asesor.e2e-spec.ts` (CNV13, CNV14), `procesar-turno.spec.ts`, evals `pide-persona`, `pide-asesor-herramienta`, `caso-pide-aviso` |
| El eco humano silencia al bot y limpia las marcas | e2e `aviso-asesor.e2e-spec.ts`, integración `marca-asesor-avisado.spec.ts` (Redis real) |
| Sin consentimiento no se guarda ningún dato ni lead | `con-consentimiento.spec.ts` (AGT26), integración `consentimiento-restricciones.spec.ts` (PRV1, CHECK real), e2e `agente-llm.e2e-spec.ts`, evals `consentimiento-*` y `tratamiento-datos-*` |
| El back office muestra cinco casos del sistema con título editable | `sistema.spec.ts` (CAS4), `casos-del-sistema-minimos-migracion.spec.ts` (CAS14), `casos.component.spec.ts` (SHL10) |
| Una base nueva no trae casos de conducta | `semilla.spec.ts`, `sembrar-casos.spec.ts` (CAS6, CAS13) |

## Tareas, commits y PR

| Tarea | Commit | PR | Tamaño real (producción / pruebas) | Revisión |
|---|---|---|---|---|
| T0 spec, ADR-0027, preguntas | `fe4a818` | #117 (CI arreglado en #118) | solo documentos | passive: estructural |
| T1 aviso sin traspaso y marca por motivo | `bc0b433` | #119 | 432 / 1.278 (dentro de la `size:exception` anticipada) | nativa concedida: aprobada, 0 hallazgos |
| T2 `derivar_a_asesor`, `seguridad.v1.md`, `estilo.v4.md` | `8d2e929` | #120 | 84 / 360 + 173 de JSON de evals | nativa: aprobada, 0 hallazgos |
| T3 políticas avisan y siguen; tope 20 | `85083df` | #121 | 348 / 597 | nativa: aprobada, 2 observaciones no bloqueantes |
| T4 consentimiento de datos | `d5571ea` | #122 | 205 / 685 + esquema y migración | nativa: aprobada, 0 hallazgos |
| T5 retira el aviso fijo; «Tratamiento de datos» | `92f28b6` | #123 | 164 / 316 | nativa: aprobada, 1 sugerencia |
| T6 casos de uso, semilla sin negocio, captura como hecho | `10e8a4c` | #125 | 170 / 702 + migración | nativa: aprobada, 1 advertencia descartada con evidencia, 1 sugerencia |
| T7 cinco casos del sistema | `855eef3` | #126 | 77 / 632 + migración | nativa: aprobada, 0 hallazgos |
| T8 título editable y ayuda de herramientas (cliente) | `4116d98` | #128 | +255/−7 en 2 archivos | `under_budget`: la evaluación nativa no pidió revisión |
| T9 evals, guías, deltas fusionados, cierre | commit de cierre de este PR | el de este cierre (`fase-12d-p9-cierre`) | solo documentos | passive: estructural |

Fuera de la lista y necesarios para llegar aquí: #124 (login a Docker Hub en el CI) y #127 (ids de fixture de leads sin
choques). `judgment-day` no era obligatorio en esta fase (regla 6) y no se corrió; el dueño lo dejó a su decisión.

## Escenarios de la spec

243 escenarios en 9 deltas (agente 69, asistente 50, conversaciones 35, leads 24, cliente 18, notificaciones 18, privacidad
13, catálogo 12, configuración 4). Cada uno se convirtió en un test nombrado `<ID> — <escenario>` (mapa por tarea en
`tasks.md`). Dónde vive cada grupo:

| Dominio | Unitario | Integración | e2e | Evals |
|---|---|---|---|---|
| conversaciones (CNV3, CNV8, CNV11-CNV15) | `procesar-turno`, `transicionar-conversacion`, `consumidor-conversaciones`, `contenido-llm` | `marca-asesor-avisado` y `lector-asesor-avisado` (Redis real) | `aviso-asesor.e2e-spec.ts` | — |
| notificaciones (NTF3, NTF6, NTF8) | `armar-aviso`, `aviso-traspaso`, `aviso-sin-traspaso` | — | `aviso-asesor.e2e-spec.ts`, `leads.e2e-spec.ts` | — |
| agente (R12, AGT1-AGT14, AGT24-AGT28) | políticas, `derivar-a-asesor`, `registrar-consentimiento`, `con-consentimiento`, `ensamblar-prompt`, `armar-contexto-inicial` | `repositorio-contacto-agente` | `agente-llm.e2e-spec.ts`, `agente-politicas.e2e-spec.ts` | `pide-asesor-herramienta`, `caso-pide-aviso`, `consentimiento-*`, `tratamiento-datos-*`, `agt28-*`, `cas12-*` |
| privacidad (R14, PRV1) | `con-consentimiento` | `consentimiento-restricciones` (CHECK real) | `agente-llm.e2e-spec.ts` | evals de consentimiento |
| asistente (CAS4, CAS6-CAS8, CAS12-CAS14) | `sistema`, `semilla`, `sembrar-casos`, `proveedor-textos` | `asistente.spec`, `casos-a-intencion-migracion`, `casos-del-sistema-minimos-migracion` | `asistente.e2e-spec.ts` | `caso-*`, `cas12-*` |
| catálogo (CAT10, CAT11, IMP7) y configuración (CFG6) | `cotizar-envio`, `validar-catalogo`, `repositorio-parametro-prisma` | `configuracion.spec` | `agente-llm.e2e-spec.ts` | `r2-*` |
| leads (R10, R11, LDS2-LDS4) | `evaluar-propuesta-lead`, `hecho-captura`, `aviso-lead-en-aviso`, `registrar-pide-persona` | — | `leads.e2e-spec.ts` | `lead-escala-*`, `pide-persona` |
| cliente (SHL10, SHL12) | `casos.component.spec.ts` | — | — | — |

Observación: el escenario de NTF3 («El aviso se envía después de confirmar lo que lo origina») se prueba por el orden de
encolado en `procesar-turno.spec.ts` y `aviso-lead-en-aviso.spec.ts`; no se encontró un test que lleve literalmente el
prefijo `NTF3 —`. Es una brecha de nombre, no de cobertura.

**Lo que las evals guionadas no ejercitan:** el generador de evals llama al agente sin pasar por `ProcesarTurno`, así que
la marca «asesor avisado» por motivo (CNV14) no se adquiere en evals. AGT28 se evalúa en un turno; su comportamiento en un
segundo turno con el asesor ya avisado se verifica solo con la corrida real (EVL3, `[manual]`). No se agregó ninguna eval
en T9: derivación (`pide-asesor-herramienta`, `caso-pide-aviso`), consentimiento (cuatro casos), AGT28 y CAS12 ya existían
desde T2-T6.

## Comandos ejecutados y resultado

Datos de cada tarea (el padre repitió lint, typecheck y unit como spot check):

| Comando | Resultado en la cabeza de T7 / T8 |
|---|---|
| `npm run lint`, `typecheck`, `fronteras`, `contrato:deriva` | Verde |
| `npm test` (unit) | 1.719 tests (1.654 al cerrar T1) |
| `npm run test:integracion` | 492 tests; `prompts-build` falla solo en Windows (conocido) |
| `npm run test:e2e` | 119 tests, en serie (`--no-file-parallelism`) |
| `npm run evals` | 49 pasan, 1 omitida |
| `npm --prefix cliente run ci` (T8) | lint, 201 + 22 pruebas, build y `api:deriva` (35 archivos) en verde |
| `npm run ci` en GitHub Actions | Verde en cada PR fusionado |

T9 es solo documentación y especificaciones: no cambió código ni evals, así que no hubo corrida nueva de la batería.

## Desviaciones respecto a la spec y por qué

1. **Excepciones de tamaño: ninguna hizo falta.** Las `size:exception` anticipadas de T2, T4, T6 y T7 no se usaron; T1 sí
   quedó dentro de la suya por las pruebas, no por lógica.
2. **T4 tuvo una primera pasada `partial`**: el repositorio de contactos vive en `agente/puertos` e `infraestructura/prisma`,
   fuera de la superficie que se le dio al writer. Se amplió y se retomó el mismo agente.
3. **`registrarConsentimiento(contactoId, acepta)` no recibe `instante`** (difiere de `design.md` D7): el adaptador lee el
   `Clock`. Repetir la misma respuesta conserva la fecha original.
4. **Límite de descargas de Docker Hub** bloqueó el CI durante T6; se resolvió con el login en el workflow (#124).
5. **Riesgos de entorno local**: el hook `pre-push` revisa el árbol de trabajo y no la rama empujada; `secretos --arbol` falla
   (`ENOENT`) si falta un archivo registrado; correr el hook o la integración desde un **worktree** escribió commits de
   fixture y dejó `core.bare=true`.
6. **Pruebas con tiempo (`CAN1`, límite de 500 ms)** se tambalean bajo carga local y pasan aisladas. El e2e en paralelo da
   fallos distintos por corrida en esta máquina; en serie pasan todos.
7. **Choque de ids aleatorios en fixtures** del repositorio de leads, corregido en #127.
8. **TDD con matices**: sin RED separado en `politica-pide-persona`, `prioridad-aviso`, el hecho de captura y la prueba de
   orden semilla-migración; las evals de T5 pasaron a la primera porque usan herramientas ya existentes.
9. **Texto del dueño protegido en la migración (T7)**: el padre detectó antes del commit que la semilla había dejado de leer la
   fila histórica `aviso_datos`, lo que perdía el texto editado si `casos:sembrar` corría antes que la migración. Se restauró
   como lectura de solo lectura (`CLAVE_LEGADA_AVISO_DATOS`) con una prueba del camino exacto.
10. **Filas viejas de `parametro` no se borran** (`mensaje_handoff*`, `mensaje_fuera_cobertura`, `mensaje_captura_completa`):
    es texto del dueño sin destino. Retirarlas es una decisión aparte.
11. **Especificaciones fusionadas con dos correcciones fuera del delta**: R1 de `agente` decía «7 herramientas» y citaba
    `politica_contraentrega_texto`; ahora dice nueve y ya no cita ese campo. Los tres escenarios de EST que citaban
    `estilo.v3.md` apuntan a `estilo.v4.md`.

## Decisiones y ADR

- ADR-0027 sigue `aceptada`. P65-P75 resueltas; P31 y P57 quedaron anotadas como superadas por la 12d.
- Esquema: dos columnas nulas en `contacto` y un `CHECK` hecho a mano (migración `20261009120000_consentimiento_datos`);
  `acepta_contacto` sin tocar. Dos migraciones de datos: `20261009130000_casos_a_intencion` y
  `20261009140000_casos_del_sistema_minimos`.
- Dependencias nuevas: ninguna.

## Pendientes abiertos

- Observaciones de la revisión nativa de T3: si `registrarPidePersona` lanza, el turno se pierde (ya ocurría; falta un
  respaldo de mejor esfuerzo y su prueba); el contexto puede decir «asesor ya avisado» aunque la marca deduplicó el aviso.
- `ResultadoSemilla.origenesDeTexto` cuenta sobre el plan, no sobre lo insertado (T5).
- Si el dueño renombra o borra «Tratamiento de datos» y corre `casos:sembrar`, la semilla lo vuelve a crear (comportamiento
  heredado de la 12; dicho en la guía).
- Tarea fuera de fase: `odd/tasks/medidas-en-ficha.md` (P74).
- **Observaciones de la revisión nativa del cierre sobre el texto de las specs** (no bloquean; el código ya hace lo que
  dice `design.md` D2 y queda por aclarar la redacción en una próxima pasada):
  - `agente` AGT4 (`openspec/specs/agente/spec.md`): el escenario de un turno que llama a `derivar_a_asesor` y a un
    `marcar_lead_caliente` confirmado dice que la respuesta lleva **un solo** aviso, y eso parece chocar con CNV14 y NTF8
    («un motivo distinto avisa»). El código elige un aviso por turno por prioridad (`prioridad-aviso.ts`) y el otro motivo
    queda sin marca, de modo que puede avisar en un turno posterior. Falta decirlo en la spec.
  - `conversaciones` CNV11: el escenario «un aviso junto con un traspaso: gana el traspaso y se descarta el aviso» solo
    cubre `pide-persona` con `fallo-llm`. La regla general también alcanza al aviso `lead-caliente` (un lead confirmado y,
    en el mismo turno, un traspaso por `fallo-llm` o `plazo-agotado`): el lead se guarda pero ese aviso se descarta.
    Conviene un escenario que lo cubra y confirmar con el dueño si ese aviso debe reintentarse.

## Pendientes `[manual]` del dueño

1. **`servicio/.env.example`**: cambia `AGENTE_TOPE_TURNOS=12` por `20` a mano (una regla de permisos impide que el agente
   edite ese archivo). El valor por defecto del esquema ya es 20.
2. **Un aviso real en Telegram** por cada motivo (pide una persona, lead caliente, audio repetido) y comprobar el enlace
   ([guía](../../../../docs/operacion/avisos-al-asesor.md)).
3. **Tomar el control desde Chatwoot**: escribir como asesor y comprobar que el bot se calla y que el mismo motivo vuelve
   a avisar en la sesión siguiente.
4. **Evals reales (EVL3)**, ahora con `seguridad.v1.md` y sin casos de conducta sembrados:
   `EVALS_MODO=real node --env-file=.env node_modules/vitest/vitest.mjs run --project evals --testTimeout=1200000`
   desde `servicio/`. Cubre AGT28 en dos turnos.
5. **Prueba por WhatsApp del consentimiento**: pedir datos, rechazar, aceptar y comprobar que solo entonces se guardan.
6. **Migraciones de datos de T6 y T7 contra tu propia base**, después de un respaldo: comprobar que «Contra entrega», «Sin
   cobertura de envío», «Datos completos fuera de horario» y «Tratamiento de datos» conservan tu texto y que los casos de
   traspaso desaparecen.
7. **Crear los casos de ejemplo que quieras** (Fotos, Costo del envío, Ubicación compartida, Saludo, Captura fuera de horario,
   Contra entrega, Sin cobertura): no se cargan solos; hasta crearlos el bot no tiene esa conducta
   ([guía](../../../../docs/operacion/casos-del-asistente.md)).
8. **Estilo mínimo**: si quieres el estilo de `estilo.v4.md` en una base que ya tiene estilo publicado, publícalo tú; la
   semilla no pisa lo existente.

## Qué aprendimos que cambia las fases siguientes

1. **Poner en el código solo la seguridad mínima y la conducta en casos de uso.** Todo lo que el bot dice o decide por
   negocio (fotos, envío, saludo, captura) es de un caso del dueño; el código entrega hechos y límites. Una regla de negocio
   en el prompt fijo es una conducta que el dueño no puede cambiar.
2. **Una migración de datos necesita una prueba de orden con la semilla.** El texto del dueño estuvo a punto de perderse porque
   `casos:sembrar` y la migración pueden correr en cualquier orden: probar los dos órdenes y las bases con y sin la fila.
3. **Darle al writer carpetas de módulo completas**, con `puertos/` e `infraestructura/`, no solo `aplicacion/`: T4 quedó
   `partial` porque el repositorio vivía fuera de la superficie.
4. **El CI necesita login a Docker Hub**: sin él, las descargas anónimas cortan la batería con Testcontainers. Ya está en el
   workflow (#124) con secretos del repositorio.
5. **No commitear ni empujar desde worktrees**: el hook y la integración escribieron commits de fixture y dejaron
   `core.bare=true`. Revisar `git config --local core.bare` al empezar y al terminar.
6. **Nunca dar por hecho un push en segundo plano**: verificar en el remoto (`gh pr view`, checks y cabeza exacta) antes de
   fusionar o de marcar una tarea.
7. **Las pruebas con límite de tiempo (`CAN1`) y los e2e en paralelo se tambalean bajo carga local**: correr los e2e en serie y
   tratar el CI de GitHub como referencia, sin llamar «flake» a lo que no se investigó.
8. **Una herramienta nueva del agente toca tres sitios**: su ficha en `HERRAMIENTAS_DEL_BOT` del cliente, la lista de la puerta
   de consentimiento (`HERRAMIENTAS_QUE_ESCRIBEN_DATOS`) si guarda datos del cliente, y la lista de herramientas en R1.
9. **Las evals guionadas no ven lo que `ProcesarTurno` hace** (marcas en Redis, orden de encolado): lo que depende de ello se
   prueba en integración y e2e, y la conducta del modelo en dos turnos solo con la corrida real.
