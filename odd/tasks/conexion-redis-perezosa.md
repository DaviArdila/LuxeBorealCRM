# Conexión perezosa a Redis y bloqueos del push

Trabajo fuera de fase (ODD). Diagnóstico del 2026-10-03, hecho al publicar el PR #63
(`docs/fase-11-spec`). **Estado: implementado** (T1–T3, 2026-10-03). T4 y T5 siguen pendientes y
dependen del dueño.

## Objetivo

Que un push no necesite `--no-verify` y que `npm run ci` no falle de forma intermitente por una
carrera en la conexión a Redis.

## Qué pasó

Al empujar `docs/fase-11-spec` aparecieron tres problemas distintos. Ninguno lo causó ese cambio, que
solo trae documentación.

| # | Síntoma | Dónde | Causa | ¿Bloquea? |
|---|---|---|---|---|
| 1 | El hook `pre-push` falla en 7 tests | Local | Docker Desktop apagado | Sí, en local |
| 2 | `npm error code EALLOWSCRIPTS` en la salida | Local | `~/.npmrc` del usuario | No (ruido) |
| 3 | `npm run ci` falla en el run `pull_request` y pasa en el run `push` del **mismo commit** | GitHub Actions | Carrera en la conexión perezosa a Redis | Sí, de forma intermitente |

### 1. Docker Desktop apagado (local)

`npm run ci:hook` corre `gitleaks` y `actionlint` dentro de contenedores. Sin Docker Desktop fallan:

- `test/fronteras/buscar-secretos.spec.ts` (CI3), con 3 tests.
- `test/fronteras/validar-flujos.spec.ts` (CI6), con 2 tests.
- `test/fronteras/comparar-contrato.spec.ts` (CI9), con 2 tests.

Evidencia:

- El error es `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`.
- Los mismos 7 tests fallan igual en `main`.

**Arreglo:** abrir Docker Desktop antes de empujar. No hace falta código. Opcional: que el hook
detecte Docker apagado y lo diga en una línea, en vez de mostrar 7 fallas de tests.

### 2. `EALLOWSCRIPTS` (local, no bloquea)

`C:\Users\ASUS\.npmrc` contiene `allow-scripts=@anthropic-ai/claude-code`. npm 11.17 rechaza esa
opción dentro de un proyecto («--allow-scripts is not allowed in project-scoped installs»). Cada `npx`
que corre en el repo imprime el error, pero el comando sigue y termina con código 0. Ya se había visto
en el `verify-report.md` de la Fase 03 (línea 99) sin investigarse.

**Arreglo:** decisión del dueño, porque es su configuración global y no es del repo. Hay dos
opciones:

- Dejarla y aceptar el ruido.
- Mover esa entrada al campo `allowScripts` donde npm la acepte.

### 3. Carrera en `conectarSiHaceFalta` (CI intermitente, la causa real del PR rojo)

Test que falló, en el run 37170177213 (`pull_request`). El run 37170174068 (`push`) del mismo commit
pasó:

```
FAIL integracion test/integracion/conversaciones/consumidor-conversaciones.spec.ts
  > ConsumidorConversaciones — 08d: cliente esperando (CNV12)
  > CNV12 — en handoff pendiente el cliente que escribe también queda esperando
Error: Stream isn't writeable and enableOfflineQueue options is false
  ❯ MarcaMensajeProcesado.estaProcesado  marca-mensaje-procesado.ts:34
```

**Causa raíz.** El cliente compartido de `src/plataforma/redis/redis.module.ts` usa `lazyConnect: true`
y `enableOfflineQueue: false`. Cada adaptador conecta en su primer uso con esta función:

```ts
private async conectarSiHaceFalta(): Promise<void> {
  if (this.redis.status === 'wait' || this.redis.status === 'close' || this.redis.status === 'end') {
    await this.redis.connect();
  }
}
```

La secuencia que produce la falla:

1. Si otro adaptador ya llamó a `connect()`, el estado es `connecting` (o `reconnecting`).
2. La función no entra al `if` y vuelve **sin esperar** a que el cliente quede `ready`.
3. El comando siguiente sale con el socket aún no escribible.
4. Sin cola offline, ioredis lo rechaza al instante.

Que falle o no depende de qué adaptador gana la carrera. Por eso el mismo commit pasa en un run y
falla en otro. «Flake» no es la causa: el defecto está en el código.

**Alcance.** La misma función está copiada en 11 adaptadores:

- `src/modulos/conversaciones/infraestructura/redis/`:
  - `marca-mensaje-procesado.ts`
  - `marca-espera-handoff.ts`
  - `marca-espera-cliente-redis.ts`
  - `lock-turno.ts`
  - `interruptor-global-redis.ts`
  - `contador-rate-limit.ts`
  - `buffer-turno.ts`
