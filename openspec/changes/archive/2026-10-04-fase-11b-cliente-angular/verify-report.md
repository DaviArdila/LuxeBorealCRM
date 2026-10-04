# Verify report: Fase 11b — Cliente Angular: estilo del bot y mensajes fijos

- Fecha: 2026-10-04 · Spec aprobada por el dueño en la sesión del 2026-10-04 («apruebo la 11b»)
- Change: `openspec/changes/archive/2026-10-04-fase-11b-cliente-angular/`
- Guía de operación: [`docs/operacion/cliente-back-office.md`](../../../../docs/operacion/cliente-back-office.md)
- Entrega en 10 PRs apilados (`stacked-to-main`), cada uno fusionado con el CI verde y la cabeza exacta:

| Slice | Tareas | PR | Commit de unidad de trabajo |
|---|---|---|---|
| spec | ajustes de arquitectura del cliente (D7, D9-D13, CLT9) | #71 | `08a406c` |
| p1 | T1, compatibilidad de versiones | #72 | `4c9e1dc` |
| p2 | T2, endpoints del estilo en `agente` | #73 | `cf77f88` |
| p3 | T3, catálogos y casos de uso de mensajes fijos | #74 | `6f191de` |
| p4 | T4, endpoints de mensajes fijos y `mensajes:sembrar` | #75 | `901f194`, `a27f051` |
| p5 | T5, andamio de `cliente/` por áreas | #76 | `f004824` |
| p6 | T6, sesión en el cliente | #77 | `02f933c` |
| p7 | T7, pantalla «Estilo del bot» | #78 | `d0f71b5` |
| p8 | T8, pantalla «Mensajes fijos» | #79 | `d1bf85d` |
| p9 | T9, `cliente:ci` en `npm run ci` | #80 | `39a82cd` |
| p10 | T10, guía, specs fusionadas y archivo | ver `docs/fases/README.md` | el que archiva el change |

## Alcance verificado

Las diez tareas `[x]`. **T10 queda con un pendiente `[manual]`**: el dueño levanta la API y el cliente en su máquina, inicia
sesión, publica un estilo, edita `mensaje_handoff` y comprueba por WhatsApp (o con el simulador) que el siguiente mensaje usa
ambos, y que un usuario `asesor` no ve las pantallas. Todo lo automático está verificado contra Postgres 16 y Redis 7 reales
(Testcontainers), con la app completa y con el cliente construido.

La verificación de salida de la fase (`docs/fases/README.md`) quedó probada así:

| Criterio | Dónde |
|---|---|
| El dueño inicia sesión en local | `entrar.component.spec.ts` (CLT4) con `HttpTestingController`; las llamadas reales al servidor, en `autenticacion.e2e-spec.ts` (11a); recorrido real: `[manual]` |
| Publica un estilo y el siguiente mensaje del bot lo usa sin reiniciar | `estilo-admin.e2e-spec.ts` y el escenario de `agente-llm.e2e-spec.ts` (servidor); `estilo.component.spec.ts` (pantalla) |
| Edita un mensaje fijo y el siguiente mensaje lo usa sin reiniciar | `mensajes-fijos.e2e-spec.ts` y el escenario de `agente-politicas.e2e-spec.ts` (servidor); `mensajes-fijos.component.spec.ts` (pantalla) |
| Un asesor no ve esas pantallas y el servidor lo rechaza | `shell.component.spec.ts` y `app.routes.spec.ts` (el menú y la ruta); e2e de ambos controladores con `403` (el servidor) |

## Resultado por comando (cabeza de p9)

