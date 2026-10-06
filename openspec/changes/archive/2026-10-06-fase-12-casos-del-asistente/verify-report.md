# Verify report: Fase 12 — Casos de uso del asistente, estilo desacoplado y configuración del negocio

- Fecha: 2026-10-06 · Spec aprobada por el dueño el 2026-10-05 («procede con todo»)
- Change: `openspec/changes/archive/2026-10-06-fase-12-casos-del-asistente/`
- Guías de operación: [`casos-del-asistente.md`](../../../../docs/operacion/casos-del-asistente.md),
  [`configuracion-del-negocio.md`](../../../../docs/operacion/configuracion-del-negocio.md),
  [`estilo-del-bot.md`](../../../../docs/operacion/estilo-del-bot.md) y
  [`cliente-back-office.md`](../../../../docs/operacion/cliente-back-office.md)
- Entrega en 12 PRs, uno por tarea y cada uno desde `main` actualizado, fusionado con el CI verde y la cabeza exacta:

| Slice | Tarea | PR | Commit de unidad de trabajo |
|---|---|---|---|
| p1 | T1, menú lateral con submódulos | #89 | `0de5232` |
| p2 | T2, ventana de edición y «Estilo del bot» al patrón | #93 | `0a6bc17`, `1db7dd0` |
| p3 | T3, estilo en `version_estilo` con autor | #94 | `6ad0d53` |
| p4 | T4, módulo `asistente`, puerto de textos y semilla | #95 | `4c76947`, `cf014b6` |
| p5 | T5, corte de los textos del sistema al puerto | #96 | `da19b9b` |
| p6 | T6, `consultar_caso`, índice y contra entrega | #97 | `86d4d50`, `4470464` |
| p7 | T7, API de categorías y casos | #98 | `61a989f` |
| p8 | T8, pantalla «Casos de uso» y retiro de «Mensajes fijos» | #99 | `7edcb43`, `698986b` |
| p9 | T9, configuración del negocio por la API | #100 | `3d4fb1d` |
| p10 | T10, pantallas de Configuración | #101 | `1ccdcf3` |
| p11 | T11, limpieza final | #102 | `39ebfc7` |
| p12 | T12, cierre documental y archivo | el que archiva este change | — |

## Alcance verificado

Las doce tareas `[x]`. **T12 deja cuatro pruebas `[manual]` del dueño** (abajo): se listan con sus comandos y no se ejecutaron
aquí. Todo lo automático está verificado contra Postgres 16 y Redis 7 reales (Testcontainers), con la app completa y con el
cliente construido.

La verificación de salida de la fase (`docs/fases/README.md`) quedó probada así:

| Criterio | Dónde |
|---|---|
| El dueño crea el caso «Medios de pago» y el bot lo usa | `administracion.spec.ts` (integración) y `asistente.e2e-spec.ts` (crear por la API); el caso entra al índice y `consultar_caso` lo cita (`consultar-caso.spec.ts`, evals `caso-literal`, `caso-guia`, `caso-indice-grande`); por WhatsApp: `[manual]` 2 |
| Edita el caso de audio y rige en el siguiente evento | e2e CAS7 de `agente-politicas.e2e-spec.ts` (edita por `PATCH /asistente/casos/:id` y el siguiente audio ya usa el texto) |
| Cambia el recargo y la siguiente cotización lo refleja | **Desviado**: el recargo no entra en ninguna cotización hoy (ver «Desviaciones» 4). Probado: el factor volumétrico cambia la siguiente lectura del catálogo (CFG3, R15) y el recargo queda guardado, validado y listo para la 13 |
| Publica un estilo desde la ventana y ve quién lo publicó | `estilo.component.spec.ts` (SHL9) y `estilo-admin.e2e-spec.ts` (EST-D3) |
| No queda nada del sistema viejo | `textos-sin-parametro.spec.ts` (CAS7, CFG6), `limpieza-parametro.spec.ts` (migración y semilla) y el importador que rechaza filas de texto |

## Resultado por comando (cabeza de p11, antes del cierre)

| Comando | Resultado |
|---|---|
| `npm run lint`, `typecheck`, `fronteras` (regla 16 nueva), `contrato:deriva`, `contrato:diff`, `commits` | Verde |
| `npm test` (unitarios) | 195 archivos, **1.554 tests** (la 11b cerró en 1.394) |
| `npm run test:integracion` | 64 archivos, **417 tests** (356) |
| `npm run test:e2e` | 10 archivos, **99 tests** (81) |
| `npm run evals` | 41 pasan, 1 omitido (36 y 1) |
| `npm --prefix cliente run ci` | Verde: lint, **118 tests** en 21 archivos, 22 de herramientas, build y `api:deriva` |
| `npm run ci` en GitHub Actions (cada PR) | Verde en la cabeza fusionada de los once PRs de código |

## Escenarios de la spec

