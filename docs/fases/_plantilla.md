# FASE NN · <Nombre corto>

- Estado: idea | spec en revisión | aprobada | en curso | cerrada
- Depende de: FASE NN (cerrada)
- Fecha de spec: YYYY-MM-DD · Fecha de cierre: —
- Rama: `fase-NN-<nombre>`
- Review requerida: RDD | RDD + judgment-day

## 1. Objetivo

Una o dos frases: qué capacidad nueva existe al terminar y por qué importa ahora.

## 2. Alcance

**Entra:**
- …

**No entra (y en qué fase va):**
- … → FASE NN

## 3. Qué se migra del prototipo

| Pieza de ChatLuxeCRM | Decisión (conservar / rediseñar / descartar) | Nota |
|---|---|---|
| `src/…` | … | … |

Tests del prototipo que esta fase reemplaza: `tests/…` (y qué comportamiento cubren).

¿Tiene sentido migrarlo? Para cada pieza **rediseñada** o **descartada**, una línea con el motivo
(antipatrón de `docs/analisis/01-analisis-chatluxecrm.md`, decisión del usuario, o ADR).

## 4. Reglas de negocio que aplican

Referencias a `SPEC.md` (§) — no se copian aquí. Solo se escribe lo que es **nuevo** o **cambia**.

## 5. Criterios de aceptación

Verificables, en formato Dado / Cuando / Entonces. Cada uno se convierte en al menos un test.

- **CA-1** — Dado …, cuando …, entonces …
- **CA-2** — …

## 6. Diseño

- Módulos que se crean o tocan, y sus dependencias (quién importa a quién).
- Puertos (interfaces) y adaptadores.
- Cambios de esquema (si hay: primero en `MODELO_DATOS.md`).
- Eventos de dominio que se emiten / escuchan.
- Configuración nueva (variables y defaults).

Diagramas solo si aclaran algo que el texto no.

## 7. Tareas

Ordenadas; cada una ≤ media sesión, sigue RED → GREEN → REFACTOR y termina con su test y su commit.

- [ ] T1 — … · test: … · commit: `<hash>`
- [ ] T2 — … · test: … · commit: `<hash>`

## 8. Entrega (slices de PR)

PRs planeados, cada uno ≤ ~400 líneas cambiadas (skills `work-unit-commits`, `chained-pr`).

| PR | Tareas que contiene | Líneas estimadas |
|---|---|---|
| 1 | T1, T2 | ~… |

## 9. Pruebas

| Nivel | Qué se prueba | Dónde |
|---|---|---|
| Unitario | … | `src/modulos/…/*.spec.ts` |
| Integración | … | `test/integracion/…` |
| E2E / manual | … | comando exacto |

## 10. Riesgos y preguntas abiertas

- …

## 11. Registro de cierre

(Se llena al terminar.)

- Criterios de aceptación: CA-1 ✅ …
- Resultado de `npm run verify`: …
- Commits / PRs de la fase: …
- Resultado de review: RDD … / judgment-day (si aplicaba) …
- Desviaciones respecto a la spec y por qué: …
- ADR creados: …
- Filas de `docs/migracion/inventario.md` marcadas como migradas: …
- Qué aprendimos que cambia las fases siguientes: …
