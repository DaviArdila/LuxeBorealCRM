# Verify report: Fase 07b — Agente con LLM y las 7 herramientas

- Fecha: 2026-09-30 · Rama: `claude/loving-ramanujan-xipz09` (apilada sobre `fase-07b-p1-imagen`)
- Change: `openspec/changes/archive/2026-09-30-fase-07b-agente-llm-herramientas/`
- Commits de unidad de trabajo: T1 `9492c06`, `228c278`; T2 `01f32b7`; T3 `f3e6745`; T4 `f5cb925`;
  T5 `05223aa`; T6 `3797473`; T7 `8437d8f`; T8 `babc564`; T9 y cierre documental en este commit.

## Alcance verificado

Nueve tareas, las nueve `[x]` en `tasks.md`. El agente resuelve el turno con un LLM: bucle de
herramientas que no conoce nombres (A4), siete herramientas sobre los casos de uso existentes, historial
corto en Redis, prompt versionado con prefijo estable, salida de imagen por el outbox y cualquier
fallo del LLM convertido en un traspaso con texto de cortesía. Nunca se llamó a OpenRouter: todo con
`FakePuertoLlm` y dobles.

## Checks ejecutados (comandos reales)

Entorno de esta sesión: sin Docker, así que Testcontainers no arranca. Se usaron el Postgres 16 y el
Redis locales del contenedor mediante un `globalSetup` alterno **fuera del repo**; MinIO no está
disponible, por eso fallan (solo aquí) los tests que lo necesitan.

| Comando | Resultado |
|---|---|
| `npm run lint` · `npm run typecheck` · `npm run fronteras` · `npm run contrato:deriva` | Verde |
| `vitest --project unit` | 769 pasan; 7 fallan por necesitar Docker (gitleaks, oasdiff, actionlint): los mismos 7 que fallan en `main` sin cambios |
| `vitest --project integracion` (Postgres/Redis locales) | 222 pasan; 7 fallan por necesitar MinIO (`almacenamiento-minio` incl. MED10, `importar-catalogo-cli`) |
| `vitest --project e2e` (Postgres/Redis locales) | Verde: 5 archivos, 23 tests (7 nuevos en `agente-llm.e2e-spec.ts`) |
| Prueba sobre `dist/` (`prompts-build.spec.ts`) | Verde: `nest build` deja los `.md` y el cargador compilado los lee |

**Pendiente de confirmar en CI de GitHub** (`npm run ci`, con Testcontainers y MinIO reales): los 14
tests que dependen de Docker/MinIO y `test:cobertura` (umbral 80 %).

## Escenarios de spec — cobertura real

| Requisito | Escenarios | Dónde se prueba |
|---|---|---|
| MED10, CAN6 (imagen), CAN10, CNV10 | 6 | Unitarios, integración y `salida-imagen.e2e-spec.ts` (T1) |
| AGT4, AGT5, AGT6, LLM14, R1 «datos de un producto» | 11 | `bucle-herramientas.spec.ts`, `contenido-llm.spec.ts`, `llm-gateway.spec.ts`; AGT6 también en e2e |
| AGT7, R12 «Ubicación entrante» (parte determinista) | 4 | `contenido-llm.spec.ts`, `historial-redis.spec.ts` |
| CAT13, AGT8 (ficha) | 7 | `buscar.spec.ts`, `buscar-productos.spec.ts`, `obtener-ficha.spec.ts` |
| AGT8 (cotizar/política) | 2 | `cotizar-envio.spec.ts`, `consultar-politica.spec.ts` |
| CAT14, AGT9 | 6 | `obtener-fotos-producto.spec.ts`, `enviar-fotos.spec.ts`, integración de `listarFotos` |
| AGT10, AGT11, AGT12 | 8 | Herramientas, `armar-contexto-inicial.spec.ts`, integración del repositorio, e2e |
| AGT13 | 2 | `ensamblar-prompt.spec.ts` + prueba sobre `dist/` |
| R13 «Respuesta agrupada en el mínimo de mensajes» | 1 | e2e |

No se cierran aquí (van a evals en 07c, como dice `tasks.md`): R1 «Todo dato citado se rastrea…», las
políticas que cita el modelo, R2 (4) y R13 «Fotos agrupadas en collage por defecto».

## Desviaciones de `design.md` (detalle en `tasks.md` por tarea)

- `RegistroHerramientas` valida el total (7) desde T7; antes solo nombres únicos.
- `AgenteModule` importa `CatalogoModule` completo; `ImportarCatalogo` pasó a recibir `FUENTE_CATALOGO`
  como `@Optional()` y `ejecutar` falla con error claro si falta (solo el comando la provee).
- `RepositorioContactoAgente` expone `leerNombre` y `guardarDatosCapturados`; `leerResumen` y
  `establecerUltimoProducto` quedan para la 08.
- Un `timeout` de la pasarela con el plazo del turno agotado se reporta como `plazo-agotado`.
- El texto de `reglas.v1.md` se escribió desde la lista de la tarea: el `systemPrompt.ts` del prototipo
  no estaba disponible en el entorno.

## Pendientes abiertos

- `[manual]` de T1: confirmar contra el Chatwoot local si `content_attributes.luxe_clave` sobrevive en
  el multipart (la reconciliación ya cubre los dos resultados; decide solo si el respaldo por nombre
  queda como defensa).
- P27 y P31 siguen con el default aplicado a la espera de la decisión del usuario.
- Antes de exponer el bot: cargar `recargo_contraentrega_pct` y `mensaje_fuera_cobertura` reales
  (desviación de la Fase 02) y las políticas del negocio.

## Qué aprendimos que cambia las fases siguientes

1. Un e2e por webhook con `FakePuertoLlm` sobre `LLM_PORT` prueba el cableado real de `AgenteModule`
   con `CatalogoModule` y `LlmModule`; la 07c reutiliza ese patrón para las evals guionadas.
2. Las claves de idempotencia del consumidor (`mensaje:<id>:procesado`) no llevan prefijo por worker:
   con un Redis persistente los e2e con ids fijos se saltan mensajes. Con Testcontainers es invisible;
   fuera de ellos hay que vaciar Redis entre corridas.
3. Agregar una variable `AGENTE_*` obliga a tocar `scripts/generar-contrato.ts` además del bloque de
   configuración de prueba compartido.
