# Verify Report — fase-06-pasarela-llm

- Change: `fase-06-pasarela-llm` · Rama: `fase-06-pasarela-llm`
- Verificado: 2026-09-29, contra el árbol de trabajo real (commits `d3b4d6e`..`90307b5`, working tree
  limpio).
- Ejecutor: orquestador directamente. `sdd-apply` y `sdd-verify` no pudieron delegarse: el hook
  `PreToolUse:Agent` rechazó el dispatch a `sdd-apply` con "SDD child dispatch refused" pese a confirmar
  el preflight canónico con `AskUserQuestion` (mismo defecto que en la Fase 05); el usuario eligió
  implementar inline con la skill `sdd-apply` y TDD estricto. Los agentes de `judgment-day`
  (`jd-judge-a/b`, `jd-fix-agent`) sí se delegaron sin problema.

## Alcance verificado

1. Las 9 tareas (T1-T9) de `tasks.md` implementadas, cada una con su commit de unidad de trabajo.
2. Los 27 escenarios de `specs/llm/spec.md` (LLM1-LLM13) y la trazabilidad de R13 del delta de
   `conversaciones`, con test de título exacto.
3. El criterio de salida de la fila 06 de `docs/fases/README.md`: misma conversación contra 2 modelos
   cambiando solo configuración; fallback probado; registro en `uso_llm`.
4. `lint`, `typecheck`, `fronteras`, unitarios, integración, e2e, cobertura, contrato y CI completo.
5. El veredicto de `judgment-day` (obligatorio para esta fase, regla 6).

## Checks ejecutados (comandos reales)

| Comando | Resultado |
|---|---|
| `npm run verify` (prisma:generar → lint → typecheck → fronteras → deriva del contrato → unitarios + integración) | **Verde** (última corrida completa: 126 archivos, 723 tests, antes del fix de `judgment-day`) |
| `npm run ci` (secuencia completa del workflow, tras el fix) | **Verde, exit 0**: unitarios 88 archivos / 541 tests; `test:cobertura` 126 archivos / **727 tests**, **93,42 % de líneas** (umbral 80 %); `test:e2e` 9/9; `contrato:deriva`, `contrato:lint`, `contrato:diff` sin cambios; `secretos` (gitleaks), `commits` (commitlint), `auditoria` (sin ≥ high) y `flujos` (actionlint) |
| `npm run build` | **Verde** |
| Cobertura por título de escenario (script sobre `src/` y `test/`) | 27 de 27 títulos de `specs/llm/spec.md` con test de título exacto |

Los `ERROR` de `IndicadorPostgres`/`IndicadorRedis` en el log de `verify` son esperados
(`test/integracion/salud.spec.ts` apunta a un puerto inalcanzable a propósito). `PER10`
(`aislamiento.spec.ts`) agotó su timeout de 20 s **una vez** dentro de `npm run verify` por contención
de Docker; pasa sola, en `test:integracion` completo y en `npm run ci` (no es un hallazgo de esta fase).

## Escenarios de spec — cobertura real

| Requisito | Escenarios | Nivel |
|---|---|---|
| LLM1 (3) | Generación con tipos propios · Error tipado distingue cada causa · Metadatos opacos | unitario (`llm-port.spec`, `llm-gateway.spec`) + integración (adaptador) |
| LLM2 (2) | Transporte sin interpretar · Argumentos inválidos → error de herramienta, nunca `{}` | unitario + integración |
| LLM3 (2) | Timeout se aborta · Timeout de conversación < TTL del lock | unitario (gateway, config) |
| LLM4 (2) | 2 reintentos como máximo · 4xx ≠ 429 no se reintenta | unitario |
| LLM5 (3) | Deriva al siguiente modelo · Circuito abierto · Caída total sin proveedor directo | unitario |
| LLM6 (2) | Fila en éxito · Fila también en fallo | integración (Postgres real) |
| LLM7 (2) | Bajo el techo · Techo desactivado en `test` | unitario |
| LLM8 (1) | Aviso `warn` al 80 % una vez por mes | unitario + integración |
| LLM9 (2) | Al 100 % no llama · Texto en `mensaje_techo_gasto` | unitario + integración |
| LLM10 (2) | Logs sin prompts/respuestas/PII · `uso_llm` sin contenido | integración (módulo compuesto) |
| LLM11 (2) | Un solo intento y propaga · SDK solo en infraestructura | integración + fronteras |
| LLM12 (2) | 2 modelos cambiando solo configuración · Config inválida impide el arranque | integración + unitario |
| LLM13 (2) | Fallo de escritura no tumba la respuesta · Agregado mensual | integración |
| R13 (trazabilidad) | Costo de cada llamada al LLM registrado | vía LLM6 |

El comportamiento subyacente se confirmó leyendo cada test y con mutaciones por tarea (cambiar el
backoff, el mínimo de 2 s, el circuito, la precedencia de errores, el techo, `maxRetries`, el filtro por
mes o hacer que el gateway loguee el prompt hace fallar de 1 a 10 tests).

## Judgment Day — veredicto

**JUDGMENT: APPROVED ✅** en la ronda 1 de 2. Target `cb47370` (sha256 del diff
`bf4ff8fe0dcbc9c9a0c318a28c5c74a31e2366f75796c8ae2552e1254a53063e`); fix `90307b5` (delta sha256
`c3321d2f50a4f71383ccdc2ef4b75e2217617557695e0dfd9c5474aa7bde459d`).

