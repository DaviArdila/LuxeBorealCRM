---
name: luxeboreal-fases
description: Método para planear, escribir, ejecutar y cerrar las fases de LuxeBorealCRM (migración de ChatLuxeCRM a NestJS) — cómo escribir una spec de fase desde la plantilla, cómo decidir qué migra del prototipo y qué no, cómo dimensionar una fase, cómo redactar criterios de aceptación y cómo cerrarla. Úsala cuando el usuario pida planear una fase, escribir o revisar un spec de fase, arrancar o cerrar una fase, o decidir si algo del prototipo se migra.
---

# Fases de LuxeBorealCRM

La hoja de ruta y el estado están en `docs/fases/README.md`; la plantilla en
`docs/fases/_plantilla.md`. Esta skill dice **cómo** usarlas.

## 1. Escribir la spec de una fase

1. Confirmar que la fase anterior está `cerrada` y leer su "Registro de cierre" (lo aprendido puede
   cambiar esta fase).
2. Copiar `_plantilla.md` a `FASE-NN-<nombre-kebab>.md`, estado `spec en revisión`.
3. Reunir el material, en este orden:
   - fila de la fase en `docs/fases/README.md` (objetivo y verificación de salida);
   - filas de `docs/migracion/inventario.md` con esa fase;
   - reglas R# de `SPEC.md` §4 que aplican, y su sección en `../ChatLuxeCRM/SPEC.md`;
   - código **y tests** del prototipo de esas filas (los tests dicen el comportamiento real);
   - antipatrones de `docs/analisis/01-analisis-chatluxecrm.md` que afectan a esas piezas;
   - preguntas de `docs/PREGUNTAS_ABIERTAS.md` que bloquean la fase.
4. Llenar la plantilla. Criterios para cada sección:
   - **Alcance**: lo que no entra se nombra con la fase donde sí entra.
   - **Qué se migra**: por cada pieza, una decisión y un motivo (§2 de esta skill).
   - **Criterios de aceptación**: Dado/Cuando/Entonces, observables desde afuera del módulo, uno
     por comportamiento. Nada de "el código está limpio" — eso es el checklist de cierre.
   - **Tareas**: ≤ 10, cada una termina con un test. Si salen más, proponer partir la fase.
   - **Entrega (slices de PR)**: cada PR ≤ ~400 líneas cambiadas; qué tareas contiene cada uno.
   - **Review requerida**: `RDD` por defecto; `RDD + judgment-day` si la fase es 04, 05, 06 o 10.
5. Si una pregunta abierta bloquea la fase, **no se inventa la respuesta**: se deja en §9 de la spec
   y se le pregunta al usuario.
6. Presentar al usuario un resumen corto (objetivo, qué migra y qué no, CA, preguntas) y esperar la
   aprobación. Solo el usuario pasa la spec a `aprobada`.

## 2. ¿Se migra o no? (criterio por pieza)

Preguntas, en orden:

1. **¿Es una regla de negocio o de comportamiento visible para el cliente/asesor?** → se conserva
   la regla siempre (aunque se reescriba el código). Si se quiere cambiar, es decisión del usuario.
2. **¿Resuelve un problema que sigue existiendo en la arquitectura nueva?** Si no (p. ej. el refresco
   de media IDs de Meta, el panel retirado) → **descartar**, con motivo.
3. **¿La implementación actual tiene un antipatrón listado?** → **rediseñar**, citando el A#.
4. **¿Es lógica pura y probada?** → **conservar** (portar con cambios de forma mínimos).
5. **¿Aporta algo antes del corte (Fase 10)?** Si no → **posponer**, a qué fase.

## 3. Tamaño de una fase

- Señales de fase demasiado grande: más de ~10 tareas, más de 2 módulos nuevos, CA que dependen
  de otros CA de la misma fase para poder probarse, o una verificación de salida que necesita
  "y además…".
- Cómo partir: por capa vertical que se pueda probar sola (primero la entrada con un procesador
  que solo registra; después el procesamiento), nunca por capa técnica horizontal sin prueba.

## 4. Durante la fase

- Estado `en curso` en la spec y en `docs/fases/README.md`.
- Se trabaja en la rama de la fase (`fase-NN-<nombre>`), nunca directo en `main`.
- Por tarea: RED primero (test que falla), después GREEN, después REFACTOR.
- Marcar tareas `[x]` al terminar cada una con su test, y cerrar con un commit de unidad de
  trabajo; anotar su hash en la tarea.
- Una desviación de la spec se anota en la spec (no en el chat) antes de seguir; si cambia un CA,
  se avisa al usuario.
- Decisión con alternativas → ADR `propuesta`.

## 5. Cerrar la fase

1. Checklist de cierre de la skill `luxeboreal-arquitectura`.
2. Si la spec declara "Review requerida: RDD + judgment-day" (fases 04, 05, 06, 10): correr la
   skill `judgment-day` sobre el rango de commits de la fase antes de cerrar.
3. Llenar "Registro de cierre" de la spec: CA con resultado, salida de `npm run verify`,
   commits/PRs de la fase, resultado de review (RDD / veredicto de judgment-day si aplicaba),
   desviaciones, ADR, filas migradas, y **qué aprendimos que cambia las fases siguientes**.
4. Actualizar `docs/fases/README.md` (estado `cerrada`) y `docs/migracion/inventario.md`.
5. Si lo aprendido afecta a fases futuras, proponer el ajuste de la tabla de fases al usuario.