| Comando | Resultado |
|---|---|
| `npm run lint`, `typecheck`, `fronteras`, `contrato:deriva`, `cliente:deriva`, `commits`, `secretos`, `auditoria`, `flujos` | Verde |
| `npm test` (unitarios) | 187 archivos, **1.394 tests** (partía de 1.306) |
| `npm run test:integracion` | 61 archivos, **356 tests** (partía de 344) |
| `npm run test:e2e` | 9 archivos, **81 tests** (partía de 60) |
| `npm run evals` | 36 pasan, 1 omitido (sin cambios) |
| `npm run contrato:lint`, `contrato:diff` | 0 errores; sin cambios incompatibles contra `main` |
| `npm run cliente:ci` | Verde: lint, **65 tests** en 15 archivos, build (inicial 615 kB, 136 kB transferidos), auditoría, deriva y las dos pruebas de la raíz que lo necesitan |

## Escenarios de la spec

Los 47 escenarios (CLT 26 + AGT 8 + CFN 10 + CI 3) tienen su prueba con el nombre `<R#> — <escenario>`; el mapa por tarea está
en `tasks.md`.

| Requisito | Dónde se prueba |
|---|---|
| AGT23 | `estilo.controller.spec.ts`, `test/contrato/estilo.spec.ts`, `test/e2e/estilo-admin.e2e-spec.ts` y un escenario de `agente-llm.e2e-spec.ts` |
| CFN1, CFN2 | `mensajes-fijos.controller.spec.ts`, casos de uso del módulo `mensajes-fijos`, `test/e2e/mensajes-fijos.e2e-spec.ts` y un escenario de `agente-politicas.e2e-spec.ts` |
| CFN3 | `scripts/sembrar-mensajes-fijos.spec.ts` y `test/integracion/mensajes-fijos/sembrar-cli.spec.ts` (Postgres real) |
| CLT1 | `cliente-fronteras.spec.ts` (el import del servidor se rechaza) y el build de `cliente:ci`, que compila solo con las dependencias de `cliente/` |
| CLT2 | `test/fronteras/cliente-deriva.spec.ts` (contrato alterado nombra el archivo) y `cliente:deriva` |
| CLT3 | `test/fronteras/cliente-proxy.spec.ts` (proxy, puerto y rutas relativas); el recorrido real queda en el `[manual]` |
| CLT4, CLT5, CLT6 | `entrar.component.spec.ts`, `sesion.servicio.spec.ts`, `guardias.spec.ts`, `errores-http.interceptor.spec.ts`, `csrf.interceptor.spec.ts`, `app.routes.spec.ts`, `shell.component.spec.ts` |
| CLT7 | `estilo.component.spec.ts` (7) |
| CLT8 | `mensajes-fijos.component.spec.ts` (6) |
| CLT9 | `shell.component.spec.ts` (menú por rol con un área de prueba), `cliente-fronteras.spec.ts` (import entre áreas), `app.routes.spec.ts` y el build (el área `bot` sale en chunks aparte) |
| CI10 | `test/fronteras/ci-cliente.spec.ts` (5) y 2 casos en `auditar-dependencias.spec.ts` |

## Revisión

En la nube no hay `gentle-ai` (`docs/CONTEXTO_SESIONES.md`): sin revisión RDD nativa por commit. `judgment-day` no aplica
(regla 6: solo 04, 05, 06 y 10).

## Desviaciones respecto a la spec y por qué

