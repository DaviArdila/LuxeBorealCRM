# Tasks: Fase 07b — Agente con LLM y las 7 herramientas

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio
(regla 6: solo 04/05/06/10); se recomienda opcionalmente por el peso de R1/R2 — lo decide el usuario.

TDD estricto: RED observado → GREEN → REFACTOR. Runner **Vitest**: `npm test`,
`npm run test:integracion`, `npm run test:e2e`; `npm run verify` al cerrar cada slice. Tareas con
R1/R2/R5/R14 llevan transcripción completa del RED. Nunca se llama a OpenRouter real: `FakePuertoLlm`
(`test/fakes/puerto-llm-falso.ts`) o el simulador (`test/soporte/simulador-openrouter.ts`).

Rama: `fase-07b-agente-llm-herramientas` (desde `main` con 07a fusionada).

**Resultado: 9 tareas, dentro del límite de 10.**

## Checklist

- [x] T1 — Salida de imagen de extremo a extremo (medios → outbox → Chatwoot multipart) `[manual]` parcial
- [x] T2 — Bucle de herramientas + LlmModule cableado + plazo del turno + errores → handoff
- [x] T3 — Historial corto por sesión en Redis + ubicación como marcador
- [x] T4 — BuscarProductos en catálogo + herramientas buscar_producto y obtener_ficha
- [ ] T5 — Herramientas cotizar_envio y consultar_politica
- [x] T6 — ObtenerFotosProducto en catálogo + herramienta enviar_fotos
- [ ] T7 — guardar_datos_contacto, marcar_lead_caliente (evaluador sin escala) y contexto inicial
- [ ] T8 — Prompt versionado con prefijo estable + assets en el build
- [ ] T9 — E2E con LLM falso + cierre documental

## Mapeo de escenarios por tarea (47)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | MED10 (2); CAN6 «Enviar una imagen sube el adjunto multipart con su leyenda»; CAN10 (1); CNV10 (2) | 6 |
| T2 | AGT4 (4); AGT5 (2); AGT6 (2); LLM14 (2); R1 «El LLM necesita datos de un producto» | 11 |
| T3 | AGT7 (3); R12 «Ubicación entrante» (parte determinista: el LLM recibe `[ubicación compartida]`) | 4 |
| T4 | CAT13 (5); AGT8 «obtener_ficha devuelve el precio ya formateado», «obtener_ficha de un producto inactivo devuelve un error explícito» | 7 |
| T5 | AGT8 «cotizar_envio sin cobertura deja el efecto sin-cobertura», «consultar_politica devuelve el texto literal» | 2 |
| T6 | CAT14 (3); AGT9 (3) | 6 |
| T7 | AGT10 (3); AGT11 (2); AGT12 (3) | 8 |
| T8 | AGT13 (2) | 2 |
| T9 | R13 «Respuesta agrupada en el mínimo de mensajes» (e2e) | 1 |

Escenarios que **no** se cierran aquí sino con evals en 07c (dependen de lo que dice el modelo): R1
«Todo dato citado se rastrea…», «El cliente pregunta por una política…», «Una política que no existe
no se inventa»; R2 (4); R13 «Fotos agrupadas en collage por defecto»; la parte "el bot pide la ciudad"
de R12 «Ubicación entrante».

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2.750 de autoría |
| 400-line budget risk | High: PR1, PR2 y PR3 lo superan por naturaleza (fila de Risks de `proposal.md`) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 → PR6 → PR7 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

| PR | Tareas | Estimado | Excepción anticipada | Comando enfocado | Rollback |
|---|---|---|---|---|---|
| PR1 | T1 | ~450 | Sí | `npm test -- canales medios conversaciones` + `npm run test:integracion -- medios canales` | Revertir imagen en `canales`/`medios`/`conversaciones` |
| PR2 | T2 | ~520 | Sí | `npm test -- modulos/agente modulos/llm` | Volver a componer `ContenidoEcoProvisional` |
| PR3 | T3+T4 | ~480 | Sí | `npm test -- agente catalogo` + `npm run test:integracion -- agente` | Revertir historial y búsqueda |
| PR4 | T5+T6 | ~420 | No — preguntar si excede | `npm test -- agente catalogo` + `npm run test:integracion -- catalogo` | Revertir las 3 herramientas |
| PR5 | T7 | ~380 | No | `npm test -- modulos/agente` + `npm run test:integracion -- agente` | Revertir contacto/lead/contexto |
| PR6 | T8 | ~250 | No | `npm test -- modulos/agente` + prueba sobre `dist/` | Revertir prompts y `nest-cli.json` |
| PR7 | T9 | ~250 | No (parte documental sin riesgo) | `npm run test:e2e` + `npm run verify` | Revertir e2e y docs |

