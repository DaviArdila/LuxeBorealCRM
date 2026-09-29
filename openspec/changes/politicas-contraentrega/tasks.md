# Tasks: politicas-contraentrega

- Modo TDD: **estricto** (fuente: CLAUDE.md del proyecto) · Runner: Vitest (`npm test`,
  `npm run test:integracion`) · Verificación por tarea: `npm run verify`.
- Entrega: `auto-chain`, cadena `stacked-to-main`. Pronóstico: ~650–750 líneas cambiadas en total →
  **3 PRs apilados**, cada uno ≤400 líneas. El presupuesto nunca se cumple borrando tests ni
  comentarios.
- Review: `gentle-ai review` nativo por commit de unidad de trabajo cuando RDD esté activo.
- Rama de implementación: una por PR, `politicas-contraentrega-pN-<nombre>`.

## Slices

| PR | Tareas | Contenido |
|---|---|---|
| 1 | T1 + T2 | Dominio de política y reglas del importador |
| 2 | T3 | Puerto, adaptador y `ConsultarPolitica` |
| 3 | T4 + T5 | Cotización con política, ficha sin recargo, fuera de cobertura y docs |

## Tareas

- [x] **T1 — Dominio `politica.ts`.** Helpers (`esClavePolitica`, `temaDeClave`, `claveDeTema`,
  `validarTextoPolitica`), constantes (tope 1.200, texto de respaldo de contra entrega). RED: tests
  de cada helper y de los límites. Escenarios de apoyo de IMP7/CAT12.
- [x] **T2 — Importador (IMP7).** Regla de prefijo `politica_` en `validar-catalogo.ts`. RED: 4
  escenarios nuevos (política válida sin advertencia y recortada; vacía → error; >1200 → error; tema
  inválido → error en `clave`).
- [x] **T3 — `ConsultarPolitica` (CAT12).** Puerto `RepositorioPolitica`, adaptador Prisma, caso de
  uso y cableado en el módulo. RED: 4 escenarios de CAT12 (unitarios con doble en memoria) + prueba
  de integración del adaptador.
- [x] **T4 — Cotización y ficha (CAT10, CAT2, CMP1).** `politicaContraentregaTexto` solo con contra
  entrega; ficha sin recargo; retiro de `obtenerRecargoContraentregaPct` y de
  `formatearRecargoContraentrega`. Verificar con `rg` que no queden consumidores. RED: escenarios
  CAT10 (3), CAT2 (recargo ausente) y ausencia del escenario de recargo en CMP1.
- [x] **T5 — Fuera de cobertura y docs (CAT11).** Nuevo texto por defecto sin promesa; `MODELO_DATOS.md`
  (convención `politica_*`, recargo como dato interno) e inventario. RED: escenario CAT11 sin promesa.

## Cierre

Al cerrar: `sdd-archive-compose` fusiona los deltas en `openspec/specs/{catalogo,compartido,agente}/`,
se mueve el change a `openspec/changes/archive/` y se actualiza `docs/fases/README.md`. Los escenarios
de R1/R2 (agente) quedan pendientes de prueba hasta la Fase 07.
