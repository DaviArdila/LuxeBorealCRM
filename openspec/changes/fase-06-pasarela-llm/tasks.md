# Tasks: Fase 06 — Pasarela LLM

Review requerida (por commit de unidad de trabajo): **RDD**. Además, esta fase **completa** (no cada
tarea) requiere **`judgment-day` obligatorio antes de `sdd-verify`** — `fase-06-pasarela-llm` está
en la lista 04/05/06/10 de `docs/fases/README.md` regla 6, confirmado en `proposal.md` §"Decisiones
ya tomadas" y en `design.md` §"Migration / Rollout". Ver sección "Review de la fase" al final;
ninguna tarea individual la repite. Sin `judgment-day` con veredicto, `sdd-verify` MUST NOT cerrar
la fase.

Convención de conteo (`openspec/config.yaml` §rules.tasks, "Máximo 10 tareas por change"): cada
**tarea** (`T1`…`T9`) es una unidad de trabajo completa que termina en **un solo commit**
(comportamiento + tests + docs juntos, Conventional Commits). Los cuatro slices del Approach de
`proposal.md` (`(a)`–`(d)`) se reparten en **9 tareas**, agrupadas por orden de construcción real
(compatibilidad → puerto y dominio puro → configuración y fronteras → gateway por capas →
adaptador → persistencia → techo → módulo y cierre) en vez de una tarea por slice literal, porque
`(b)` mezcla timeout/reintento con fallback/circuit-breaker sobre el mismo archivo y conviene
separarlos para que cada `RED→GREEN` sea observable por sí solo, y porque `(c)` mezcla
configuración (sin dependencias) con adaptador (que la consume).

**Resultado: 9 tareas, dentro del límite de 10.** No hace falta proponer partir la fase.

## Nota de conteo de escenarios (verificada línea por línea, 2026-09-28)

Esta fase implementa el dominio nuevo **LLM1–LLM13** (`specs/llm/spec.md` de este change) y el delta
de trazabilidad **R13** (`specs/conversaciones/spec.md`: escenario «Costo de cada llamada al LLM
registrado», cuyo escritor es el gateway). Total: **27 escenarios primarios + 1 trazabilidad**:

- **LLM1 (3)**, **LLM2 (2)**, **LLM3 (2)**, **LLM4 (2)**, **LLM5 (3)**, **LLM6 (2)**, **LLM7 (2)**,
  **LLM8 (1)**, **LLM9 (2)**, **LLM10 (2)**, **LLM11 (2)**, **LLM12 (2)**, **LLM13 (2)**.
- **R13 (trazabilidad, 1)**: sin test propio separado — se verifica vía los tests de LLM6 en T7 (el
  gateway escribe; `conversaciones` no cambia de comportamiento).

LLM1 «Generación con tipos propios» y LLM2 «transporte sin interpretar» se prueban a **dos
niveles** (unitario en T2, confirmado a nivel de integración en T6 con el mismo título exacto),
igual que R6 en la Fase 05. LLM12 «misma conversación contra 2 modelos» se habilita en T3 (config)
y se prueba como primario en T9 (necesita gateway + adaptador + config cableados).

## Checklist

- [x] T1 — Compatibilidad ai + provider OpenRouter con NestJS 12 ESM + simulador local (D11d)
- [x] T2 — Puerto LlmPort + dominio puro + puertos internos + FakePuertoLlm (S(a))
- [x] T3 — Configuración por perfil validada con Zod + fronteras regla 13 (S(c) parcial)
- [x] T4 — Gateway v1: timeout + presupuesto total + reintento acotado, un modelo (S(b) parcial)
- [x] T5 — Gateway v2: fallback nivel 1 iterado + circuit breaker + error tipado (S(b) parcial)
- [ ] T6 — Adaptador OpenRouter AI SDK sin reintentos propios (S(c) parcial)
- [ ] T7 — Repositorio uso_llm Prisma + índice aditivo + agregado mensual (S(d) parcial)
- [ ] T8 — Techo mensual + aviso 80 % + parámetro mensaje_techo_gasto (S(d) parcial)
- [ ] T9 — Módulo llm + redacción R14 + verificación 2 modelos + cierre documental (S(d) parcial)

## Mapeo de escenarios por tarea (27 primarios + 1 trazabilidad)

| Tarea | Requisitos (primario) | # Escenarios primarios | Soporte (mismo escenario, otro nivel) |
|---|---|---|---|
| T1 | — (compatibilidad ESM, sin escenario propio; habilita LLM11/LLM12) | 0 | — |
| T2 | LLM1 «Generación con tipos propios», LLM1 «Metadatos opacos», LLM2 (2) | 4 | — |
| T3 | LLM3 «Timeout por debajo del TTL», LLM11 «SDK solo en infraestructura», LLM12 «Config inválida impide arranque» | 3 | LLM12 «2 modelos» (habilitante: perfiles) |
| T4 | LLM3 «Timeout se aborta», LLM4 (2) | 3 | — |
| T5 | LLM1 «Error tipado distingue causa», LLM5 (3) | 4 | — |
| T6 | LLM11 «Un solo intento y propaga» | 1 | LLM1 «Generación» + LLM2 «transporte» (confirmación integración, mismos títulos que T2) |
| T7 | LLM6 (2), LLM13 (2) | 4 | R13 «Costo de cada llamada al LLM registrado» (trazabilidad, vía LLM6) |
| T8 | LLM7 (2), LLM8 (1), LLM9 (2) | 5 | — |
| T9 | LLM10 (2), LLM12 «Misma conversación contra 2 modelos» | 3 | — |
| **Total** | | **27** | +1 trazabilidad |

## Matriz de amenazas aplicable a esta fase

`design.md` §"Threat Matrix" declara **N/A**: sin borde de ruteo, comandos shell, subprocesos,
automatización VCS/PR ni clasificación de ejecutables — el gateway es una llamada HTTPS saliente a
OpenRouter vía AI SDK dentro del proceso NestJS, con abortos por `AbortSignal`. **No se fabrica
ninguna tarea desde ese punto**, y ninguna fila marcada `N/A` se reinterpreta como trabajo.

El riesgo real de esta fase no es un vector de ejecución sino la **fuga de contenido/PII a logs o
a `uso_llm`** (**R14**) y el **techo de dinero** (**R13**): ambos tienen escenarios propios
(LLM10, LLM6–LLM9) y su RED test vive en T7/T8/T9, con foco explícito de `judgment-day` (fila 5 de
Risks de `proposal.md`).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2.600–2.900 líneas de autoría (estimación propia de `sdd-tasks`; cada tarea la corrige con su diff real al aplicarla) |
| 400-line budget risk | **High**: PR3 (gateway T4+T5, ~600–700, lógica de resiliencia + combinatoria de tests) supera el presupuesto por naturaleza; PR1 (T1+T2, ~500) y PR4 (T6+T7, ~600) lo rozan. Medio en PR5. Bajo en PR2 |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 (5 PRs apilados, ver abajo) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

`Decision needed before apply: No` porque `auto-chain` ya trae la cadena `stacked-to-main` cacheada
desde el preflight de esta sesión y desde "Entrega" de `proposal.md`/`design.md` ( §Approach y
§Migration); `sdd-apply` procede con T1 sin pedir confirmación adicional.