---

## T1 — Salida de imagen de extremo a extremo

**Objetivo**: D5. `Almacenamiento.leer` (MED10); `MensajeSaliente` imagen; fila de outbox con
`datos.claveObjeto`; `PublicarEfectoCanal` lee bytes y llama `enviarImagen`; `ClienteChatwoot.postMultipart`;
reconciliación por marca (CAN10); `conversaciones` traduce el paso imagen y respeta `admiteImagen`.

**`[manual]` al empezar (bloquea solo la forma de la reconciliación)**: con el Chatwoot local
(`infra/chatwoot`, lo levanta el usuario), enviar un multipart con `content_attributes` y comprobar
con `GET .../messages` si vuelve `luxe_clave`. Resultado anotado en esta tarea. Si no vuelve, la
reconciliación usa el nombre del archivo (`<marca>.jpg`).

**RED → GREEN → REFACTOR**:
1. RED: «CAN6 — Enviar una imagen sube el adjunto multipart con su leyenda» contra `chatwoot-falso`
   (se extiende para aceptar multipart); falla porque no existe `enviarImagen`.
2. GREEN: MED10, outbox, adaptador, cliente, CNV10.
3. REFACTOR: «CAN10 — Un reintento de una imagen ya creada no la envía otra vez» (integración).

**Hecho cuando**: 6 escenarios en verde; resultado `[manual]` anotado.

**Estado (cerrada, con `[manual]` PENDIENTE)**: los 6 escenarios están en verde, más un e2e por webhook
(`test/e2e/salida-imagen.e2e-spec.ts`) del camino generador → outbox → publicador → `ChatwootFalso`.
La verificación contra un Chatwoot real **no se hizo y no se da por hecha**: el usuario debe correrla.
La reconciliación ya cubre ambos resultados posibles (busca la marca en `content_attributes.luxe_clave`
y en el nombre del adjunto `<marca>.jpg`), así que el resultado solo decide si el respaldo por nombre es
necesario.

Cómo correrla (Chatwoot local de `infra/chatwoot`, una conversación abierta `<ID>` de un inbox API):

1. Subir un multipart con marca en atributos y en el nombre:
   `curl -X POST -H "api_access_token: <TOKEN>" -F "message_type=outgoing" -F "content=prueba"
   -F 'content_attributes={"luxe_clave":"prueba-1"}' -F "attachments[]=@collage.jpg;filename=prueba_1.jpg"
   <CHATWOOT_URL>/api/v1/accounts/<CUENTA>/conversations/<ID>/messages`.
2. Leer `GET .../conversations/<ID>/messages` y mirar el mensaje nuevo: ¿trae
   `content_attributes.luxe_clave == "prueba-1"`? ¿`attachments[0].data_url` termina en `prueba_1.jpg`?
3. Anotar aquí el resultado. Si vuelve el atributo, el respaldo por nombre queda como defensa; si no
   vuelve, la marca por nombre es la única reconciliación y CAN10 depende de que `data_url` conserve el
   nombre (si tampoco lo conserva, hay que abrir una decisión antes de la corrida real de la 07b).

**Review requerida**: RDD

## T2 — Bucle de herramientas + LlmModule cableado + plazo del turno + errores

**Objetivo**: D1, D2, D10. `BucleHerramientas`, registro `HERRAMIENTAS_AGENTE` (arranque falla si no
son 7 nombres únicos — en esta tarea con 7 herramientas dobles de test y las reales se enchufan en
T4-T7), `ContenidoLlm` en el pipeline, `LlmModule` importado por `AgenteModule`,
`ObtenerMensajeTechoGasto`, `plazoMs` en el gateway (LLM14).

**RED → GREEN → REFACTOR**:
1. RED: «AGT6 — El techo de gasto deriva con su propio texto» y «LLM14 — Un plazo agotado no llama al
   proveedor» (transcripción completa).