Los 142 escenarios tienen su prueba con el nombre `<ID> — <escenario>`; el mapa por tarea está en `tasks.md`. Los requisitos
nuevos y dónde se prueban:

| Requisito | Dónde se prueba |
|---|---|
| SHL1-SHL7 | `menu-lateral.spec.ts`, `shell.component.spec.ts`, `app.routes.spec.ts` |
| SHL8, SHL9 | `dialogo-edicion.component.spec.ts`, `edicion-en-ventana.spec.ts` (estructura), `estilo.component.spec.ts` |
| EST-D1-EST-D5 | `repositorio-estilo.spec.ts`, `version-estilo-migracion.spec.ts`, `estilo-admin.e2e-spec.ts`, `limpieza-parametro.spec.ts` |
| CAS1-CAS7 | `administrar-*.spec.ts`, `validar-caso.spec.ts`, `sembrar-casos.spec.ts`, `proveedor-textos.spec.ts`, `test/integracion/asistente/` |
| CAS8, CAS11 | `consultar-caso.spec.ts`, `ensamblar-prompt.spec.ts`, evals `caso-*`, `cotizar-envio.spec.ts` |
| CAS9, CAS10 | `asistente.controller` (e2e), `test/contrato/asistente.spec.ts`, `administracion.spec.ts` (cursor y buscador) |
| SHL10 | `casos.component.spec.ts` (10) |
| CFG1-CFG6 | `configuracion.spec.ts` (integración, 13), `configuracion.e2e-spec.ts` (8), `test/contrato/configuracion.spec.ts`, `administrar-configuracion.spec.ts`, `validar-catalogo.spec.ts`, `repositorio-parametro-prisma.spec.ts` |
| SHL11 | `horario`, `envios` y `gasto-llm` `.component.spec.ts`, `registro.spec.ts` |
| R15, CLT9 (modificados) | `configuracion.spec.ts` (R15) y `registro.spec.ts` (CLT9) |

## Revisión

En la nube no hay `gentle-ai`: sin revisión RDD nativa por commit. `judgment-day` no aplica (regla 6: solo 04, 05, 06 y 10).

## Desviaciones respecto a la spec y por qué

1. **`size:exception`** en T2, T3, T4, T6, T7, T8, T9 y T10, escritas en `tasks.md`: las pruebas de pantallas y de arranque
   completo exceden el presupuesto. Nada se recortó.
2. **Retiro de rutas y `contrato:diff`** (T8): oasdiff bloquea todo retiro sin deprecación y no había forma de anotar uno
   decidido. Se añadió `openapi/oasdiff-ignorar.txt` (una línea por retiro, `--err-ignore`); lo no anotado sigue bloqueando.
3. **`leerProblema` y las rutas sin cuerpo** (T8): el error de un `DELETE` llegaba como texto y la pantalla mostraba «Error
   inesperado»; ahora se lee el JSON de la cadena (con prueba).
4. **El recargo no entra en ninguna cotización** (T9): CFG3 prometía «cambiar el recargo cambia la siguiente cotización», pero
   MODELO_DATOS lo define como dato interno de la Fase 13 y CAS11 prohíbe que el bot lo cite; ningún código lo lee. Se guarda,
   se valida y se invalida la caché; la prueba equivalente usa el factor volumétrico. **El dueño decide** si ajusta el criterio
   de salida o espera a la 13.
5. **Registro tipado con predicados y no con un esquema Zod por clave** (T9): el dominio no importa librerías. El aviso de
   «valor del tipo equivocado» (CFG6) está solo en el lector del factor volumétrico, el único que lee `parametro` hoy.
6. **El `422` de configuración trae un `detail` con «campo: regla»** y no un motivo por campo estructurado: las pantallas lo
   muestran completo dentro de la ventana, no junto a cada control (SHL11).
7. **La migración de limpieza borra solo `prompt_estilo*`** (T11): `mensaje_*`/`politica_*` los retira `casos:sembrar` al
   copiarlos; borrarlos en una migración perdería los textos de una base que aún no sembró. Por eso `politica_` sigue en la
   semilla: es la vía de migración, no un lector. `casos:sembrar` ganó `--archivo` para los datos de desarrollo.
8. **TDD con matices**: los componentes de T10 y las rutas de T9 se escribieron junto con sus pruebas; el RED observado de T10
   se limitó a 2 pruebas que fallaron por jsdom (el interruptor es un botón y `type="time"` descarta «25:00») y se ajustaron
   las pruebas, no el comportamiento. Las demás tareas tienen su RED observado, anotado en `tasks.md`.
9. **El módulo se llama `ConfiguracionNegocioModule`** porque `ConfiguracionModule` ya es el de `plataforma/config`.
10. **Node del entorno**: el Angular CLI exige ≥22.22.3 y el entorno traía 22.22.0; se usó un Node 22.23.3 descargado aparte
    (no es del código).

## Decisiones y ADR