**Excepción automática vs. pregunta explícita, por tarea** (`openspec/config.yaml` §rules.tasks). La
fila 4 de Risks de `proposal.md` anticipa explícitamente **"Slice del gateway supera las ~400
líneas (lógica + tests de resiliencia)"**:

- **T4 + T5 (gateway, PR3)**: si el diff real confirma o supera el estimado, `size:exception` se
  aplica **automáticamente**, citando esa fila; `sdd-apply` no pregunta.
- **Resto de tareas (T1, T2, T3, T6, T7, T8, T9)**: ese exceso NO está anticipado para ellas — si su
  diff real supera significativamente el presupuesto, `sdd-apply` **MUST pedir `size:exception`**
  antes de continuar.
- **T9 (cierre documental parcial)**: bajo presupuesto esperado en código; la parte documental
  (`docs/migracion/inventario.md`, `docs/fases/README.md`) sigue la regla de tareas documentales
  (`openspec/config.yaml` §rules.tasks) y no cuenta para forzar una excepción.

Ninguna tarea recorta tests, comentarios ni documentación para acercarse al presupuesto.

Estimación de líneas de autoría por tarea (propia de `sdd-tasks`, no medida):

| Tarea | Archivo(s) principal(es) | Estimado | Anticipado en Risks de `proposal.md` |
|---|---|---|---|
| T1 | `package.json`, simulador local + spec de compat, anotación de versiones en este `tasks.md` | ~120 | No (bajo presupuesto) |
| T2 | `puertos/llm-port.ts`, 4 archivos de `dominio/`, 3 puertos, `test/fakes/puerto-llm-falso.ts` + specs | ~380 | No — pregunta si excede |
| T3 | `esquema.ts` (16 variables D12 + `superRefine`), `.env.example`, `.dependency-cruiser.cjs` + fixture + specs | ~300 | No — pregunta si excede |
| T4 | `aplicacion/llm-gateway.ts` v1 (timeout/presupuesto/reintento) + spec (LLM3 + LLM4) | ~330 | **Sí** — fila 4 de Risks (junto con T5) |
| T5 | `aplicacion/llm-gateway.ts` v2 (fallback/CB/error tipado) + spec (LLM1 error + LLM5) | ~300 | **Sí** — fila 4 de Risks (junto con T4) |
| T6 | `infraestructura/adaptador-openrouter.ts` + spec de integración contra simulador | ~320 | No — pregunta si excede |
| T7 | `MODELO_DATOS.md`, `schema.prisma` + migración, 2 repositorios Prisma + specs + integración | ~350 | No — pregunta si excede |
| T8 | `llm-gateway.ts` v3 (techo/aviso) + `repositorio-parametro-llm-prisma.ts` + specs | ~330 | No — pregunta si excede |
| T9 | `llm.module.ts`, `index.ts`, tests R14/2-modelos + `docs/migracion/inventario.md`, `docs/fases/README.md` | ~220 | No (bajo presupuesto en código; cierre documental sin riesgo) |
| **Total** | | **~2.650** | |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | T1+T2: compat ESM + puerto, dominio puro y fake (fundación sin I/O) | PR1 | `npm test -- modulos/llm` | Simulador OpenRouter local en `localhost` para T1 (sin key, sin gasto); resto N/A — funciones puras y tipos, sin I/O ni tráfico real | Revertir `src/modulos/llm/puertos/**`, `src/modulos/llm/dominio/**`, `test/fakes/puerto-llm-falso.ts` (+specs), `test/soporte/simulador-openrouter.ts`, entradas `ai`/`@openrouter/ai-sdk-provider` en `package.json` |
| 2 | T3: configuración por perfil + regla de fronteras 13 (datos, R15) | PR2 | `npm test -- plataforma/config` + `npm run fronteras` | N/A — validación de arranque y análisis estático de imports; sin proveedores externos ni tráfico real | Revertir cambios en `src/plataforma/config/esquema.ts` (+spec), `.env.example`, `.dependency-cruiser.cjs`, `test/fronteras/dependency-cruiser.spec.ts` |
| 3 | T4+T5: gateway completo (timeout, reintento, fallback, CB, error tipado) | PR3 | `npm test -- modulos/llm/aplicacion` | N/A — unitarios deterministas con `FakeAdaptadorLlm` programable + repos en memoria + `ClockFalso` + `AbortSignal` real; sin red, sin gastar; `size:exception` automática citando fila 4 de Risks de `proposal.md` | Revertir `src/modulos/llm/aplicacion/llm-gateway.ts` (+spec); el puerto/dominio de PR1 queda intacto |
| 4 | T6+T7: adaptador real + persistencia de costo (borde e I/O) | PR4 | `npm run test:integracion -- llm` | Simulador OpenRouter local (override `OPENROUTER_BASE_URL`, sin key real, sin gasto) + Postgres real vía Testcontainers (arnés `base-por-worker`) | Revertir `src/modulos/llm/infraestructura/adaptador-openrouter.ts` (+spec), `src/modulos/llm/infraestructura/prisma/repositorio-uso-llm-prisma.ts` (+specs), `prisma/schema.prisma` + migración aditiva, `MODELO_DATOS.md` §7 |
| 5 | T8+T9: techo y aviso + módulo, redacción R14 y cierre (integración sin cablear) | PR5 | `npm test -- modulos/llm` + `npm run test:integracion -- llm` + `npm run verify` al cierre del slice | Postgres real vía Testcontainers para el repositorio de parámetros; logger real espiado para R14; N/A tráfico real — `LlmModule` MUST NOT registrarse en `AppModule` (verificación explícita en T9) | Revertir extensión de techo en `llm-gateway.ts`, `src/modulos/llm/infraestructura/prisma/repositorio-parametro-llm-prisma.ts` (+specs), `src/modulos/llm/llm.module.ts`, `src/modulos/llm/index.ts`; revertir `docs/migracion/inventario.md`, `docs/fases/README.md` |

Diagrama de dependencia (cadena lineal, `stacked-to-main`; cada PR se fusiona a `main` antes de
abrir el siguiente, siguiendo el orden de construcción de `design.md` §Data Flow):

```
PR1 (compat + puerto/dominio/fake) → PR2 (config + fronteras)
  → PR3 (gateway timeout/reintento/fallback/CB) → PR4 (adaptador + repo uso_llm)
  → PR5 (techo/aviso + módulo + cierre)
```

Base de cada PR (`stacked-to-main`): PR1 base = `main`; PR2 base = `main` tras fusionar PR1;
PR3 base = `main` tras PR2; y así sucesivamente. Si un diff hijo muestra cambios del PR anterior,
la base está mal y MUST rebasarse antes de la review (skill `chained-pr`).

---

## T1 — Compatibilidad ai + provider OpenRouter con NestJS 12 ESM + simulador local

