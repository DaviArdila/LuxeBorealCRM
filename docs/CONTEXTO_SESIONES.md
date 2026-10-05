# Contexto para sesiones en la nube

Este documento es lo primero que lee un agente en una sesión en la nube (Claude Code web o remoto).
Contiene lo que en local viene de la configuración global del dueño y que en la nube **no existe**:
estado real, tarea en curso, reglas de trabajo y límites del entorno. Para el qué del proyecto, ver
`SPEC.md`; para el cómo del día a día, `CLAUDE.md`.

> Actualizado: 2026-10-04. Si la fecha es vieja, primero verifica el estado con `git log` y `gh pr list`.

## Estado real

- Fases cerradas: 00a, 00b, 01-06, 07a-07c, 08, 08b-08d, **11a** y **11b** (2026-10-04). La tabla vigente está en
  `docs/fases/README.md`.
- La **11a** (autenticación) está en `main`: módulo `usuarios`, sesión por cookie `httpOnly` en Redis, guardias globales
  de CSRF, sesión y rol, y `npm run usuario:crear`. Queda su prueba `[manual]` (el dueño crea su usuario e inicia
  sesión) y la aceptación de ADR-0021. Cierre en
  `openspec/changes/archive/2026-10-04-fase-11a-autenticacion/verify-report.md`.
- La **11b** (cliente Angular) está en `main`: `cliente/` por áreas con inicio de sesión, «Estilo del bot» y «Mensajes fijos»
  (solo `admin`), los endpoints de admin de `agente` y del módulo `mensajes-fijos`, `npm run mensajes:sembrar` y `cliente:ci`
  dentro de `npm run ci`. Queda su prueba `[manual]` (el dueño recorre las pantallas), la aceptación de ADR-0022 y de dos
  excepciones de auditoría nuevas. Cierre en `openspec/changes/archive/2026-10-04-fase-11b-cliente-angular/verify-report.md`;
  guía en `docs/operacion/cliente-back-office.md`.
- **Estructura (ADR-0023, `propuesta`, 2026-10-04):** el servidor vive en `servicio/` y el back office en `cliente/`,
  cada uno con su `package.json` y su `ci`; la raíz solo encadena (`npm run instalar`, `npm run ci`). Los comandos del
  servidor se corren dentro de `servicio/` (o `npm --prefix servicio run …`). Seguimiento en
  `odd/tasks/separar-servicio-cliente.md`.
- Orden siguiente: 11c (solo `idea`, necesita su spec y un ADR de esquema) → 09a → 09b → 10 → 12-14. La Fase 11 se adelantó antes de la 09 y la 10 por
  decisión del dueño (P8 enmendada).

## Puerta antes de implementar (obligatoria)

Una fase **no** se implementa sin su spec aprobada por el dueño. Antes de escribir código, comprueba que el dueño
escribió en la sesión que aprueba la spec de esa fase (por ejemplo: «apruebo la 11b»), o que su fila de
`docs/fases/README.md` ya dice `aprobada`. Si no, detente y pregunta. Al aprobarse, la fila pasa a `aprobada` y después
a `en curso`.

## Tarea siguiente: Fase 11c o 09a (decide el dueño)

La 11b está cerrada. La **11c** (bot configurable) es solo una idea: necesita su spec, un ADR de esquema y la aprobación del
dueño. La **09a** (operación sin VPS) sigue en su orden de `docs/fases/README.md`. Lo aprendido en la 11b que las afecta
está al final de su `verify-report.md`: un área nueva del cliente es una carpeta y una línea, y cada cambio de endpoint pide
`npm --prefix servicio run contrato:generar` y `npm --prefix cliente run api:generar`.

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
- Ramas: una por slice, `fase-NN-pK-<tema>` (p. ej. `fase-11b-p1-<tema>`) (K = 1, 2…), cada una sobre la anterior
  (`stacked-to-main`). Nunca trabajes directo en `main`.
- Un PR no pasa de ~400 líneas de autoría, salvo que la excepción esté escrita en el `proposal.md`.
  Nunca borres tests ni comentarios para cumplir el límite.

## Antes de cada push

Corre la batería completa dentro de `servicio/`, y la del cliente si lo tocaste:

```
cd servicio
npm run lint && npm run typecheck && npm run fronteras && npm run contrato:deriva && npm run commits
npm test && npm run test:integracion && npm run test:e2e && npm run evals
npm --prefix ../cliente run ci
```

## Límites del entorno en la nube

| Límite | Qué hacer |
|---|---|
| Docker no arranca solo | `dockerd` sí está instalado: levántalo en segundo plano (`dockerd > /tmp/dockerd.log 2>&1 &`) y la batería completa, con Testcontainers, `gitleaks` y `actionlint`, corre en la sesión (así se cerró la 11a). Si aun así no hay Docker, compara las fallas contra `main` y déjalo escrito en el PR. |
| Node 22 en vez de 24 | La batería pasa con Node 22. `npm install` con el npm 10 que trae reescribe el lockfile (quita los campos `libc`): para agregar una dependencia usa `npx -y npm@11 install <paquete>`. |
| El hook `pre-push` falla sin Docker | `git push --no-verify` solo con la justificación escrita en el PR y después de confirmar que esas fallas existen igual en `main`. |
| No hay `.env` ni secretos | Usa `servicio/.env.example`. Nunca crees, commitees ni imprimas tokens o claves. |
| No hay `gentle-ai`, Engram ni CodeGraph | Sin revisión RDD nativa. `tasks.md` es la memoria. Explora con búsqueda normal. |
| No existe `../ChatLuxeCRM` | El prototipo no está disponible. Usa `docs/analisis/` y `docs/migracion/inventario.md`. |
| Las skills globales del dueño no están | Solo existen las de `.claude/skills/`. Lo esencial de las globales está en este documento. |

**Fallas conocidas que no son tuyas:**

- `servicio/test/integracion/agente/prompts-build.spec.ts` falla solo en Windows (`spawnSync npx ENOENT`).
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
- Una tarea exige cambiar el esquema de datos (`servicio/prisma/schema.prisma`) o una regla de negocio.
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