2. GREEN: bucle, errores, plazo, cableado.
3. REFACTOR: el bucle no contiene ningún literal de nombre de herramienta (test que busca en el
   archivo, patrón de las reglas de fronteras).

**Hecho cuando**: 11 escenarios en verde; `AppModule` arranca con `LlmModule` y el simulador.

**Estado (cerrada)**: los 11 escenarios están en verde (`bucle-herramientas.spec.ts`,
`contenido-llm.spec.ts`, `llm-gateway.spec.ts`) y los e2e de la 07a se reescribieron con `FakePuertoLlm`
sobre `LLM_PORT`. Desviaciones anotadas: (1) `RegistroHerramientas` valida nombres únicos siempre y el
total esperado (7) solo si se le pasa; el módulo no lo pasa hasta T7, cuando existen las siete (si no,
el arranque fallaría durante T2-T6). (2) `EnsamblarPrompt` es provisional hasta T8. (3) El contexto
inicial y el historial entran en T3 y T7; hoy el mensaje al LLM es solo el texto del turno (con el
marcador de ubicación, P27). (4) `ContenidoEcoProvisional` se eliminó; `test/fakes/politica-eco.ts` lo
reemplaza en los tests de `MotorTurno`. (5) Un `timeout` de la pasarela con el plazo del turno
agotado se reporta como `plazo-agotado`. (6) Las tres variables `AGENTE_*` de D10 entran aquí (T2)
porque el bucle usa `AGENTE_MAX_VUELTAS`.

**Review requerida**: RDD

## T3 — Historial corto por sesión en Redis + ubicación como marcador

**Objetivo**: D3, ADR-0017. `HISTORIAL_CONVERSACION`, adaptador Redis con recorte y TTL; `ContenidoLlm`
lo lee y lo agrega solo con texto final; la ubicación sin texto viaja como `[ubicación compartida]`.

**RED → GREEN → REFACTOR**: RED con «AGT7 — Una sesión nueva arranca sin historial»; GREEN; REFACTOR
con integración Redis (TTL y `LTRIM`).

**Hecho cuando**: 4 escenarios en verde.

**Estado (cerrada)**: AGT7 (3) y R12 «Ubicación entrante» (parte determinista) en verde en
`contenido-llm.spec.ts`; `historial-redis.spec.ts` (integración) prueba recorte, TTL, sesiones por
versión, `AGENTE_HISTORIAL_TURNOS = 0` y entradas ilegibles. El marcador de ubicación vive en
`dominio/texto-del-cliente.ts` (desde T2).

**Review requerida**: RDD

## T4 — BuscarProductos en catálogo + buscar_producto y obtener_ficha

**Objetivo**: D4 (búsqueda) y los dos envoltorios. Portar la lógica de
`../ChatLuxeCRM/src/tools/buscarProducto.ts` como función pura `buscarEnResumen`.

**RED → GREEN → REFACTOR**: RED con «CAT13 — La búsqueda ignora tildes y mayúsculas»; GREEN; REFACTOR
reutilizando `normalizarTexto`/`palabrasClave` sin duplicarlas.

**Hecho cuando**: 7 escenarios en verde (R2 con transcripción completa en la ficha).

**Estado (cerrada)**: CAT13 (5) y AGT8 (2, ficha) en verde: `buscar.spec.ts`, `buscar-productos.spec.ts`,
`buscar-producto.spec.ts`, `obtener-ficha.spec.ts`. Desviación: `AgenteModule` ahora importa
`CatalogoModule` completo, y `ImportarCatalogo` exigía `FUENTE_CATALOGO`, que solo provee el comando
`catalogo:importar`; se volvió `@Optional()` y `ejecutar` falla con un error claro si falta (test
nuevo), sin cambiar el comportamiento del comando. Las herramientas se construyen con la fábrica
`definirHerramienta` (esquema Zod → definición + JSON Schema desde un solo lugar).

**Review requerida**: RDD

## T5 — cotizar_envio y consultar_politica

**Objetivo**: envoltorios sobre `CotizarEnvio` y `ConsultarPolitica`; efecto `sin-cobertura`.

**RED → GREEN → REFACTOR**: RED con «AGT8 — cotizar_envio sin cobertura deja el efecto sin-cobertura»;
GREEN; REFACTOR: el mapeo a snake_case del contrato con el modelo vive en un solo archivo.

