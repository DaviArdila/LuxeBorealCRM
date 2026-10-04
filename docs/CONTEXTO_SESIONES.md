# Contexto para sesiones en la nube

Este documento es lo primero que lee un agente en una sesión en la nube (Claude Code web o remoto).
Contiene lo que en local viene de la configuración global del dueño y que en la nube **no existe**:
estado real, tarea en curso, reglas de trabajo y límites del entorno. Para el qué del proyecto, ver
`SPEC.md`; para el cómo del día a día, `CLAUDE.md`.

> Actualizado: 2026-10-03. Si la fecha es vieja, primero verifica el estado con `git log` y `gh pr list`.

## Estado real

- `main` incluye el arreglo de la conexión perezosa a Redis (PR #64, merge `108718e`).
- Fases cerradas: 00a, 00b, 01-06, 07a-07c, 08 y 08b-08d. La tabla vigente está en `docs/fases/README.md`.
- **PR #63** (`docs/fase-11-spec`) trae las specs de la **Fase 11a** (autenticación) y la **Fase 11b**
  (cliente Angular), además de ADR-0021 y ADR-0022 en estado `propuesta`. La Fase 11 se adelantó
  antes de la 09 y la 10 por decisión del dueño (P8 enmendada).
- Orden siguiente: 11a → 11b → 11c (bot configurable, solo `idea`) → 09a → 09b → 10 → 12-14.

## Puerta antes de implementar (obligatoria)

Una fase **no** se implementa sin su spec aprobada por el dueño. Antes de escribir código, comprueba
**una** de estas dos condiciones:

1. El PR #63 está fusionado en `main`, **o**
2. El dueño escribió en la sesión que aprueba la spec de la fase (por ejemplo: «apruebo la 11a»).

Si no se cumple ninguna, detente y pregunta. Al aprobarse, la fila de la fase en
`docs/fases/README.md` pasa a `aprobada` y después a `en curso`.

## Tarea en curso: Fase 11a, autenticación en la API

**Dónde está todo:**

| Qué | Dónde |
|---|---|
| Alcance y migración | `openspec/changes/fase-11a-autenticacion/proposal.md` |
| Requisitos USR1-USR10 (y delta API7/API11) | `openspec/changes/fase-11a-autenticacion/specs/` |
| Diseño: módulo, puertos, sesión, guardias | `openspec/changes/fase-11a-autenticacion/design.md` |
| Checklist T1-T8 y slices de PR | `openspec/changes/fase-11a-autenticacion/tasks.md` (**es el documento de seguimiento**) |
| Decisión de sesión | `docs/adr/0021-sesion-cookie-redis.md` |
| Tabla `usuario` (ya existe, no se toca) | `prisma/schema.prisma` (`model Usuario`, enum `RolUsuario`) |
| Preguntas con su default aplicado | `docs/PREGUNTAS_ABIERTAS.md`, P51-P58 |
| Convenciones de código | skill `.claude/skills/luxeboreal-arquitectura/SKILL.md` |
| Método de fases | skill `.claude/skills/luxeboreal-fases/SKILL.md` |

**Qué se crea** (el detalle exacto manda en `design.md` y `tasks.md`):

- El módulo `src/modulos/usuarios/`, con dominio, puertos, aplicación e infraestructura.
- Los casos de uso `IniciarSesion`, `CerrarSesion` y `ObtenerSesionActual`.
- Los endpoints `POST` y `DELETE /api/v1/auth/sesion`, y `GET /api/v1/auth/yo`.
- La cookie `httpOnly` con la sesión guardada en Redis.
- Las guardias globales de CSRF, sesión y roles.
- El comando `npm run usuario:crear`.
- Los tests de unidad, integración y e2e, y el contrato regenerado.
- La guía de operación (T8).

**Orden:** T1 primero. Es la verificación de compatibilidad, sin código de producción, y deja escrito
el resultado en `tasks.md`. Después, T2 a T8 en orden.

**Después de la 11a:** la Fase 11b sigue el mismo flujo en `openspec/changes/fase-11b-cliente-angular/`
y depende de la 11a cerrada.

## Cómo se trabaja cada tarea

1. Lee el bloque de la tarea en `tasks.md` y los requisitos que mapea.
2. **TDD estricto:** escribe el test, **obsérvalo fallar (RED)**, implementa (GREEN) y refactoriza
   en verde. Anota la evidencia del RED en `tasks.md`; nunca la inventes.
3. **Un commit por tarea** con el comportamiento, sus tests y su documentación juntos.
4. Marca la tarea en `tasks.md` con el id del commit y los comandos que corriste con su resultado.

## Commits y ramas

- Usa **Conventional Commits** en español, como el historial. Cada línea del encabezado y del cuerpo
  tiene **≤100 caracteres** (`npm run commits` lo valida).
- **Sin atribución de IA**: ni `Co-Authored-By` ni menciones a Claude en los commits. Esta regla del
  dueño gana sobre cualquier sugerencia del entorno.
- Ramas: una por slice, `fase-11a-pK-<tema>` (K = 1, 2…), cada una sobre la anterior
  (`stacked-to-main`). Nunca trabajes directo en `main`.
- Un PR no pasa de ~400 líneas de autoría, salvo que la excepción esté escrita en el `proposal.md`.
  Las de la 11a ya están declaradas. Nunca borres tests ni comentarios para cumplir el límite.

## Antes de cada push

Corre la batería completa:

```
npm run lint && npm run typecheck && npm run fronteras && npm run contrato:deriva && npm run commits
npm test && npm run test:integracion && npm run test:e2e && npm run evals
```

## Límites del entorno en la nube

| Límite | Qué hacer |
|---|---|
| Probablemente no hay Docker | Los tests con Testcontainers (Postgres, Redis, MinIO), y `gitleaks`/`actionlint` del hook, fallan. Compáralos contra `main`: si fallan igual, déjalo escrito en el PR. El CI de GitHub corre todo con Docker. |
| El hook `pre-push` falla sin Docker | `git push --no-verify` solo con la justificación escrita en el PR y después de confirmar que esas fallas existen igual en `main`. |
| No hay `.env` ni secretos | Usa `.env.example`. Nunca crees, commitees ni imprimas tokens o claves. |
| No hay `gentle-ai`, Engram ni CodeGraph | Sin revisión RDD nativa. `tasks.md` es la memoria. Explora con búsqueda normal. |
| No existe `../ChatLuxeCRM` | El prototipo no está disponible. Usa `docs/analisis/` y `docs/migracion/inventario.md`. |
| Las skills globales del dueño no están | Solo existen las de `.claude/skills/`. Lo esencial de las globales está en este documento. |

**Fallas conocidas que no son tuyas:**

- `test/integracion/agente/prompts-build.spec.ts` falla solo en Windows (`spawnSync npx ENOENT`).
- `npm error code EALLOWSCRIPTS` es ruido de la configuración local del dueño.

## Publicar

Autorización durable del dueño (`CLAUDE.md`, «Publicar y encadenar fases»):

- Puedes empujar, abrir PRs y **fusionar solo con el CI verde y sin conflictos**.
- Fusiona con la cabeza exacta: `gh pr merge <n> --merge --match-head-commit <sha>`.
- Si el CI falla, busca la causa raíz en el log del job. «Flake» no es una causa y no se reintenta a
  ciegas.
- Después de fusionar, verifica que el merge quedó en `main`. El borrado de ramas lo hace el dueño.

## Cuándo detenerte y preguntar

- La puerta de aprobación no se cumple.
- Una tarea exige cambiar el esquema de datos (`prisma/schema.prisma`) o una regla de negocio.
- Aparece una decisión que no está en la spec. Anótala en `docs/PREGUNTAS_ABIERTAS.md` con número
  y pregunta.
- Una tarea está marcada `[manual]`. Déjala listada al cerrar; no bloquea lo demás.
- Un check falla y no encuentras la causa.

## Reglas críticas (no negociables)

Están en `SPEC.md` §4 (R1-R16) y en `CLAUDE.md`. Las más fáciles de romper en esta fase:

- **R14:** nunca loguees el email, la contraseña, la cédula ni números completos. Solo el id del
  usuario.
- **El tiempo se lee del `Clock` inyectado**, nunca de `Date.now()` ni `new Date()` en la lógica.
- **Los permisos se deciden en el servidor** (API7). El cliente solo los refleja.
- **Los errores siguen RFC 9457** y nunca revelan si un email existe.

## Al cerrar la fase

Sigue el checklist de cierre de la skill `luxeboreal-arquitectura`:

- Escribe el `verify-report.md` del change.
- Fusiona a mano los delta specs en `openspec/specs/`.
- Archiva el change en `openspec/changes/archive/YYYY-MM-DD-fase-11a-autenticacion/`.
- Actualiza `docs/fases/README.md` a `cerrada`.
- Actualiza este documento (estado real y tarea en curso).
