# Proposal: Fallas críticas de las evals reales del agente

- Change: `fix-fallas-criticas-evals-agente` (mantenimiento, no es una fase) · Fecha: 2026-10-02 ·
  Estado: **implementado**, pendiente de archivar
- Toca `modulos/agente` y `test/evals/`. Trazabilidad de tareas: `odd/tasks/fallas-criticas-evals-agente.md`.

## Intent

La primera corrida real de evals con `openai:gpt-6-luna` dio REPROBADA (4 críticas de dinero y 84,5 %
de no críticas). El análisis separó dos causas: defectos del arnés (el grabador solo veía la última
ronda de herramientas; casos mal escritos) y la falta de guardas deterministas para R1/R2, que
dependían solo del prompt. Este change deja las guardas y el arnés corregidos, y registra en la spec
vigente lo que ya quedó implementado.

## Scope

1. Guarda de dinero sin rastro que bloquea: un reintento y luego traspaso (AGT23).
2. Parser de montos endurecido: `$`, `COP`, «pesos», «mil», «millones» (AGT24).
3. `mensaje_sin_cobertura` sale literal desde el backend (AGT25).
4. Regla no negociable de cita literal en el prompt `v3` (AGT26).
5. EVL2: excepción del negativo de dinero, que la guarda hace inalcanzable.
6. EVL4: los casos `soloGuionado` se omiten en la corrida real y el resumen lo declara.

Fuera de alcance: cambiar la escala de leads (D1 de la tarea ODD), el esquema de datos y el respaldo
`gpt-5.6-luna`.

## Evidencia

- Corrida real 2026-10-02 (`openai:gpt-6-luna`): REPROBADA por 2 críticas, ambas en una repetición de
  `r2-sin-cobertura` (llamó `marcar_lead_caliente` y hubo traspaso `lead-caliente`); 91,1 % de no
  críticas; costo 0,0090 USD. Las 4 críticas de dinero de la corrida previa desaparecieron.
- Esta evidencia **no** autoriza afirmar que el bot esté listo para clientes: EVL3 sigue exigiendo una
  corrida real que alcance el umbral.