**Objetivo**: verificar ANTES que el dominio (D11d de `design.md`, riesgo 1 de `proposal.md`) que
`ai` + `@openrouter/ai-sdk-provider` compilan y corren bajo NestJS 12 ESM (`"type": "module"`,
enmienda ADR-0001, mismo procedimiento que BullMQ en la Fase 00a): `npm install` sin `ERESOLVE`,
`tsc`/`nest build` con `import from 'ai'`, y un spec que corre `generateText` contra el simulador
local. Fija las versiones en este `tasks.md`. Si falla, se avisa al usuario y el fallback es
adaptador con `fetch` directo (rediseño, no degradación silenciosa).

**Dependencias**: ninguna (primera tarea de la fase; bloquea T6).

**Archivos** (`design.md` D11, tabla "File Changes" parcial):
- `package.json` (Modify) — deps de producción `ai`, `@openrouter/ai-sdk-provider` fijadas.
- `test/soporte/simulador-openrouter.ts` (Create) — servidor HTTP en `localhost` con respuestas
  fijas formato chat/completions + `usage` accounting y contador de intentos (reusado en T6).
- `test/integracion/llm/compat-ai-sdk.spec.ts` (Create) — importa `ai`, llama `generateText` con
  `createOpenRouter({ baseURL: simulador })`, confirma respuesta del contrato mínimo.
- `openspec/changes/fase-06-pasarela-llm/tasks.md` (Modify) — anotar versiones fijadas + resultado.

**Escenarios cubiertos**: ninguno con id propio (verificación de compatibilidad, como T3 de la
Fase 05); habilita LLM11/LLM12.

**RED → GREEN → REFACTOR** (planificado):
1. RED: spec de compat contra dependencia inexistente/API sin probar. Correr
   `npm run test:integracion -- compat-ai-sdk` y observar fallo (import sin resolver o conexión sin
   mapeo).
2. GREEN: instalar versiones compatibles, cablear el simulador vía `OPENROUTER_BASE_URL`, mapear lo
   mínimo hasta que el spec pase sin key real ni gasto.
3. REFACTOR: confirmar que ningún import de `ai` sale de `test/` todavía (el adaptador real llega en
   T6); anotar la tabla de versiones fijadas en este archivo.

**Hecho cuando**:
- `npm install` sin `ERESOLVE` (peerDeps contra `^12`) y `npm run build`/`tsc` en verde con
  `import from 'ai'`.
- El spec corre `generateText` contra el simulador local y pasa, sin `OPENROUTER_API_KEY` real.
- Este `tasks.md` registra las versiones fijadas y el resultado (T-apply lo transcribe con el diff
  real).

**Comando de test**: `npm run test:integracion -- compat-ai-sdk`

**Slice de PR**: S(a) → PR1 (con T2)

**Review requerida**: RDD

**Resultado (apply, 2026-09-29)** — compatible, sin fallback:

| Paquete | Versión fijada (`--save-exact`) | `peerDependencies` | Resultado |
|---|---|---|---|
| `ai` | `7.0.122` | `zod ^3.25.76 \|\| ^4.1.8` (proyecto: `4.6.5`) | `npm install` sin `ERESOLVE`; `nest build` y `tsc` en verde con `import from 'ai'` bajo `"type": "module"` |
| `@openrouter/ai-sdk-provider` | `3.1.0` | `ai ^7.0.0`, `zod ^3.25.76 \|\| ^4.1.8` | `createOpenRouter({ baseURL })` funciona contra el simulador local, sin API key real |

Hallazgos que T6 debe respetar: el provider serializa el `system` como partes
`[{ type: 'text', text }]` y el mensaje de usuario como string plano; `usage.inputTokens` /
`outputTokens` de `generateText` salen de `usage.prompt_tokens` / `completion_tokens` del cuerpo
`chat/completions`. `npm run auditoria` sin vulnerabilidades ≥ high tras la instalación.

---

## T2 — Puerto LlmPort + dominio puro + puertos internos + FakePuertoLlm

**Objetivo**: el contrato que todo lo demás consume (D1/D6/D8/D13 de `design.md`): `LLM_PORT` +
tipos propios (`SolicitudGeneracion` con `systemPrompt` separado, `RespuestaGeneracion`,
`DefinicionHerramienta` con Zod + JSON Schema, `metadatosProveedor?: unknown` en dos niveles),
`ErrorPasarelaLlm` con los 5 códigos (LLM1), funciones puras `calcularCostoEstimado` en micro-USD
+ `inicioMesUTC` (**R2**: el LLM nunca calcula; aritmética entera), `validarLlamadasHerramienta`
(LLM2: la inválida va a `llamadasInvalidas`, nunca `{}` en silencio — **A7**), máquina pura del
circuit breaker (`debeLlamar`/`registrarExito`/`registrarFallo` sobre `(estado, ahora)` con `Clock`
en el borde, D5), puertos `REPOSITORIO_USO_LLM` / `REPOSITORIO_PARAMETRO_LLM` (solo firmas) y puerto
interno `ADAPTADOR_LLM` (un intento, NO exportado), más `FakePuertoLlm` en `test/fakes/` para las
Fases 06–07.

**Dependencias**: T1 (versiones del SDK fijadas; los tipos propios no importan el SDK por diseño,
pero la secuencia garantiza que el contrato no se escribe sobre una base incompatible).

**Archivos** (`design.md`, tabla "File Changes"):
- `src/modulos/llm/puertos/llm-port.ts` + spec (Create) — D1, LLM1 (**R1/R2**: transporte, sin
  interpretar).
- `src/modulos/llm/dominio/error-pasarela-llm.ts` + spec (Create) — LLM1.
- `src/modulos/llm/dominio/calcular-costo.ts` + spec (Create) — D6/D7 (**R2**).
- `src/modulos/llm/dominio/validar-llamadas.ts` + spec (Create) — D13 (LLM2).
- `src/modulos/llm/dominio/estado-circuito.ts` + spec (Create) — D5.
- `src/modulos/llm/puertos/repositorio-uso-llm.ts` (Create) — firmas LLM13.
- `src/modulos/llm/puertos/repositorio-parametro-llm.ts` (Create) — firmas D9.
- `src/modulos/llm/puertos/adaptador-llm.ts` (Create) — puerto interno + `AdaptadorLlmError`
  (reintentable/no-reintentable), NO exportado en el barril (LLM11).
- `test/fakes/puerto-llm-falso.ts` (Create) — éxito/error programables, fallback observable, modelo
  usado visible.

**Escenarios cubiertos** (título exacto, `specs/llm/spec.md`):
- `LLM1 — Generación con tipos propios sin SDK en el contrato`
- `LLM1 — Metadatos opacos del proveedor se transportan sin interpretar`
- `LLM2 — Definiciones y llamadas de herramientas se transportan sin interpretar`
- `LLM2 — Argumentos inválidos devuelven error de herramienta, nunca objeto vacío`

**RED → GREEN → REFACTOR** (planificado):
1. RED: specs de puerto/dominio/fake contra archivos inexistentes (el test de metadatos exige
   `unknown` byte a byte; el de args inválidos exige `llamadasInvalidas` con causa y prohíbe `{}`).
   Correr `npm test -- modulos/llm` y observar fallo.
2. GREEN: implementar tipos, error tipado, costo en micro-USD con redondeo exacto, validación que
   deja pasar intactas las válidas y aparta las inválidas con causa, máquina del circuito con
   `ClockFalso`, y el fake programable, hasta que los cuatro escenarios pasen.