- **ADR-0024 (casos del asistente) sigue en `propuesta`**: lo acepta el dueño. ADR-0022 y ADR-0021 siguen como estaban.
- P59-P63 resueltas con su default al aprobar la fase; no quedan preguntas nuevas.
- Dependencias nuevas: ninguna.

## Límites conocidos

- Sin pruebas de navegador real: los tests del cliente corren en jsdom.
- Las evals reales no se corrieron (necesitan la clave del dueño): `[manual]` 1.
- Los casos no guardan historial de versiones (P61): otro admin que edite a la vez se detecta por la fecha (`caso-modificado`).
- El índice de casos tiene un tope (60 casos / 6.000 caracteres); pasado el tope, los casos extra no entran al índice.
- La prueba `test/integracion/agente/prompts-build.spec.ts` falla solo en Windows (conocido, no es de la fase).

## Pendientes `[manual]` del dueño (no se ejecutaron aquí)

1. **Evals reales tras el índice de casos** (límite de 2 USD por sesión, P32/P40), desde `servicio/`, con `OPENROUTER_API_KEY` en
   tu `.env` (no se imprime ni se commitea):
   `EVALS_MODO=real node --env-file=.env node_modules/vitest/vitest.mjs run --project evals --testTimeout=1200000`.
   Esperado: veredicto aprobado y costo cercano a 0,01 USD; si baja del umbral, revisar los casos antes de abrir el bot al público.
2. **Prueba por WhatsApp**: con la API, el cliente y Chatwoot arriba (ver 3), en «Casos de uso» crear el caso «Medios de
   pago» (categoría «Políticas», cuándo aplica: «Cuando preguntan cómo pagar», texto sin valores en pesos), escribirle al bot
   «¿cómo puedo pagar?» y comprobar que cita el texto; luego editar el caso «Audio recibido» (`mensaje_pedir_texto_audio`),
   mandar un audio y comprobar que responde el texto nuevo sin reiniciar.
3. **Recorrido real**: `docker compose up -d` y `npm run prisma:aplicar` en `servicio/`; `npm run casos:sembrar` (opcional:
   `-- --archivo datos-desarrollo/asistente/casos.json`); `npm run usuario:crear -- --email <correo> --nombre <nombre> --rol admin`;
   `npm run start:dev` en `servicio/` y `npm start` en `cliente/`. Entrar, abrir el menú y ver los grupos «Asistente» y
   «Configuración», el modo compacto y el cajón en el teléfono; editar el estilo desde la ventana y ver quién lo publicó;
   cambiar el horario, agregar y quitar una excepción, editar el recargo y el techo del LLM; entrar con un `asesor` y comprobar
   que no ve ninguno de esos grupos.
4. **Comprobar a mano los `CHECK` y el índice único parcial** (T3 y T4) contra Postgres:
   `docker exec luxeborealcrm-postgres-1 psql -U luxe -d luxeboreal -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('caso_asistente_evento_requiere_sistema_check','caso_asistente_sistema_activo_check');"`
   y `docker exec luxeborealcrm-postgres-1 psql -U luxe -d luxeboreal -c "SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'version_estilo_vigente_key';"`.
   Debe aparecer cada uno, con `UNIQUE … WHERE vigente` en el índice. (Los guarda también `npm run test:integracion`, PER9.)
- Aceptar o ajustar ADR-0024 y decidir la desviación 4 (recargo y cotización).

## Qué aprendimos que cambia las fases siguientes

1. **Un retiro de ruta necesita su anotación en `openapi/oasdiff-ignorar.txt`**: sin ella el CI de `contrato:diff` bloquea el PR,
   y localmente no se nota porque `npm run ci:hook` no lo corre. Conviene correr `npm run contrato:diff` antes de empujar un retiro.
2. **Las respuestas sin cuerpo (`DELETE`) llegan como texto**: toda pantalla que lea errores pasa por `leerProblema`, que ya lo
   resuelve; no leer `error.error` a mano.
3. **Los tests de integración comparten la base**: asertar solo sobre las filas que el propio test sembró y limpiar sus claves;
   los contadores Redis globales se aíslan por worker.
4. **La 13 (ventas) hereda el recargo**: `recargo_contraentrega_pct` ya está validado, editable y con su pantalla; la 13 solo
   debe leerlo por el puerto de `configuracion` o un lector propio, nunca desde el LLM (R1, R2).
5. **Agregar un caso del sistema** es una entrada en `asistente/dominio/sistema.ts` con su respaldo, un cambio en la semilla y
   el consumidor que lo pida por `TEXTOS_ASISTENTE`: ningún módulo vuelve a leer textos de `parametro` (test de fronteras).
6. **Las pruebas de pantallas con `MatDialog` esperan el cierre por tiempo**, no por vueltas del bucle de eventos.
7. **Los presupuestos de PR de pantallas y de arranque completo** se exceden por las pruebas: presupuestarlas aparte.
