# Verify report: Fase 11a — Usuarios y autenticación

- Fecha: 2026-10-04 · Spec aprobada por el dueño en la sesión del 2026-10-04 (PR #63 fusionado)
- Change: `openspec/changes/archive/2026-10-04-fase-11a-autenticacion/`
- Guía de operación: [`docs/operacion/usuarios-y-sesiones.md`](../../../../docs/operacion/usuarios-y-sesiones.md)
- Entrega en 6 PRs apilados (`stacked-to-main`), cada uno fusionado con el CI verde y la cabeza exacta:

| Slice | Tareas | Rama | PR | Commit de unidad de trabajo |
|---|---|---|---|---|
| p1 | T1, T2 | `fase-11a-p1-dominio` | #65 | T1 `cbccffe`, T2 `97e9437` |
| p2 | T3 | `fase-11a-p2-adaptadores` | #66 | `b7e119c` |
| p3 | T4 | `fase-11a-p3-casos-de-uso` | #67 | `09ad601` |
| p4 | T5 | `fase-11a-p4-guardias` | #68 | `05438b5` |
| p5 | T6 | `fase-11a-p5-controlador` | #69 | `fed5854` |
| p6 | T7, T8 | `fase-11a-p6-comando-y-cierre` | ver `docs/fases/README.md` | T7 `034f511`; T8 en el commit que archiva el change |

## Alcance verificado

Las ocho tareas `[x]`. **T8 queda con un pendiente `[manual]`**: el dueño crea su usuario con el comando e inicia
sesión desde Scalar o `curl` en su entorno local, y comprueba en PowerShell que la contraseña no se muestra. Todo lo
automático está verificado contra Postgres 16 y Redis 7 reales (Testcontainers) y con la app completa.

La verificación de salida de la fase (`docs/fases/README.md`) quedó probada así:

| Criterio | Dónde |
|---|---|
| Con un usuario creado por comando, `POST /api/v1/auth/sesion` deja la cookie | Prueba real del comando con TTY contra un Postgres temporal (T7) + e2e «recorrido completo» y USR2 |
| `GET /api/v1/auth/yo` responde | e2e USR5 |
| Un asesor recibe `403` en una ruta de admin | e2e API7 (ruta *fixture*) e integración USR6 |
| Cerrar sesión invalida la cookie al instante | e2e USR4 |
| Contrato con `cookieAuth` y deriva en verde | `test/contrato/autenticacion.spec.ts` (API11), `contrato:deriva`, `contrato:lint`, `contrato:diff` |

## Resultado por comando (cabeza de p6)

| Comando | Resultado |
|---|---|
| `npm run lint`, `typecheck`, `fronteras`, `contrato:deriva`, `commits`, `secretos` | Verde |
| `npm test` (unitarios) | 176 archivos, **1.306 tests** (partía de 1.240) |
| `npm run test:integracion` | 59 archivos, **344 tests** (partía de 308); ver «Defectos vistos» |
| `npm run test:e2e` | 7 archivos, **60 tests** (partía de 42) |
| `npm run evals` | 36 pasan, 1 omitido (sin cambios) |
| `npm run contrato:lint` | 0 errores; 16 avisos de descripción y etiquetas, del mismo tipo que ya tenían `/health` y el webhook |
| `npm run contrato:diff` | Sin cambios incompatibles contra `main` |


## Escenarios de la spec

Los 42 escenarios (USR 37 + API 5) tienen su prueba con el nombre `<R#> — <escenario>`; el mapa por tarea está en
`tasks.md`.

| Requisito | Dónde se prueba |
|---|---|
| USR1, USR8 | `iniciar-sesion.spec.ts` (unitario); USR8 «El contador no guarda el correo en claro» en `adaptadores-usuarios.spec.ts` |
| USR2, USR4, USR5, USR9, API7 | `test/e2e/autenticacion.e2e-spec.ts` |
| USR3 | `obtener-sesion-actual.spec.ts` (duración máxima), `adaptadores-usuarios.spec.ts` (sin datos personales), `guardias.spec.ts` (renovación, inactividad) |
| USR6 | `guardias.spec.ts` (4) y e2e (webhook, `/health`) |
| USR7 | `guardias.spec.ts` (3) |
| USR10 | `crear-usuario.spec.ts` (unitario), `test/integracion/usuarios/crear-usuario.spec.ts` (primer admin con argon2id real) |
| API11 | `test/contrato/autenticacion.spec.ts` |

## Revisión

En la nube no hay `gentle-ai` (`docs/CONTEXTO_SESIONES.md`): sin revisión RDD nativa por commit. La review RDD de la
spec había dejado tres hallazgos informativos; los tres quedaron atendidos:

| Hallazgo | Cómo quedó |
|---|---|
| Duración máxima de la sesión solo en el caso de uso | `ObtenerSesionActual` es el único lugar que la aplica y lo usan la guardia y `GET /auth/yo`; probada en unitario e integración |
| Contradicción menor sobre `/health` público | D3: fuera de `/api/v1` no actúan las guardias de sesión ni de CSRF; e2e USR6 con `/health` sin cookie |
| Carrera en el límite de intentos | Puerto `consumirIntento` atómico (`INCR` + `EXPIRE NX` en un `MULTI`) antes de verificar la contraseña; 12 intentos simultáneos dejan pasar 5 |

`judgment-day` no aplica (regla 6: solo 04, 05, 06 y 10).

## Desviaciones respecto a la spec y por qué

1. **`LimiteIntentos` pasa a `consumirIntento` + `reiniciar`** (D5): resuelve la carrera del hallazgo RDD. Los escenarios
   de USR8 no cambian.
2. **Renovar la sesión reescribe la última actividad** con `SET … EX … XX` en vez de solo `EXPIRE` (D1): así la sesión
   guarda de verdad la última actividad (USR3) y una sesión borrada a la vez no resucita.
3. **`validarContrasenaNueva` rechaza más de 200 caracteres**: es el tope del inicio de sesión; sin él se podría crear
   una contraseña que nunca serviría para entrar.
4. **`LectorContrasena` se pasa como argumento** de `CrearUsuario.ejecutar` en vez de inyectarse con token (D7): solo el
   comando lo tiene.
5. **La redacción de `cookie`/`set-cookie` ya existía** desde la 00a; su test queda como regresión.
6. **Controladores *fixture* abiertos**: el de `test/contrato/` gana `@Publico()` y `@SinCsrf()` (sus tests miden
   validación y errores); el e2e trae una ruta de admin propia porque la 11a no tiene ninguna.
7. **Dos tests asumían el documento público vacío** (`documento-interno.spec.ts` y PLT7 de
   `verificar-deriva-contrato.spec.ts`); su premisa pasa a «el público no tiene `/health`».
8. **Ramas por slice** (`fase-11a-pK-<tema>`) en vez de una rama única de fase, como pide `CLAUDE.md`.
9. **`size:exception`** en T3, T4, T5, T6 y T7, escritas en `tasks.md`: los forecasts quedaron cortos sobre todo por los
   tests de integración y e2e. Nada se recortó.
10. **T1 sin PowerShell**: no existe en la nube; pasa a la prueba `[manual]` de T8.

## Decisiones y ADR

- ADR-0021 (sesión opaca en cookie + Redis) sigue en estado **`propuesta`**: lo acepta el dueño.
- Dependencias nuevas: `@node-rs/argon2` 2.2.1 y `cookie` 2.0.1 (registro de compatibilidad en `design.md`).

## Defectos vistos (no son de esta fase)

| Test | Causa |
|---|---|
| `test/integracion/agente/publicar-estilo.spec.ts` («cada publicación sube la versión compartida de Redis») | Falló una vez en la batería de p6 (`expected '4' to be '2'`) y pasó en la segunda corrida y en solitario. Causa: él y `repositorio-estilo.spec.ts` (Fase 08c) incrementan y borran la clave global `agente:prompt:version`, sin prefijo de worker, en paralelo. Arreglo propuesto, fuera de esta fase: que `VersionEstiloRedis` reciba la clave por constructor y los tests usen una con `prefijoRedisDePrueba()`, como ya se hizo con `claveInterruptorDePrueba()` |

## Límites conocidos

- **Si Redis se reinicia, todos vuelven a iniciar sesión** y se reinician los contadores de intentos.
- **`trust proxy` falta**: detrás del proxy de producción (09b) el límite de intentos vería la IP del proxy.
- **Sin comando para cambiar contraseña, desactivar ni cambiar el rol** (P52): se hace a mano en la base.
- El documento OpenAPI tiene avisos de Spectral (`operation-description`, `operation-tag-defined`) que no son errores.

## Pendientes abiertos

- `[manual]` T8: el dueño crea su usuario con `npm run usuario:crear`, inicia sesión desde Scalar o `curl` y comprueba
  en PowerShell que la contraseña no se ve al teclearla.
- Aceptar o ajustar ADR-0021.

## Qué aprendimos que cambia las fases siguientes

1. **Las guardias globales cierran por defecto**: toda ruta nueva de `/api/v1` (11b en adelante) nace protegida; hay que
   marcar `@Publico()` a propósito y documentar `security: []` y `X-Luxe-Csrf` en el contrato, o
   `test/contrato/autenticacion.spec.ts` falla.
2. **`respuestaProblema`** documenta cualquier 4xx en problem+json: los endpoints de la 11b deben usarlo para que
   Spectral no marque error.
3. **`nestjs-pino` crea su logger raíz una vez por proceso**: un e2e que quiera capturar logs necesita un solo stream por
   archivo.
4. **Los forecasts de tamaño se quedan cortos con e2e de arranque completo**: para la 11b conviene presupuestar el e2e
   aparte o partir esa tarea.
5. **En la nube se puede levantar Docker** (`dockerd` está instalado): toda la batería, incluida la integración, corrió
   en la sesión, sin pushes con `--no-verify`.