**Hecho cuando**: 2 escenarios en verde.

**Estado (cerrada)**: AGT8 `cotizar_envio` sin cobertura y `consultar_politica` literal en verde; el mapeo a snake_case vive solo en `herramientas/contrato-modelo.ts`.

**Review requerida**: RDD

## T6 — ObtenerFotosProducto + enviar_fotos

**Objetivo**: D4 (fotos) y AGT9; `listarFotos` en el repositorio; tope por sesión con un contador en
`CONTADORES_SESION` (07a).

**RED → GREEN → REFACTOR**: RED con «AGT9 — Las fotos individuales respetan el tope de la sesión»;
GREEN; REFACTOR: integración de `listarFotos` (portada primero) contra Postgres.

**Hecho cuando**: 6 escenarios en verde.

**Estado (cerrada)**: CAT14 (3) y AGT9 (3) en verde (`obtener-fotos-producto.spec.ts`,
`enviar-fotos.spec.ts`) más integración de `listarFotos` (portada primero) y del contador de fotos
individuales en Redis. `FotosProducto` es un tipo nuevo del dominio de catálogo; `RepositorioProducto`
ganó `listarFotos` y `ContadoresSesion` ganó `fotosIndividuales`/`sumarFotosIndividuales` (clave
`agente:<conv>:v<n>:fotos`, mismo TTL). Un collage inexistente en modo `collage` devuelve un error
explícito que sugiere `individuales`.

**Review requerida**: RDD

## T7 — guardar_datos_contacto, marcar_lead_caliente y contexto inicial

**Objetivo**: D6, D7. `REPOSITORIO_CONTACTO_AGENTE` (Prisma), `EVALUADOR_LEAD` +
`EvaluadorLeadSinEscala`, `ArmarContextoInicial`.

**RED → GREEN → REFACTOR**: RED con «AGT10 — Los datos del contacto no aparecen en los logs» (logger
real, transcripción completa); GREEN; REFACTOR: integración del repositorio contra Postgres.

**Hecho cuando**: 8 escenarios en verde; ninguna fila en `lead` tras los tests.

**Review requerida**: RDD

## T8 — Prompt versionado con prefijo estable + assets en el build

**Objetivo**: D8. `reglas.v1.md`, `turno.v1.md`, `CargadorPrompts`, `EnsamblarPrompt`, `nest-cli.json`.
El texto de las reglas incluye: citar solo datos de herramientas del mismo turno, rango de envío
aproximado, recargo sin porcentaje, cuándo citar políticas (solo al preguntar por envío o pago, o al
confirmar el pedido, una vez), sin política → ofrecer asesor, ubicación → pedir ciudad y departamento,
respuestas cortas, collage por defecto.

**RED → GREEN → REFACTOR**: RED con «AGT13 — Dos conversaciones distintas comparten el mismo prefijo»;
GREEN; REFACTOR: prueba que `npm run build` deja los `.md` en `dist/` y el cargador los encuentra.

**Hecho cuando**: 2 escenarios en verde; arranque desde `dist/` probado.

**Review requerida**: RDD

## T9 — E2E con LLM falso + cierre documental

**Objetivo**: `test/e2e/agente-llm.e2e-spec.ts` (webhook firmado → `FakePuertoLlm` programado →
Chatwoot falso): ficha en un mensaje, cotización con política, collage como imagen multipart, datos
guardados, `proveedor-caido` → handoff con `mensaje_error_llm`. Docs: `docs/migracion/inventario.md`
(filas `tools/*`, `motor/*`, `estado/historial.ts`, `motor/systemPrompt.ts`), `docs/fases/README.md`,
`CLAUDE.md` si cambió algún comando.

**RED → GREEN → REFACTOR**: RED con «R13 — Respuesta agrupada en el mínimo de mensajes» en e2e;
GREEN (cableado); REFACTOR: `npm run verify` + `npm run test:e2e` completos.

**Hecho cuando**: checklist §12 de `luxeboreal-arquitectura` completo para 07b.

**Review requerida**: RDD

## Tareas `[manual]`

| Tarea | Qué hace el usuario | Por qué no se automatiza |
|---|---|---|
| T1 | Levantar el Chatwoot local y confirmar si `content_attributes` sobrevive en multipart | Requiere la instancia real y su token (nunca en el repo) |
