---
name: luxeboreal-fases
description: Método para planear, escribir, ejecutar y cerrar las fases de LuxeBorealCRM (migración de ChatLuxeCRM a NestJS) con el ciclo SDD de Gentle-AI sobre OpenSpec — qué agente sdd-* produce cada artefacto de una fase, cómo reunir el material antes de proponerla, cómo decidir qué migra del prototipo y qué no, cómo dimensionarla y cómo cerrarla. Úsala cuando el usuario pida planear una fase, arrancar o continuar el ciclo SDD de una fase, revisar sus specs/tasks, cerrarla, o decidir si algo del prototipo se migra.
---

# Fases de LuxeBorealCRM

La hoja de ruta y el estado están en `docs/fases/README.md`; el detalle de cada fase vive en su
change de OpenSpec, `openspec/changes/fase-NN-<nombre>/`. Esta skill dice **cómo** usar ese ciclo
para una fase de este proyecto — el mecanismo genérico del ciclo SDD (comandos, artefactos,
gatekeeper de modo de ejecución) está en `.claude/skills/_shared/sdd-orchestrator-workflow.md`; no
se repite aquí.

Preflight de esta migración (actualizado 2026-09-23): **pace automático**, **artefactos híbridos** (OpenSpec en el repo +
Engram como espejo de recuperación, proyecto `luxeborealcrm`), **estrategia de PR `auto-chain`** (cadena `stacked-to-main`).

## 1. Qué produce cada fase del ciclo SDD

| Fase SDD | Agente | Artefacto en `openspec/changes/fase-NN-<nombre>/` |
|---|---|---|
| Explorar + proponer | `sdd-new` / `sdd-propose` | `exploration.md` (opcional), `proposal.md` |
| Especificar | `sdd-spec` | `specs/<dominio>/spec.md` (delta sobre `openspec/specs/<dominio>/spec.md`) |
| Diseñar | `sdd-design` | `design.md` |
| Desglosar tareas | `sdd-tasks` | `tasks.md` |
| Implementar | `sdd-apply` | actualiza `tasks.md` (marca `[x]`, hash de commit) + código |
| Verificar | `sdd-verify` | `verify-report.md` |
| Archivar | `sdd-archive` | mueve el change a `archive/YYYY-MM-DD-fase-NN-<nombre>/`, fusiona los delta specs en `openspec/specs/<dominio>/spec.md` |

Reglas de contenido por artefacto (máximo de tareas, formato de escenarios, slices de PR, checklist
de verificación, etc.) están en `openspec/config.yaml` §`rules`; no se duplican aquí.

## 2. Reunir el material antes de proponer (`sdd-new`/`sdd-propose`)

En este orden:

1. Confirmar que la fase anterior está `cerrada` (tabla de `docs/fases/README.md`) y leer su
   `verify-report.md` archivado — lo aprendido puede cambiar esta fase.
2. Fila de la fase en `docs/fases/README.md` (objetivo y verificación de salida).
3. Filas de `docs/migracion/inventario.md` con esa fase.
4. Reglas R# que aplican, ya en `openspec/specs/<dominio>/spec.md` (índice en `SPEC.md` §4).
5. Código **y tests** del prototipo de esas filas — los tests dicen el comportamiento real. El
   prototipo `../ChatLuxeCRM` tiene CodeGraph indexado: para encontrar quién llama a la máquina de
   estados, a `enviarMensaje()`, o el flujo de una herramienta del agente, usar primero
   `codegraph_explore` con `projectPath: "../ChatLuxeCRM"` antes de leer archivos a mano.
6. Antipatrones de `docs/analisis/01-analisis-chatluxecrm.md` que afectan a esas piezas.
7. Preguntas de `docs/PREGUNTAS_ABIERTAS.md` que bloquean la fase — si una bloquea, **no se inventa
   la respuesta**: se deja como pregunta abierta en la proposal y se le pregunta al usuario antes de
   seguir.

Con ese material, `sdd-propose` llena la proposal siguiendo `openspec/config.yaml` §proposal (tabla
"Qué se migra del prototipo" con el criterio de la sección 2 de esta skill, alcance explícito, plan
de rollback, preguntas bloqueantes). Con ritmo automático, las fases de planeación corren seguidas y
solo se detienen ante una decisión de producto o un fallo; con ritmo interactivo, tras cada fase se
presenta un resumen corto y el usuario decide si se sigue. La puerta que **siempre** aplica, sin excepciones: `sdd-apply` no arranca hasta que el
usuario aprueba los cuatro artefactos (proposal, specs, design, tasks); solo el usuario pasa el
change a `aprobada` (`docs/fases/README.md`).