- **C1 (CRITICAL, ambos jueces, determinista) — corregido.** El circuito de un modelo se quedaba en
  `semiabierto` para siempre si la sonda fallaba con un 4xx no reintentable (401/402/404 o un error sin
  clasificar): con el perfil de un solo modelo, todo el gateway quedaba muerto hasta reiniciar.
  Corrección en dos unidades: el gateway cierra el circuito cuando la sonda recibe respuesta 4xx, y el
  dominio concede una sonda nueva si la anterior nunca reporta pasada otra ventana. Re-juicio acotado de
  ambos jueces: sin hallazgos ni defectos causados por el fix.
- **Sin fugas R14/PII** en logs ni en `uso_llm` (ambos jueces); aritmética de dinero entera, sin deriva.
- **Nota de proceso:** la puerta "preguntar antes de la ronda 1" de la skill se dio por cubierta por la
  instrucción del usuario de cerrar la fase de punta a punta.

### Hallazgos informativos (no bloqueantes, no corregidos)

| ID | Sev. | Hallazgo | Para quién |
|---|---|---|---|
| W1 | WARNING (A+B) | El backoff no se descuenta del presupuesto restante: tras una espera larga el siguiente intento puede recibir un timeout ≤ 0 y abortarse al instante (cuenta como fallo del circuito). Con `LOCK_TURNO_TTL_S = 5` el presupuesto es 0. | Fase 07 (medir con latencias reales) o antes |
| W2 | WARNING (A+B) | Un intento abortado por timeout se registra con costo 0 aunque el proveedor haya podido cobrarlo; un modelo sin precio también registra 0. Puede subcontar el techo (R13). | Fase 09 (el límite de la consola del proveedor es el segundo freno) |
| S1 | SUGGESTION (A+B) | El techo falla abierta si no se puede medir el gasto (decisión documentada en T8). | Confirmar con el usuario |
| S2 | SUGGESTION (A+B) | 408/409 y los errores de red que el SDK no envuelve no se reintentan. | Fase 07 con tráfico real |
| S3 | SUGGESTION (A) | Con el gasto sobre el 80 % cada llamada lee el estado del techo; y la verificación no es atómica (turnos concurrentes pueden pasar el techo por la concurrencia). | Fase 09 |

## Desviaciones de `design.md` / `tasks.md` (detalle por tarea en `tasks.md`)

- Tipos del contrato en `dominio/tipos-llm.ts` y esquema de herramienta estructural (regla de fronteras
  3: `dominio/` no importa `puertos/` ni `zod`).
- La regla de fronteras nueva es la **14** (la 13 ya existía).
- `Configuracion` gana 17 claves obligatorias; los ~32 archivos que la armaban a mano usan el fixture
  `test/soporte/configuracion-llm-de-prueba.ts`.
- Puerto interno `TemporizadorLlm` (backoff, jitter y aborto controlables) y `ULTIMO_RECURSO_LLM`
  opcional (nivel 2 pospuesto, Q4).
- `maxRetries: 0` obligatorio en el AI SDK; `tokensEntrada` = `prompt_tokens` − caché.
- Circuito por intento fallido, fila `pasarela/circuito-abierto`, precedencia de errores definida.
- El techo falla abierta; el barril exporta también `ErrorPasarelaLlm`.
- ADR-0014 (fallback iterado en el gateway) creado en el ciclo de revisión de artefactos.

## Pendientes abiertos (para el usuario)

1. **`.env.example`** sin las 17 variables `LLM_*`/`OPENROUTER_*`: el permiso de lectura del entorno
   deniega ese archivo. El bloque listo para pegar está en `tasks.md`, T3.
2. **ADR-0013 y ADR-0014** siguen en `propuesta`; solo el usuario los pasa a `aceptada`.
3. **Presupuesto de PR:** T1+T2 ≈ 1.100 líneas de autoría y el total ≈ 4.000 (estimación de
   `tasks.md`: ~2.650); los tests son ~60 %. Requiere `size:exception` o partir la cadena de PRs.
4. Valores de negocio sin cargar: texto de `mensaje_techo_gasto` (default provisional) y precios de
   `LLM_PRECIOS_USD_JSON` a refrescar contra OpenRouter antes de producción.
5. `LlmModule` **no** está en `AppModule`; la Fase 07 debe registrarlo, reemplazar `GENERADOR_RESPUESTA`
   y exportar un caso de uso para leer `mensaje_techo_gasto`.

## Qué aprendimos que cambia las fases siguientes

- El AI SDK reintenta por defecto: cualquier adaptador nuevo debe fijar `maxRetries: 0` y probarlo con
  un contador en el simulador.
- Un circuit breaker necesita una salida para **cada** resultado de la sonda (éxito, fallo, 4xx, sonda
  perdida); probar solo el camino feliz y el de fallo reintentable dejó pasar C1 hasta `judgment-day`.
- Añadir claves obligatorias a `Configuracion` rompe todo test que arme el objeto entero: el fixture
  compartido evita repetirlo en cada fase.
- `Test.createTestingModule().compile()` reemplaza el logger de Nest: capturar logs exige instalarlo
  **después** de compilar.
- El simulador local de OpenRouter (errores, herramientas, caché, colgar, cortar) sirve para las evals de
  la Fase 07 sin gastar.