3. REFACTOR: confirmar `dominio/` sin imports fuera de sí mismo y `compartido/` (regla 3), sin
   `Date.now()`/`new Date()` fuera de `plataforma/reloj`, sin tipos del SDK en el puerto
   (anticipa la regla 13 de T3).

**Hecho cuando**:
- Los cuatro escenarios listados pasan con el título exacto como nombre del test.
- `calcularCostoEstimado` es exacta en micro-USD (casos borde: caché ausente → 0, ceros, redondeo).
- Ningún archivo de esta tarea importa `ai` ni `@openrouter/*`; el puerto interno no sale del
  módulo.

**Comando de test**: `npm test -- modulos/llm`

**Slice de PR**: S(a) → PR1 (con T1)

**Review requerida**: RDD

**Resultado (apply, 2026-09-29)** — 4 escenarios con título exacto + 31 tests de soporte en verde;
`npm run verify` en verde (119 archivos, 639 tests). Desviaciones menores respecto de `design.md`,
todas por la regla de fronteras 3 o por necesidad del código, ninguna cambia el contrato observable:

- Los tipos del contrato viven en `dominio/tipos-llm.ts` (no en `puertos/llm-port.ts`): `dominio/`
  no puede importar de `puertos/`. `llm-port.ts` los re-exporta, así que el llamador sigue
  importando todo del puerto.
- `DefinicionHerramienta.esquema` es la interfaz estructural `EsquemaArgumentos` (`safeParse`) en
  vez de `z.ZodType<unknown>`: `dominio/` tampoco puede importar `zod`. Un esquema Zod la satisface.
- `AdaptadorLlmError` lleva `clase`, `causa` (`timeout` | `http` | `sin-respuesta`) y `estadoHttp?`:
  el gateway (T4/T5) necesita distinguir `timeout` de `proveedor-caido` sin inspeccionar mensajes.
- `registrarExito()` no recibe el estado: un éxito siempre deja el circuito en su estado inicial.
- Una llamada a una herramienta que no está en las definiciones se devuelve como inválida (D13 no
  lo decía; pasarla como válida dejaría llegar argumentos sin validar).
- Fórmula de costo idéntica a D6. Observación para T6: `prompt_tokens` de OpenRouter incluye los
  tokens de caché, así que sumar `tokensCache` aparte sobreestima ligeramente (lado seguro para un
  techo). El adaptador puede restar la caché de `tokensEntrada` al mapear.

---

## T3 — Configuración por perfil validada con Zod + fronteras regla 13

**Objetivo**: las 16 variables D12 de `design.md` en `src/plataforma/config/esquema.ts` con defaults
y `superRefine` (modelos ⊆ precios; timeout conversación < `LOCK_TURNO_TTL_S`·1000 — Q5/LLM3;
`OPENROUTER_API_KEY` obligatoria en `production`; base ≤ max; rangos CB/techo), documentadas en
`.env.example` sin secretos (**R15**: cambiar de modelo = cambiar datos + correr evals, nunca tocar
código; PLT1: sin config válida no se arranca), más la regla 13 de `dependency-cruiser`
(`ai`/`@openrouter/*` solo desde `src/modulos/llm/infraestructura/`, LLM11) con su fixture
violadora (patrón de las 12 reglas).

**Dependencias**: T2 (nombres de modelos y forma de precios que la config MUST cubrir).

**Archivos** (`design.md` D3/D4/D5/D12, LLM12, tabla "File Changes"):
- `src/plataforma/config/esquema.ts` + spec (Modify) — variables `LLM_CONVERSACION_*`,
  `LLM_EVALS_*`, `LLM_TECHO_MENSUAL_USD` (default 10, Q1), `LLM_UMBRAL_AVISO_PCT` (default 80, Q2),
  `LLM_PRECIOS_USD_JSON` (Luna 0,20/1,20/caché 0,02 por 1 M — valores a refrescar en T-apply contra
  las páginas de OpenRouter, pregunta abierta no bloqueante), `LLM_REINTENTO_*`, `LLM_CB_*`,
  `OPENROUTER_API_KEY`/`OPENROUTER_BASE_URL` + `superRefine`.
- `.env.example` (Modify) — documenta cada `LLM_*`/`OPENROUTER_*` sin valores reales.
- `.dependency-cruiser.cjs` (Modify) — regla 13 `ai-solo-en-infraestructura-llm`.
- `test/fronteras/dependency-cruiser.spec.ts` (Modify) — fixture que viola la regla 13.

**Escenarios cubiertos** (título exacto):
- `LLM3 — Timeout de conversación por debajo del TTL del lock de turno`
- `LLM11 — SDK del proveedor solo aparece en la infraestructura de llm`
- `LLM12 — Configuración LLM inválida impide el arranque nombrando la variable`

**RED → GREEN → REFACTOR** (planificado):
1. RED: specs de esquema (timeout ≥ lock arranca igual; modelos sin precio arrancan; `LLM_*`
   inválida arranca) + fixture de fronteras que importa `ai` fuera de infraestructura y pasa.
   Correr `npm test -- plataforma/config` y `npm run fronteras` y observar fallo.
2. GREEN: implementar variables, defaults, `superRefine` con error que nombra la variable sin
   imprimir su valor (PLT1), y la regla 13, hasta que los tres escenarios pasen.
3. REFACTOR: confirmar que el camino feliz no paga queries extra (la lectura de `parametro` llega
   en T8 solo al cruzar el 80 %); que `.env.example` no contiene secretos.

**Hecho cuando**:
- Los tres escenarios listados pasan con el título exacto como nombre del test.
- `npm run fronteras` rechaza `ai`/`@openrouter/*` fuera de `modulos/llm/infraestructura`.
- Cambiar la lista de modelos de un perfil no toca ningún archivo de `src/` salvo la env (R15).

**Comando de test**: `npm test -- plataforma/config` + `npm run fronteras`

**Slice de PR**: S(c) parcial → PR2

**Review requerida**: RDD

**Resultado (apply, 2026-09-29)** — 3 escenarios con título exacto + 6 tests de soporte;
`npm run verify` en verde (119 archivos, 648 tests, `contrato:deriva` sin cambios). Desviaciones:

- **La regla de fronteras es la 14, no la 13**: la 13 ya existe (`solo-conversaciones-importa-canales`,
  Fase 05). Nombre `ai-solo-en-infraestructura-llm`, como en `design.md`.
- **`Configuracion` gana 17 claves obligatorias** y ~32 archivos armaban el objeto completo a mano.
  En vez de repetir 17 líneas en cada uno, `test/soporte/configuracion-llm-de-prueba.ts` exporta el
  bloque y cada archivo lo expande con `...CONFIGURACION_LLM_DE_PRUEBA` (2 líneas por archivo;
  `scripts/generar-contrato.ts` lo lleva inline para no importar de `test/`). Es la mayor parte de
  las líneas cambiadas de esta tarea y es mecánica.
- `LLM_PRECIOS_USD_JSON` llega como texto y `Configuracion.LLM_PRECIOS_USD_JSON` ya es el objeto
  `modelo → { entrada, salida, cache }` parseado; las listas `*_MODELOS` salen como `string[]`.