## 3. ¿Se migra o no? (criterio por pieza)

Preguntas, en orden:

1. **¿Es una regla de negocio o de comportamiento visible para el cliente/asesor?** → se conserva
   la regla siempre (aunque se reescriba el código). Si se quiere cambiar, es decisión del usuario.
2. **¿Resuelve un problema que sigue existiendo en la arquitectura nueva?** Si no (p. ej. el refresco
   de media IDs de Meta, el panel retirado) → **descartar**, con motivo.
3. **¿La implementación actual tiene un antipatrón listado?** → **rediseñar**, citando el A#.
4. **¿Es lógica pura y probada?** → **conservar** (portar con cambios de forma mínimos).
5. **¿Aporta algo antes del corte (Fase 10)?** Si no → **posponer**, a qué fase.

## 4. Tamaño de una fase

- Señales de fase demasiado grande: más de ~10 tareas (límite duro de `openspec/config.yaml`), más
  de 2 módulos nuevos, criterios de aceptación que dependen de otros de la misma fase para poder
  probarse, o una verificación de salida que necesita "y además…".
- Cómo partir: por capa vertical que se pueda probar sola (primero la entrada con un procesador
  que solo registra; después el procesamiento), nunca por capa técnica horizontal sin prueba.

## 5. Durante la fase (`sdd-apply`)

- Estado `en curso` en `docs/fases/README.md` (equivalencia completa en ese archivo).
- Rama de la fase, `fase-NN-<nombre>`, nunca directo en `main`.
- TDD estricto por tarea: RED observado (test que falla) primero, después GREEN, después REFACTOR.
- Cada tarea de `tasks.md` se marca `[x]` al terminar con su test, y cierra con un commit de unidad
  de trabajo (comportamiento + test + doc juntos, Conventional Commits); el hash queda anotado en la
  propia tarea. Slices de PR ~400 líneas por la estrategia `auto-chain` (skills `work-unit-commits`,
  `chained-pr`).
- Una desviación de la spec se anota en el `design.md`/`tasks.md` del change (no solo en el chat)
  antes de seguir; si cambia un criterio de aceptación, se avisa al usuario.
- Decisión con alternativas → ADR `propuesta` en `docs/adr/`.
- **Ceremonia proporcional al riesgo** (`openspec/config.yaml` §rules.tasks/apply, decisión del
  usuario 2026-09-25): para tareas de bajo riesgo (datos de referencia estáticos, funciones puras,
  tareas sin cambios de producción) se permite evidencia RED→GREEN resumida, `npm run verify`
  reservado al cierre de slice, `size:exception` auto-aplicado cuando ya estaba anticipado en
  `proposal.md`, y forecast de una línea para tareas documentales. Nunca aplica a dinero,
  cantidades, restricciones `[manual]` de esquema ni reglas invariantes R1-R16 — ahí la ceremonia
  completa (transcripción íntegra, forecast completo, pregunta explícita de excepción) sigue siendo
  obligatoria.

## 6. Cerrar la fase (`sdd-verify → sdd-archive`)

1. Checklist de cierre de la skill `luxeboreal-arquitectura` (§12: `npm run verify` en verde, e2e si
   aplica, cada escenario con su test, `MODELO_DATOS.md` al día si cambió el esquema, ADR si hubo decisión,
   `docs/migracion/inventario.md` y `docs/fases/README.md` actualizados, sin `Date.now`/`process.env`
   fuera de sitio, un commit por unidad de trabajo).
2. Si la spec declara "Review requerida: RDD + judgment-day" (fases 04, 05, 06, 10): correr la
   skill `judgment-day` sobre el rango de commits de la fase antes de cerrar.
3. `sdd-verify` escribe `verify-report.md` con, además de lo que ya pide `openspec/config.yaml`
   §verify: el resultado de cada criterio de aceptación, los commits/PRs de la fase, el resultado de
   la review (RDD y, si aplicó, el veredicto de `judgment-day`), las desviaciones respecto a la spec
   y por qué, los ADR creados, y una sección explícita **"Qué aprendimos que cambia las fases
   siguientes"** — este último punto es obligatorio incluso si la respuesta es "nada".
4. `sdd-archive` mueve el change a `archive/` (fusiona los delta specs en `openspec/specs/`) y
   actualiza `docs/fases/README.md` (estado `cerrada`, nota con la ruta del change archivado) y las
   filas correspondientes de `docs/migracion/inventario.md`.
5. Si lo aprendido afecta a fases futuras, proponer el ajuste de la tabla de fases al usuario.