- `src/modulos/agente/infraestructura/redis/`:
  - `version-estilo-redis.ts`
  - `historial-redis.ts`
  - `contadores-sesion-redis.ts`
- `src/modulos/catalogo/infraestructura/cache-catalogo-redis.ts`

En producción afecta el primer mensaje tras un arranque o una reconexión, cuando dos adaptadores lo
usan a la vez. Ese mensaje fallaría y el inbox lo reintentaría.

**Arreglo propuesto:**

- Una sola función compartida en `src/plataforma/redis/`, por ejemplo `asegurarConexion(cliente)`:
  - Si el estado es `ready`, vuelve.
  - Si es `wait`, `close` o `end`, llama a `connect()`.
  - Si es `connecting`, `connect` o `reconnecting`, espera el evento `ready`, o `error`/`end` para
    rechazar, con un plazo acotado.
- Los 11 adaptadores la usan en lugar de su copia.
- `indicador-redis.ts` de salud se revisa con el mismo criterio.

## Tareas

- [x] T1 — Test RED.
  - Unitario de `asegurarConexion` con un cliente falso en estado `connecting` que pasa a `ready`. Hoy
    el comando sale antes del `ready`.
  - Caso de integración que reproduce la carrera: dos adaptadores sobre un cliente recién creado, en
    paralelo.
  - Ruta: delegada (un writer junto con T2 y T3).
  - Evidencia: `src/plataforma/redis/asegurar-conexion.spec.ts` contra un stub con la lógica vieja dio
    8 de 14 tests en rojo (los estados `connecting`/`connect`/`reconnecting`, error, `end` y plazo).
    `test/integracion/redis/conexion-perezosa.spec.ts` dio 2 de 2 en rojo con el mismo error de CI:
    «Stream isn't writeable and enableOfflineQueue options is false». La carrera es determinista: el
    primer `connect()` deja el estado en `connecting` de forma síncrona.
- [x] T2 — `asegurarConexion` en `src/plataforma/redis/` (GREEN), con su TSDoc. Ruta: delegada.
  - Plazo `PLAZO_CONEXION_MS` = 10 s, el `connectTimeout` por defecto de ioredis.
  - Si `connect()` rechaza con «already connecting/connected», espera el `ready` en vez de fallar.
  - Evidencia: unitario 14/14 y regresión de integración 2/2 en verde.
- [x] T3 — Reemplazar `conectarSiHaceFalta` en los 11 adaptadores (REFACTOR). Se corren los proyectos
  `unit`, `integracion`, `e2e` y `evals`. Ruta: delegada, un writer (11 archivos).
  - `indicador-redis.ts` tenía el mismo defecto (en `connecting` daba `down` con Redis sano) y
    también usa la función. Sigue acotado por `HEALTH_TIMEOUT_MS` y sigue sin exponer el error.
  - Evidencia: ver «Resultado de la verificación».
- [ ] T4 — Opcional, decisión del dueño: el hook `pre-push` avisa en una línea si Docker no responde.
- [ ] T5 — `[manual]` El dueño decide qué hacer con `allow-scripts` en `~/.npmrc`.

## Verificación

- La batería completa antes del push (`CLAUDE.md`, «Publicar y encadenar fases»), con Docker Desktop
  abierto.
- Tres corridas seguidas de `npm run test:integracion` en verde.
- En GitHub, los dos runs (`push` y `pull_request`) en verde.

## Resultado de la verificación (2026-10-03, local, Docker Desktop abierto)

| Comando | Resultado |
|---|---|
| `npm run lint`, `typecheck`, `fronteras` | Sin errores |
| `npm test` | 1240/1240 |
| `npm run test:integracion` (3 corridas) | 307/308 en cada una |
| `npm run test:e2e` | 42/42 |
| `npm run evals` | 36 pasan, 1 omitido |
| `npm run contrato:deriva` | Sin deriva |

La única falla de integración es `test/integracion/agente/prompts-build.spec.ts`:
`spawnSync npx ENOENT` en Windows (`execFileSync('npx')` sin shell). Falla igual en el commit base
`c6e74c4` y no tiene relación con Redis.

Commit: ver la línea «Commit» de abajo.

## Mientras tanto

- PR #63: re-ejecutar el job fallido es válido **solo** como paso temporal y dejando escrita esta causa
  en el PR. No arregla nada.
- Empujar con `--no-verify` queda justificado solo por el punto 1 y solo si se deja escrito en el PR.