- **`.env.example` NO se actualizó**: el permiso de lectura del entorno deniega ese archivo (mismo
  bloqueo que anotaron las Fases 03 y 04). Pendiente de que alguien con acceso agregue este bloque:

  ```
  # --- LLM (Fase 06): perfiles, reintento, circuit breaker, techo y OpenRouter ---
  LLM_CONVERSACION_MODELOS=openai/gpt-5.6-luna      # CSV en orden de prioridad (fallback)
  LLM_CONVERSACION_TIMEOUT_MS=15000                 # debe ser < LOCK_TURNO_TTL_S * 1000
  LLM_CONVERSACION_MAX_TOKENS=400
  LLM_CONVERSACION_MAX_REINTENTOS=2                 # 0-2
  LLM_EVALS_MODELOS=openai/gpt-5.6-luna
  LLM_EVALS_TIMEOUT_MS=30000
  LLM_EVALS_MAX_TOKENS=400
  LLM_EVALS_MAX_REINTENTOS=2
  LLM_TECHO_MENSUAL_USD=10                          # techo mensual del LLM (R13)
  LLM_UMBRAL_AVISO_PCT=80                           # aviso warn al cruzar este % del techo
  LLM_PRECIOS_USD_JSON={"openai/gpt-5.6-luna":{"entrada":0.2,"salida":1.2,"cache":0.02}}
  LLM_REINTENTO_BASE_MS=500
  LLM_REINTENTO_MAX_MS=2000
  LLM_CB_UMBRAL_FALLOS=5
  LLM_CB_VENTANA_S=60
  OPENROUTER_API_KEY=                               # obligatoria en production; nunca commitear
  OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
  ```

---

## T4 — Gateway v1: timeout + presupuesto total + reintento acotado, un modelo

**Objetivo**: `LlmGateway` (aplicación, `@Injectable`, implementa `LlmPort`) en su primera capa
(D3/D4 de `design.md`): timeout por intento con `AbortSignal` real, presupuesto total derivado del
lock (`LOCK_TURNO_TTL_S − 5 s`; `timeoutEfectivo = min(timeoutPerfil, restante)`; solo se reintenta
si restante > 2 s), reintento solo ante 429/5xx/timeout/aborto/conexión hasta 2 reintentos (3
intentos por modelo, timeouts SÍ se reintentan — **A7**), backoff `min(base·2^n + jitter, max)`
(`LLM_REINTENTO_BASE_MS = 500`, `MAX = 2000`, jitter 0–200 ms), 4xx distinto de 429 sin reintento
contra el mismo modelo. En v1 el gateway itera sobre **un solo modelo** (el bucle multi-modelo
llega en T5); el registro en `uso_llm` se delega al puerto con un repositorio en memoria en tests
(la persistencia real llega en T7); el techo se comporta como "siempre por debajo" (la comparación
real llega en T8).

**Dependencias**: T2 (puerto, error, costo, validación, fake programable por modelo), T3 (timeouts
y reintentos validados).

**Archivos** (`design.md` D3/D4, LLM3/LLM4):
- `src/modulos/llm/aplicacion/llm-gateway.ts` + spec (Create) — v1: techo-stub, timeout,
  presupuesto, reintento/backoff, mapeo de `AdaptadorLlmError` a `ErrorPasarelaLlm`.

**Escenarios cubiertos** (título exacto):
- `LLM3 — Llamada que supera el timeout del perfil se aborta`
- `LLM4 — Fallo reintentable se reintenta como máximo 2 veces`
- `LLM4 — Error 4xx distinto de 429 no se reintenta contra el mismo modelo`

**RED → GREEN → REFACTOR** (planificado):
1. RED: spec del gateway v1 con `FakeAdaptadorLlm` (tarda X ms / responde 429 N veces / responde
   400) + `ClockFalso` + `AbortSignal` real: timeout aborta y registra `timeout`; 429 reintenta con
   esperas ~0,5–0,7 s y ~1,0–1,2 s y al tercer fallo devuelve el tipado sin cuarto intento; 400
   pasa al siguiente o devuelve `no-reintentable` sin repetir. Correr
   `npm test -- modulos/llm/aplicacion` y observar fallo.
2. GREEN: implementar timeout efectivo, presupuesto D3 y backoff D4 hasta que los tres escenarios
   pasen; el peor caso (dos timeouts) consume ~25 s y nunca deja expirar el lock de 30 s.
3. REFACTOR: confirmar `Math.random` del jitter documentado y aislado del `Clock`; que el adaptador
   nunca duerme ni reintenta (restricción ADR-0002 verificada en T6).

**Hecho cuando**:
- Los tres escenarios listados pasan con el título exacto, sin red ni gasto.
- Con 15 s por intento y 2 reintentos, el presupuesto total D3 impide superar `LOCK_TURNO_TTL_S`
  (aritmética de D3 verificada en test con `LOCK_TURNO_TTL_S = 30`).

**Comando de test**: `npm test -- modulos/llm/aplicacion`

**Slice de PR**: S(b) parcial → PR3 (con T5; `size:exception` automática citando fila 4 de Risks)

**Review requerida**: RDD

**Resultado (apply, 2026-09-29)** — 3 escenarios con título exacto + 13 tests de soporte (16 en
`llm-gateway.spec.ts`); mutaciones del backoff, del mínimo de 2 s y del tope de reintentos las
detectan 6 tests. Decisiones y desviaciones (ninguna cambia el contrato de `design.md`):

- **Puerto interno `TemporizadorLlm`** (`esperar`, `azar`, `programar`; token `TEMPORIZADOR_LLM`): el
  backoff, el jitter y el aborto por timeout necesitan un borde que los tests puedan controlar. Su
  implementación real (`setTimeout` / `Math.random`) se escribe en T9, junto con `LlmModule`.
- El gateway impone el timeout con `Promise.race` contra la señal de aborto: aunque un adaptador
  ignore `AbortSignal`, la llamada termina en `timeout` (LLM3).
- Al agotar los reintentos: causa `timeout` → `timeout`; 429/5xx/sin respuesta → `proveedor-caido`;
  4xx → `no-reintentable`. `design.md` dejaba implícito el caso 429/5xx agotado.
- Un error que el adaptador no clasificó se trata como `no-reintentable` y solo se loguea el modelo.
- La validación de llamadas de herramienta (D13) ya corre en el camino de éxito (LLM2), no en T5.
- `uso_llm` no tiene columna de causa: el intento fallido queda con `exito=false`, tokens y costo en
  cero; el código (`timeout`, `no-reintentable`…) viaja en el `ErrorPasarelaLlm` y en el log `warn`.
- `ConfigGatewayLlm` es un `Pick<Configuracion, …>` para que los tests no armen las ~55 variables.
- Dobles nuevos en `test/fakes/`: `FakeAdaptadorLlm`, `RepositorioUsoLlmEnMemoria`,
  `TemporizadorLlmFalso` (sin spec propio: los ejercita `llm-gateway.spec.ts`).

---

## T5 — Gateway v2: fallback nivel 1 iterado + circuit breaker + error tipado