1. **Estructura por áreas** (D7, D9, D10) en vez de la plana de la primera redacción: el dueño lo pidió al revisar la spec
   (#71); entró con su propio CLT9.
2. **El shell recibe las áreas por un token** (`AREAS_REGISTRADAS`) y no importa el registro, para probar de verdad que un
   área nueva aparece en el menú sin tocar el shell.
3. **La pantalla de inicio de sesión se carga en diferido** y el aviso del presupuesto de bundle pasó de 600 a **700 kB** (el
   error sigue en 1 MB): PrimeNG compartido entre el shell y las pantallas entra en el arranque (615 kB, 136 kB transferidos).
4. **«Mensajes fijos» es una lista de filas, no un `p-table`**: son diez textos largos que se leen mejor en pantallas angostas.
5. **La advertencia de `aviso_datos` no se duplica en el cliente**: se muestra la descripción del servidor, que ya la trae.
6. **`size:exception`** en T3, T4, T5, T6 y T7, escritas en `tasks.md`: los forecasts quedaron cortos sobre todo por las
   pruebas. Nada se recortó.
7. **Excepciones de auditoría nuevas** (T9): `@boundaries/elements` y `eslint-plugin-boundaries`, herramienta de desarrollo
   del lint del cliente que hereda el aviso de `braces` sin parche; vencen el 2027-01-04. **Decisión a revisar por el dueño.**
8. **Encabezados de `tasks.md`**: al agregar las notas de T2 y T3 se perdieron por error los de `### T3` y `### T4`; se
   restauraron en el commit de T4.
9. **TDD con matices**: el andamio de T5 y los componentes compartidos de T7 se escribieron junto con sus pruebas, sin un
   RED separado; cada pantalla y servicio sí tiene su RED observado, anotado en `tasks.md`.
10. **Docker se cayó una vez** durante la batería de T6 (7 pruebas de `gitleaks`, `oasdiff` y `actionlint` fallaron por eso);
    con `dockerd` reiniciado la repetición quedó verde. No es del código de la fase.

## Decisiones y ADR

- ADR-0022 (cliente Angular en el repo, `cliente/` aislado) sigue en estado **`propuesta`**: lo acepta el dueño.
- ADR-0021 (sesión opaca en cookie + Redis, de la 11a) sigue `propuesta`.
- Dependencias nuevas del cliente (registro de compatibilidad en `design.md`): Angular 22.2.1, PrimeNG 22.1.2 con
  `@primeuix/themes`, `primeicons`, `ng-openapi-gen` 1.1.0, `angular-eslint` 22.5.0, `eslint-plugin-boundaries` 7.2.0 y
  `eslint-import-resolver-typescript`. El servidor no suma dependencias.
- Preguntas P56, P57 y P58 resueltas con su default; P55 (cómo se sirve el cliente en producción) queda para la 09b.

## Límites conocidos

- **El cliente solo corre en local**: servirlo en producción bajo el mismo dominio de la API se decide en la 09b (P55).
- **Mensajes y estilo sin evals integradas**: la pantalla solo recuerda correr las evals reales (EVL3); no las ejecuta.
- **Solo rol `admin`** en estas pantallas (P58); un asesor entra al cliente pero no ve ninguna pantalla útil todavía.
- **Sin pruebas de navegador real**: los tests del cliente corren en jsdom; el recorrido en un navegador es el `[manual]`.
- La prueba `test/integracion/agente/publicar-estilo.spec.ts` puede fallar de forma intermitente por una clave global de
  Redis compartida con otro test (visto en la 11a, no reapareció en esta fase); el arreglo propuesto sigue pendiente.

## Pendientes abiertos

- `[manual]` T10: el recorrido real del dueño (levantar API y cliente, iniciar sesión, publicar un estilo, editar
  `mensaje_handoff`, comprobar por WhatsApp o el simulador; un asesor no ve las pantallas).
- Aceptar o ajustar ADR-0022 (y ADR-0021), y aceptar o rechazar las dos excepciones de auditoría nuevas.
- Primer usuario administrador del dueño (`npm run usuario:crear`), pendiente desde la 11a.

## Qué aprendimos que cambia las fases siguientes

1. **Un área nueva es una carpeta y una línea**: la 11c (perfil del bot, escenarios) y la 12 (inventario) se agregan sin
   tocar el shell, y el lint impide que se enreden entre sí.
2. **Cada cambio de endpoint pide regenerar el cliente**: `contrato:generar` y `cliente:generar` van juntos o `npm run ci`
   falla en la deriva.
3. **`npm run ci` ahora tarda más** por el `npm ci` y el build del cliente; el workflow cachea el lockfile del cliente.
4. **Los presupuestos de PR se quedan cortos con pruebas de pantallas y de arranque completo**: conviene presupuestar las
   pruebas aparte o partir la tarea.
5. **Los tests de componentes con PrimeNG exigen cuidado con los temporizadores**: con relojes falsos `whenStable` no
   termina; se avanza el reloj y se pinta a mano.