**Objetivo**: segunda capa del mismo `LlmGateway` (D2 → ADR-0014 propuesta; D5 → ADR-0013 propuesta,
ambas de `design.md`): recorre
los modelos del perfil en orden con **una llamada al adaptador por modelo y un solo id** (sin el
parámetro server-side `models`; cada intento deja su fila — **R13**), circuito por id de modelo en
`Map` en memoria (5 fallos consecutivos de proveedor — excluye 4xx no reintentables y
`techo-alcanzado` — abren 60 s; 1 sonda semi-abierta que cierra o reabre), extensión del nivel 2
directo pospuesto (Q4: interfaz lista, sin proveedor directo), y precedencia del error tipado
(`techo-alcanzado` > `circuito-abierto` > `proveedor-caido` > último `timeout`/`no-reintentable`).
Ante caída total sin HTTP, devuelve `proveedor-caido` para handoff en la Fase 07 (degradación
visible, nunca silencio).

**Dependencias**: T4 (gateway v1 con timeout/reintento), T2 (máquina pura del circuito, error
tipado).

**Archivos** (`design.md` D2/D5, LLM1/LLM5):
- `src/modulos/llm/aplicacion/llm-gateway.ts` + spec (Modify) — v2: bucle por modelo, CB en memoria,
  punto de extensión nivel 2, precedencia de códigos.
- `docs/adr/0013-cortacircuitos-en-memoria-pasarela-llm.md` (read-only) — referencia de la decisión;
  ya existe y está indexada, no se recrea en esta tarea.
- `docs/adr/0014-fallback-llm-iterado-en-gateway.md` (read-only) — referencia de la decisión del
  bucle por modelo; ya existe y está indexada, no se recrea en esta tarea.

**Escenarios cubiertos** (título exacto):
- `LLM1 — Error tipado distingue cada causa de fallo`
- `LLM5 — Caída del primer modelo deriva al siguiente sin intervención del llamador`
- `LLM5 — Circuito abierto evita llamar al modelo en fallo sostenido`
- `LLM5 — Caída total de OpenRouter devuelve error tipado sin proveedor directo`

**RED → GREEN → REFACTOR** (planificado):
1. RED: spec v2 con fake programable por modelo (primero caído, segundo responde; modelo con 5
   fallos consecutivos; OpenRouter sin respuesta en todos): el llamador recibe respuesta del
   siguiente sin cambiar su llamada y `uso_llm` en memoria registra fallido + exitoso; el CB no
   llama al proveedor en ventana y deja pasar 1 sonda; la caída total devuelve `proveedor-caido`.
   Correr `npm test -- modulos/llm/aplicacion` y observar fallo.
2. GREEN: implementar el bucle D2 y el CB D5 (transiciones puras de T2 + `Clock` en el borde) hasta
   que los cuatro escenarios pasen.
3. REFACTOR: confirmar que 4xx no reintentables y `techo-alcanzado` nunca cuentan como fallo del
   proveedor para el CB; que ninguna rama inspecciona `metadatosProveedor` (D8, LLM2/**R2**).

**Hecho cuando**:
- Los cuatro escenarios listados pasan con el título exacto, sin red ni gasto.
- El estado del CB vive en memoria del proceso gateway (ADR-0013); Redis no aparece en el camino
  crítico.

**Comando de test**: `npm test -- modulos/llm/aplicacion`

**Slice de PR**: S(b) parcial → PR3 (con T4; `size:exception` automática citando fila 4 de Risks)

**Review requerida**: RDD

**Resultado (apply, 2026-09-29)** — 4 escenarios con título exacto + 10 tests de soporte (30 en
`llm-gateway.spec.ts`); `npm run verify` en verde (120 archivos, 678 tests). Cuatro mutaciones
(un 4xx cuenta para el circuito, el éxito no reinicia, precedencia invertida, circuito que siempre
permite) las detectan de 1 a 10 tests. Decisiones y desviaciones:

- **El circuito cuenta por intento fallido** de proveedor (no por generación) y se consulta antes de
  cada intento: si se abre a mitad de los reintentos, ese modelo deja de probarse. Un 4xx no
  reintentable no cuenta ni reinicia.
- **Fila de un modelo saltado por circuito abierto** (hallazgo MENOR de la revisión de artefactos:
  `design.md` no la fijaba): `proveedor='pasarela'`, `modelo='circuito-abierto'`, tokens/costo/latencia
  en cero, `exito=false` — igual que la de `techo-alcanzado` (D9). El log `warn` lleva el modelo.
- El presupuesto total (D3) se comparte entre modelos: tras un fallo, si quedan ≤ 2 s no se prueba
  el siguiente.
- Precedencia implementada: ningún modelo probado → `circuito-abierto`; todos los probados
  `proveedor-caido` → `proveedor-caido`; si no, la última causa concreta (`timeout` /
  `no-reintentable`). `ErrorPasarelaLlm.modelo` es el último modelo probado.
- **`LLM1 — Error tipado distingue cada causa de fallo`** prueba las cuatro causas que el gateway
  produce hoy; `techo-alcanzado` lo produce T8 y queda verificado por `LLM9 — Gasto al 100 % …`.
- Punto de extensión del nivel 2 (Q4): puerto `ULTIMO_RECURSO_LLM` (`@Optional()`); el gateway lo
  invoca solo ante `proveedor-caido` y solo si alguien lo registra. Esta fase no registra ninguno.

---

## T6 — Adaptador OpenRouter AI SDK sin reintentos propios

**Objetivo**: el único archivo que importa `ai` y `@openrouter/ai-sdk-provider`
(`infraestructura/adaptador-openrouter.ts`, restricción ADR-0002): mapea tipos propios ↔ AI SDK
(`system`, `messages`, `tools`, `maxOutputTokens`, `abortSignal`), pide `usage: { include: true }`,
lee caché de `providerMetadata.openrouter.usage.promptTokensDetails.cachedTokens` con fallback a
`inputTokenDetails.cacheReadTokens` (default 0, D6), clasifica 429/5xx/timeout/aborto/sin-respuesta
→ reintentable y 400/401/403/404/422/`TypeValidation`/`NoSuchModel` → no-reintentable, hace
**exactamente un intento** y propaga (el gateway decide), y transporta `metadatosProveedor` opacos
sin leerlos ni loguearlos (D8, **R14**).

**Dependencias**: T1 (simulador + compat), T2 (tipos y puerto interno), T3 (regla 13 que lo
encierra).

**Archivos** (`design.md` D6/D8/D11, LLM11):
- `src/modulos/llm/infraestructura/adaptador-openrouter.ts` + spec (Create).
- `test/soporte/simulador-openrouter.ts` (Modify) — casos 429/400/accounting que T1 no necesitó.
- `test/integracion/llm/adaptador-openrouter.spec.ts` (Create) — contra el simulador vía
  `OPENROUTER_BASE_URL`.

**Escenarios cubiertos** (título exacto):
- `LLM11 — Adaptador fallido hace un solo intento y propaga el error`
- Confirmación de integración (mismo título que T2): `LLM1 — Generación con tipos propios sin SDK
  en el contrato`, `LLM2 — Definiciones y llamadas de herramientas se transportan sin interpretar`

**RED → GREEN → REFACTOR** (planificado):
1. RED: spec de integración contra el simulador (429 → clase reintentable con contador del
   simulador en exactamente 1; 400 → no-reintentable con 1 intento; respuesta con tools + usage
   mapea a tipos propios con `tokensCache` correcto). Correr
   `npm run test:integracion -- adaptador-openrouter` y observar fallo.
2. GREEN: implementar el mapeo y la clasificación hasta que los tres casos pasen, sin key real.
3. REFACTOR: correr `npm run fronteras` y confirmar que este archivo es el único origen de imports
   del SDK; confirmar que el `cost` de OpenRouter solo va al log de éxito como referencia, nunca a
   `uso_llm` ni al techo (**R2**).

**Hecho cuando**:
- Los tres casos listados pasan con el título exacto, contra el simulador local sin gastar.
- El contador del simulador prueba 1 solo intento ante fallo reintentable.

**Comando de test**: `npm run test:integracion -- adaptador-openrouter`

**Slice de PR**: S(c) parcial → PR4 (con T7)

**Review requerida**: RDD

---

## T7 — Repositorio uso_llm Prisma + índice aditivo + agregado mensual

**Objetivo**: la persistencia del costo (**R13**): `MODELO_DATOS.md` §7 primero
(`openspec/config.yaml` §design), después `UsoLlm` con `@@index([creado])` (D10) + migración
aditiva sin bloque `[manual]`, `repositorio-uso-llm-prisma.ts` sobre la tabla ya migrada (Fase 01):
`registrarUso` best-effort que **nunca lanza al gateway** (el fallo se loguea y se sigue — LLM13,
nunca-perder > nunca-duplicar heredado de la Fase 05) y agregados `gastoMensual(desde)` /
`gastoMensualPorModelo(desde)` con mes en UTC (`inicioMesUTC` de T2). Cada llamada con proveedor
(éxito o error) deja su fila con proveedor, modelo, tokens, costo estimado, latencia y resultado;
la fila `pasarela/techo-alcanzado` y `pasarela/circuito-abierto` (D9) también pasan por aquí.

**Dependencias**: T2 (puertos del repositorio, `calcularCostoEstimado`, `inicioMesUTC`).

**Archivos** (`design.md` D6/D7/D10, LLM6/LLM13):
- `MODELO_DATOS.md` (Modify, **primero**) — §7 `uso_llm`: índice por `creado`.
- `prisma/schema.prisma` (Modify) — `UsoLlm`: `@@index([creado])`.
- Migración aditiva generada (Create) — `prisma migrate dev --name <que-cambia>`; nunca edita una
  aplicada.
- `src/modulos/llm/infraestructura/prisma/repositorio-uso-llm-prisma.ts` + specs (Create) —
  best-effort + agregados.
- `test/integracion/llm/repositorio-uso-llm.spec.ts` (Create) — Postgres real.

**Escenarios cubiertos** (título exacto):
- `LLM6 — Llamada exitosa registra proveedor, modelo, tokens, costo, latencia y resultado`
- `LLM6 — Llamada fallida también deja su fila en uso_llm`
- `LLM13 — Fallo de escritura no tumba la respuesta y queda visible`
- `LLM13 — Agregado mensual por proveedor y modelo para el techo`
- Trazabilidad: `R13 — Costo de cada llamada al LLM registrado` (`specs/conversaciones/spec.md`;
  se da por verificado con los dos escenarios LLM6 de esta tarea, sin test propio separado)

**RED → GREEN → REFACTOR** (planificado):
1. RED: spec de integración (escritura éxito + error con tokens/costo/latencia; BD caída
   transitoriamente → la respuesta igual se entrega + log de error; filas de varios meses,
   proveedores y modelos → el agregado suma solo el mes en curso desglosado y coincide con el que
   usa el techo). Correr `npm run test:integracion -- repositorio-uso-llm` y observar fallo.
2. GREEN: implementar el repositorio y la migración hasta que los cuatro escenarios (+
   trazabilidad R13) pasen; refrescar `LLM_PRECIOS_USD_JSON` contra las páginas de OpenRouter
   (pregunta abierta no bloqueante: si los precios cambiaron, se actualiza el default de T3 en este
   mismo commit con la fuente citada).
3. REFACTOR: confirmar `Decimal(12,6)` en `costo_estimado_usd`, tipos Prisma sin salir de
   `infraestructura/` (reglas 4/12), y que `uso_llm` nunca guarda texto de mensajes (anticipa
   LLM10 de T9).

**Hecho cuando**:
- Los cuatro escenarios listados pasan con el título exacto, contra Postgres real.
- `npm run verify` sigue verde tras la migración (deriva del contrato sin cambios: sin endpoints).

**Comando de test**: `npm run test:integracion -- repositorio-uso-llm`

**Slice de PR**: S(d) parcial → PR4 (con T6)

**Review requerida**: RDD

---

## T8 — Techo mensual + aviso 80 % + parámetro mensaje_techo_gasto

**Objetivo**: el mecanismo P17 con los valores aprobados Q1–Q3 (techo 10 USD/mes, aviso 80 %,
clave `mensaje_techo_gasto`): orden del gateway (D9) — (1) `NODE_ENV=test` salta el techo (LLM7);
(2) gasto mensual (D7, 1 agregado indexado por llamada, sin caché) ≥ techo → `techo-alcanzado`
**sin proveedor** + fila `uso_llm` (`proveedor='pasarela'`, costo 0, `exito=false`); (3) cruce del
80 % → `warn` estructurado `{ mes, gastoUsd, techoUsd }` sin contenido ni PII (**R14**) + upsert de
`parametro.llm_estado_techo` (lectura del parámetro solo al cruzar el 80 %; `bloqueado: true` al
primer bloqueo — fila observable que pide LLM9); `repositorio-parametro-llm-prisma.ts` con default
provisional embebido (patrón `RepositorioParametroConversacionesPrisma`) y lector
`obtenerMensajeTechoGasto()` — el gateway **no** lee el texto (lo consumen las Fases 07/08), pero el
lector se implementa aquí para el segundo escenario de LLM9 (**R15**: el negocio actualiza el texto
sin desplegar).

**Dependencias**: T4/T5 (gateway donde se inserta el chequeo), T3 (techo/umbral configurados), T7
(agregado mensual y escritura best-effort).

**Archivos** (`design.md` D7/D9, LLM7/LLM8/LLM9):
- `src/modulos/llm/aplicacion/llm-gateway.ts` + spec (Modify) — v3: chequeo previo, aviso idempotente
  por mes, bloqueo sin proveedor.
- `src/modulos/llm/infraestructura/prisma/repositorio-parametro-llm-prisma.ts` + specs (Create) —
  `obtenerMensajeTechoGasto` / `leerEstadoTecho` / `guardarEstadoTecho`; «no configurado» nunca
  lanza.
- `test/integracion/llm/techo-gasto.spec.ts` (Create) — gateway + repos en memoria/Postgres según
  nivel.

**Escenarios cubiertos** (título exacto):
- `LLM7 — Gasto bajo el techo permite la llamada con normalidad`
- `LLM7 — Techo desactivado en entorno de pruebas`
- `LLM8 — Cruce del 80 % emite aviso warn una vez por mes`
- `LLM9 — Gasto al 100 % no llama al LLM y devuelve techo-alcanzado`
- `LLM9 — Texto de derivación vive en el parámetro mensaje_techo_gasto`

**RED → GREEN → REFACTOR** (planificado):
1. RED: specs de techo (gasto bajo → llama y registra; `NODE_ENV=test` con gasto por encima → llama
   igual; cruce del 80 % → 1 `warn` + fila observable y las siguientes del mes no repiten, ni tras
   reinicio; gasto ≥ 100 % → cero llamadas al adaptador + `techo-alcanzado` + fila `pasarela`;
   actualización del parámetro → el lector devuelve el nuevo texto sin desplegar). Correr
   `npm test -- modulos/llm` y `npm run test:integracion -- techo-gasto` y observar fallo.
2. GREEN: implementar el chequeo previo, el aviso durable por mes y el lector del parámetro hasta
   que los cinco escenarios pasen.
3. REFACTOR: confirmar que un modelo sin precio en runtime registra costo 0 + `warn`
   `precio-desconocido` sin tumbar la respuesta (D6, nunca-perder); que ningún log de esta tarea
   contiene prompts, respuestas ni PII (anticipa LLM10 de T9).

**Hecho cuando**:
- Los cinco escenarios listados pasan con el título exacto como nombre del test.
- Al 100 % el adaptador registra cero intentos (contador del fake/simulador en 0).

**Comando de test**: `npm test -- modulos/llm` + `npm run test:integracion -- techo-gasto`

**Slice de PR**: S(d) parcial → PR5 (con T9)

**Review requerida**: RDD

---

## T9 — Módulo llm + redacción R14 + verificación 2 modelos + cierre documental

**Objetivo**: componer `LlmModule` (GATEWAY ← adaptador, repos, `CLOCK`, configuración; exporta
`LLM_PORT` + tipos; internos no exportados; **NO registrado en `AppModule` ni conectado a
`ProcesarTurno`** — el *binding* `GENERADOR_RESPUESTA → AgenteEco` queda intacto, CNV6), barril
`index.ts`, pruebas transversales: redacción (**R14**, LLM10: logger real espiado — ningún log del
gateway contiene prompts/respuestas/PII; fila `uso_llm` solo con conteos/modelo/costo/latencia),
verificación de salida de la fila 06 (**misma conversación contra 2 modelos cambiando solo
configuración**, LLM12 primario: dos perfiles que solo difieren en lista de modelos, cada corrida
usa su modelo visible en `uso_llm`, ambas devuelven el contrato `LlmPort`), `GENERADOR_RESPUESTA`
intacto, `npm run fronteras` + `contrato:deriva` verdes sin regenerar (sin endpoints), y cierre
documental (`docs/migracion/inventario.md` fila `llm/*` → migrada con notas de lo pospuesto a la
07; `docs/fases/README.md` fila 06 con la ruta del change, sin pasar a `cerrada` — eso lo hace
`sdd-archive`).

**Dependencias**: T1–T8 (todo lo anterior cableado por primera vez).

**Archivos** (`design.md`, tabla "File Changes", LLM10/LLM12):
- `src/modulos/llm/llm.module.ts` (Create) — composición, sin `AppModule`.
- `src/modulos/llm/index.ts` (Create) — barril: `LlmModule`, `LLM_PORT`, tipos del puerto.
- `test/integracion/llm/modulo-llm.spec.ts` (Create) — redacción contra logger real, 2 modelos,
  `GENERADOR_RESPUESTA` intacto (lee `src/modulos/conversaciones/**` (read-only) como referencia
  sin modificarlo).
- `docs/migracion/inventario.md` (Modify) — fila `llm/*` → **Migrado**, con lo pospuesto (motor,
  herramientas, prompts, historial, respaldos concretos → Fase 07; consumo del error → 07/08).
- `docs/fases/README.md` (Modify) — fila 06 con la ruta del change (no a `cerrada` todavía).
- `openapi/openapi*.json` — sin cambio (verificado, no editado a mano).

**Escenarios cubiertos** (título exacto):
- `LLM10 — Logs del gateway nunca contienen prompts, respuestas ni PII`
- `LLM10 — uso_llm guarda conteos y metadatos, nunca contenido`
- `LLM12 — Misma conversación contra 2 modelos cambiando solo configuración`

**RED → GREEN → REFACTOR** (planificado):
1. RED: spec del módulo (generación con prompt + PII sintética por dos perfiles distintos → los
   logs espiados contienen algún prompt/PII; la fila contiene algún texto; ambas corridas usan el
   mismo modelo). Correr `npm run test:integracion -- modulo-llm` y observar fallo.
2. GREEN: cablear el módulo, endurecer la redacción (el gateway nunca emite contenido; `redact` de
   plataforma queda como red de fondo, nunca el único mecanismo) y la selección por perfil hasta
   que los tres escenarios pasen.
3. REFACTOR: confirmar TSDoc solo en lo exportado (`LlmPort`, `LLM_PORT`, casos de uso) y nada en
   `dominio/`/`infraestructura/` (skill §11); redactar el cierre de inventario y fases; correr
   `npm run verify` completo del slice.

**Hecho cuando**:
- Los tres escenarios listados pasan con el título exacto, contra el simulador + Postgres reales.
- `LlmModule` no aparece en `src/app.module.ts` (búsqueda literal) y `AgenteEco` sigue ligado.
- `npm run verify` en verde; `contrato:deriva` verde sin regenerar.

**Comando de test**: `npm run test:integracion -- modulo-llm` + `npm run verify` (cierre del slice)

**Slice de PR**: S(d) parcial → PR5 (con T8)

**Review requerida**: RDD

---

## Review de la fase

Al completar T1–T9: correr `npm run verify` completo (prisma:generar → lint → typecheck →
fronteras → deriva del contrato → unitarios + integración; seis comprobaciones), confirmar que cada
uno de los 27 escenarios tiene su test nombrado `<id> — <título exacto>` y pasa, y luego la skill
`judgment-day` sobre el rango de commits `fase-06-pasarela-llm` (**obligatorio**, regla 6 de
`docs/fases/README.md`, con foco explícito en fuga de PII/contenido a logs o `uso_llm`, fila 5 de
Risks) **antes** de `sdd-verify`. E2E: ninguno en esta fase por diseño (módulo no cableado; el e2e
con LLM falso llega en la 07 — explícito, no olvidado). El veredicto y cualquier corrección
aplicada quedan documentados en `verify-report.md` al cerrar la fase (`sdd-verify → sdd-archive`),
no en este archivo.

## Preguntas abiertas no bloqueantes (no se inventan respuestas)

- Texto definitivo de `mensaje_techo_gasto` (negocio; el mecanismo T8 funciona con el default
  provisional de `design.md` D9: «Estamos con alta demanda en este momento. Te derivo con un asesor
  que te atiende enseguida.»).
- Modelos de respaldo concretos → los elige la Fase 07 con las evals (ADR-0002; ya decidido).
- Refrescar `LLM_PRECIOS_USD_JSON` contra las páginas de OpenRouter al implementar (T7 lo verifica
  en su commit con la fuente citada).
