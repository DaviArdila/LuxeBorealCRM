# Design: Fase 07b — Agente con LLM y las 7 herramientas

- Change: `fase-07b-agente-llm-herramientas` · Fecha: 2026-09-29 · Estado: diseño propuesto
- Proposal: `proposal.md` · Análisis: `../fase-07a-turno-y-politicas/exploration.md`
- Specs: `agente` (AGT4-AGT13), `catalogo` (CAT13-CAT14), `medios` (MED10), `canales` (CAN6, CAN10),
  `conversaciones` (CNV10), `llm` (LLM14)
- ADRs: [0002](../../../docs/adr/0002-pasarela-llm.md), [0004](../../../docs/adr/0004-inbox-outbox.md),
  [0012](../../../docs/adr/0012-minio-almacenamiento-de-objetos.md),
  [0016](../../../docs/adr/0016-composicion-agente-conversaciones.md),
  [0017](../../../docs/adr/0017-historial-agente-redis-por-sesion.md) (**propuesta**, D3),
  [0018](../../../docs/adr/0018-presupuesto-de-tiempo-del-turno.md) (**propuesta**, D2)

## Technical Approach

`AgenteModule` reemplaza `ContenidoEcoProvisional` por `ContenidoLlm`, la última política del pipeline
de 07a. `ContenidoLlm` arma el contexto (D7), el prompt (D8) y el historial (D3), y delega en
`BucleHerramientas` (D1-D2), que solo conoce el registro de herramientas. Cada herramienta envuelve un
caso de uso de otro módulo y devuelve `{ paraElModelo, efectos }`. Al final del turno, los efectos se
traducen a pasos de imagen (D5) y la respuesta vuelve a `conversaciones` por el contrato de 07a.

## Architecture Decisions

### Decision D1: herramientas como registro; el bucle no conoce nombres (A4)

**Choice**: `Herramienta<A>` = `{ definicion: DefinicionHerramienta; ejecutar(args: A, ctx):
Promise<ResultadoHerramientaAgente> }`, con `ResultadoHerramientaAgente = { paraElModelo: unknown;
efectos: readonly EfectoTurno[] }`. Las 7 herramientas se proveen con un token multi-proveedor
`HERRAMIENTAS_AGENTE`. El bucle busca por nombre en un `Map` construido al arrancar; el arranque falla
si hay dos con el mismo nombre o si no son exactamente 7 (R1). `EfectoTurno` es una unión cerrada:
`enviar-imagen { claveObjeto, leyenda? }`, `sin-cobertura`, `datos-contacto-guardados`,
`lead-propuesto { temperatura }`. La validación de argumentos la hace el gateway (D13 de la Fase 06:
`llamadasInvalidas`); el bucle las devuelve al modelo como error y cuenta intentos (AGT4).

**Alternatives considered**: el `if (nombre === 'enviar_fotos')` del prototipo
(`bucleHerramientas.ts:106-128`, **A4**); estado mutable compartido `EstadoTurno` (**A4**).

**Rationale**: agregar una herramienta no toca el bucle; los efectos se prueban sin LLM.

### Decision D2: plazo del turno compartido y tope de vueltas (ADR-0018)

**Choice**: `plazoTurno = (LOCK_TURNO_TTL_S − 5) · 1000` desde `clock.ahora()` al empezar el turno;
`AGENTE_MAX_VUELTAS = 5`; cada `LLM_PORT.generar` recibe `plazoMs = restante`. El gateway usa
`min(presupuestoPropio, plazoMs)` (LLM14, cambio de ~15 líneas en `llm-gateway.ts:122-126`). Sin
texto final al agotar → handoff `plazo-agotado` + `mensaje_error_llm`. `LlmModule` exporta además
`ObtenerMensajeTechoGasto` (caso de uso sobre `REPOSITORIO_PARAMETRO_LLM.obtenerMensajeTechoGasto`,
ya implementado en la Fase 06). Errores: `techo-alcanzado` → `techo-gasto` + `mensaje_techo_gasto`;
cualquier otro `ErrorPasarelaLlm` → `fallo-llm` + `mensaje_error_llm`; cualquier otra excepción de una
herramienta → error de herramienta al modelo (nunca se propaga a `ProcesarTurno`).

**Alternatives considered**: ver ADR-0018 (subir el lock; heartbeat).

**Rationale**: el lock nunca vence durante un turno; los tiempos salen de la configuración existente.

### Decision D3: historial en Redis por sesión (ADR-0017)

**Choice**: puerto `HISTORIAL_CONVERSACION` con `leer(sesion, turnos)` y `agregar(sesion, textoCliente,
textoBot)`; adaptador Redis con lista `agente:<conversacionId>:v<version>:historial`, `LTRIM` a
`2 × AGENTE_HISTORIAL_TURNOS`, TTL `AGENTE_SESION_TTL_H`. El texto del cliente del turno es la unión
con espacios de los textos de la ráfaga; una ubicación sin texto se representa con el marcador
`[ubicación compartida]` (P27).

**Alternatives considered**: ver ADR-0017.

**Rationale**: sin llamada extra a Chatwoot; la sesión se reinicia sola tras un traspaso.

### Decision D4: búsqueda y fotos son casos de uso de catálogo

**Choice**: `BuscarProductos.ejecutar(texto)` (función pura `buscarEnResumen(productos, texto)` en
`catalogo/dominio/buscar.ts` sobre `ListarProductosActivos`, que ya usa la caché CAT4) y
`ObtenerFotosProducto.ejecutar(idOSku, maximo)` → `{ claveCollage: string | null;
clavesFotos: string[] }`, con un método nuevo `listarFotos(productoId)` en `RepositorioProducto`.

**Alternatives considered**: filtrar en el agente sobre `ListarProductosActivos` (la regla de búsqueda
quedaría fuera del módulo dueño del catálogo).

**Rationale**: `catalogo` sigue siendo la única fuente de datos de producto; el agente solo envuelve.

### Decision D5: imagen por outbox con clave de objeto; los bytes se leen al publicar

**Choice**: `MensajeSaliente = { tipo: 'texto'; texto } | { tipo: 'imagen'; claveObjeto; leyenda? }`.
`SalidaCanalOutbox` guarda la clave en `datos.claveObjeto` (no es dato personal) y la leyenda en
`efimero`. `PublicarEfectoCanal` lee los bytes con `ALMACENAMIENTO.leer` (MED10; `canales` importa el
barril de `medios`) y llama `AdaptadorCanal.enviarImagen(idConversacion, contenido, contentType,
leyenda, marca)`, que hace `POST` multipart con `attachments[]`, `content` = leyenda y
`content_attributes` = `{"luxe_clave": marca}`. El nombre del archivo es `<marca>.jpg` (respaldo de
reconciliación, CAN10). `ClienteChatwoot` gana `postMultipart` (mismo manejo de errores, cero
reintentos). `conversaciones` traduce `PasoRespuesta` imagen → `MensajeSaliente` imagen y omite la
imagen si `capacidades.admiteImagen` es falso (CNV10).

**Alternatives considered**: (a) URL firmada de MinIO en el mensaje (Chatwoot no adjunta desde URL);
(b) bytes en la fila de outbox (payload grande en Postgres, contra ADR-0012).

**Rationale**: el outbox sigue siendo el único mecanismo de reintento (ADR-0004); la fila es pequeña.
Verificación `[manual]` de `content_attributes` en multipart contra Chatwoot local (Risks).

**Desviaciones de implementación (T1, anotadas al construir):** (1) La regla de fronteras 13 solo
restringe *quién importa* `canales`; que `canales` importe el barril de `medios` está permitido y no
hay ciclo (`medios` no importa `canales`), así que no hizo falta un puerto intermedio. (2) Ningún canal
real declara hoy `admiteImagen: false` (`capacidadesTurno`: WhatsApp sí; los demás son permisivos), así
que el escenario CNV10 «canal que no admite imagen» se prueba por una costura protegida,
`EnviarRespuestaTurno.capacidades(canal)`, sobrescrita en el test; en producción delega en
`capacidadesTurno`. (3) `PasoRespuesta` pasó a ser la unión `PasoTexto | PasoImagen`; los consumidores
de `paso.texto` (`anteponerAviso`) ahora acotan por `tipo`. (4) La marca de reconciliación viaja en
`content_attributes.luxe_clave` **y** en el nombre del adjunto: la marca con todo carácter fuera de
`[A-Za-z0-9_-]` cambiado por `_` (los `:` no son seguros en un nombre de archivo) y la extensión del
tipo (`jpg` por defecto); `existeMensajeConMarca` busca en ambos sitios (el nombre se lee del último
segmento de `attachments[].data_url`, comparando el tramo anterior a la extensión). (5) La leyenda
es efímera (R14) y solo se persiste si existe; un objeto inexistente al publicar es fallo
`permanente` (`objeto-no-encontrado`) y cualquier otro fallo del almacenamiento es `transitorio`.
(6) `AlmacenamientoMinio.leer` traduce `NoSuchKey` a `ObjetoNoEncontrado` (exportado por el barril de
`medios`); los dobles `AlmacenamientoEnMemoria` de dos specs de `catalogo` ganaron `leer`, y hay un
doble compartido en `test/fakes/almacenamiento-en-memoria.ts`. (7) `[manual]` sigue **pendiente**:
ver T1 en `tasks.md`.

### Decision D6: contacto escrito ya; lead solo propuesto

**Choice**: puerto `REPOSITORIO_CONTACTO_AGENTE` (`agente/puertos/`) con `leerResumen(contactoId) →
{ nombre, ultimoProductoId }`, `guardarDatosCapturados(contactoId, datos)` y
`establecerUltimoProducto(contactoId, productoId)`; adaptador Prisma en `agente/infraestructura/prisma/`
(solo esos campos de `contacto`). Puerto `EVALUADOR_LEAD` con
`evaluar(propuesta, ctx) → { derivado: boolean; motivo?: string }`; la implementación de la 07,
`EvaluadorLeadSinEscala`, responde `derivado: false` con el motivo "las señales aún no confirman
intención de compra; sigue atendiendo" y no escribe nada. La 08 reemplaza el binding.

**Alternatives considered**: (a) la 07 también escribe `lead` (sin escala no hay `temperatura`
determinista ni `derivado` con su significado, `MODELO_DATOS.md` §5); (b) la 07 no escribe `contacto`
(el contexto inicial igual necesita leerlo, y la corrida manual no podría verificar la captura).

**Rationale**: lo barato y útil entra ya; lo que depende de la escala queda detrás de un puerto que la
08 completa sin cambiar la herramienta. Si la 08 crea el módulo `contactos`, el adaptador se mueve
allí sin cambiar el puerto.

### Decision D7: contexto inicial en la parte variable del prompt

**Choice**: `ArmarContextoInicial` (aplicación) devuelve instrucciones de texto: producto de entrada si
el primer turno de la conversación (`version === 0`, historial vacío) trae un SKU activo
(`/SKU-[A-Z0-9-]+/i` sobre el primer mensaje, `ObtenerFichaProducto` para validar), y el saludo por
nombre si `contacto.nombre` existe. Nunca incluye datos personales distintos del nombre.

### Decision D8: prompts como .md versionados, copiados al build

**Choice**: `src/modulos/agente/prompts/reglas.v1.md` (reglas R1/R2, cuándo citar políticas, respuestas
cortas, no procesar imágenes/audios, ubicación → pedir ciudad y departamento, `marcar_lead_caliente`
ante intención de compra) y `turno.v1.md` (plantilla de la parte variable). `CargadorPrompts`
(`infraestructura/`) los lee una vez en `onModuleInit` desde una ruta resuelta con
`import.meta.dirname`; `nest-cli.json` agrega `"assets": [{ "include": "modulos/agente/prompts/*.md",
"watchAssets": true }]`. `EnsamblarPrompt` (aplicación) concatena: reglas → catálogo compacto →
parte variable. La versión (`v1`) se loguea por turno. Las definiciones de herramientas viajan por el
parámetro `tools` del LLM, no en el texto.

**Alternatives considered**: plantillas en `.ts` (sin diff legible de prompt; skill §6 pide `.md`).

**Rationale**: prefijo estable para la caché (ADR-0002) y cambios de prompt revisables en un PR.

### Decision D9: auditoría de dinero sin rastro, solo observable

**Choice**: al terminar el turno, una función pura busca montos (`$` seguido de dígitos) en el texto
final que no aparezcan en ningún `paraElModelo` del mismo turno; si hay alguno, log `warn`
`agente.dinero-sin-rastro` con la cantidad de montos (sin texto, **R14**). No bloquea la respuesta.

**Alternatives considered**: bloquear y derivar (falsos positivos: el cliente puede citar su propio
presupuesto y el bot repetirlo).

**Rationale**: da una señal medible en la corrida real para R1 «Todo dato citado se rastrea…»; las
evals de 07c lo convierten en aserción.

### Decision D10: configuración nueva

| Variable | Default | Regla |
|---|---|---|
| `AGENTE_MAX_VUELTAS` | `5` | 1-8 |
| `AGENTE_HISTORIAL_TURNOS` | `6` | 0-20 (prototipo §7) |
| `AGENTE_FOTOS_INDIVIDUALES_MAX` | `4` | 1-10 (prototipo §6) |

`mensaje_error_llm` se agrega a `ClaveTextoAgente` (respaldo del prototipo, P31).

## Data Flow

```
MotorTurno (07a) … → ContenidoLlm
  sesion = (conversacionId, version); inicio = clock.ahora()
  historial ← HISTORIAL_CONVERSACION.leer(sesion, N)
  contexto ← ArmarContextoInicial(solicitud)          (SKU, nombre)
  prompt ← EnsamblarPrompt(reglas.v1 + catálogo compacto + turno.v1(contexto, horario))
  BucleHerramientas:
    repetir hasta texto final | vueltas = MAX | plazo agotado:
      LLM_PORT.generar({ perfil: 'conversacion', systemPrompt, mensajes, herramientas, plazoMs })
      por cada llamada válida → herramienta.ejecutar → { paraElModelo, efectos }
      llamadasInvalidas → error al modelo (2 en el turno → handoff)
  efectos → pasos imagen (después del texto); sin-cobertura → EvaluadorLead no se consulta
  HISTORIAL.agregar(sesion, textoCliente, textoFinal)
← RespuestaTurno { pasos: [texto, imagen…], handoff? }
conversaciones → EnviarRespuestaTurno (imagen → MensajeSaliente imagen) → outbox
Publicador → PublicarEfectoCanal → ALMACENAMIENTO.leer → Chatwoot multipart
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/modulos/medios/puertos/almacenamiento.ts`, `infraestructura/almacenamiento-minio.ts`, `index.ts` | Modify | MED10 `leer` + `ObjetoNoEncontrado` |
| `src/modulos/canales/puertos/{salida-canal,adaptador-canal}.ts` | Modify | Imagen (D5) |
| `src/modulos/canales/aplicacion/{salida-canal-outbox,publicar-efecto-canal}.ts` | Modify | Fila de imagen; lectura de bytes; reconciliación |
| `src/modulos/canales/infraestructura/chatwoot/{adaptador-canal-chatwoot,cliente-chatwoot}.ts` | Modify | Multipart |
| `src/modulos/canales/canales.module.ts` | Modify | Importa `MediosModule` |
| `src/modulos/conversaciones/puertos/salida-conversacion.ts`, `aplicacion/enviar-respuesta-turno.ts` | Modify | CNV10 |
| `src/modulos/llm/dominio/tipos-llm.ts`, `aplicacion/llm-gateway.ts` | Modify | LLM14 |
| `src/modulos/llm/aplicacion/obtener-mensaje-techo-gasto.ts`, `llm.module.ts`, `index.ts` | Create/Modify | Caso de uso exportado |
| `src/modulos/catalogo/dominio/buscar.ts`, `aplicacion/{buscar-productos,obtener-fotos-producto}.ts` | Create | CAT13, CAT14 |
| `src/modulos/catalogo/puertos/repositorio-producto.ts`, `infraestructura/repositorio-producto-prisma.ts`, `catalogo.module.ts`, `index.ts` | Modify | `listarFotos`; exports |
| `src/modulos/agente/dominio/{herramienta,efectos,auditar-dinero}.ts` | Create | D1, D9 |
| `src/modulos/agente/aplicacion/bucle-herramientas.ts` | Create | D1-D2 |
| `src/modulos/agente/aplicacion/politicas/contenido-llm.ts` | Create | Reemplaza al eco en el pipeline |
| `src/modulos/agente/aplicacion/herramientas/*.ts` (7) | Create | AGT8-AGT11 |
| `src/modulos/agente/aplicacion/{armar-contexto-inicial,ensamblar-prompt}.ts` | Create | D7, D8 |
| `src/modulos/agente/aplicacion/evaluador-lead-sin-escala.ts` | Create | D6 |
| `src/modulos/agente/puertos/{historial-conversacion,repositorio-contacto-agente,evaluador-lead}.ts` | Create | D3, D6 |
| `src/modulos/agente/infraestructura/redis/historial-redis.ts` | Create | D3 |
| `src/modulos/agente/infraestructura/prisma/repositorio-contacto-agente-prisma.ts` | Create | D6 |
| `src/modulos/agente/infraestructura/prompts/cargador-prompts.ts` | Create | D8 |
| `src/modulos/agente/prompts/{reglas.v1,turno.v1}.md` | Create | D8 |
| `src/modulos/agente/agente.module.ts` | Modify | Importa `LlmModule`, `CatalogoModule`; tokens nuevos |
| `nest-cli.json` | Modify | `assets` |
| `src/plataforma/config/esquema.ts`, `.env.example` | Modify | D10 |
| `test/fakes/{historial-en-memoria,repositorio-contacto-agente-en-memoria,almacenamiento-en-memoria}.ts` | Create | Dobles |
| `test/e2e/agente-llm.e2e-spec.ts` | Create | Flujo por webhook con `FakePuertoLlm` |

## Interfaces / Contracts

```typescript
// src/modulos/agente/dominio/efectos.ts
export type EfectoTurno =
  | { readonly tipo: 'enviar-imagen'; readonly claveObjeto: string; readonly leyenda?: string }
  | { readonly tipo: 'sin-cobertura' }
  | { readonly tipo: 'datos-contacto-guardados' }
  | { readonly tipo: 'lead-propuesto'; readonly temperatura: 'tibio' | 'caliente' };

// src/modulos/agente/dominio/herramienta.ts
export interface ContextoHerramienta {
  readonly sesion: ClaveSesion;
  readonly contactoId: string;
  readonly efectosPrevios: readonly EfectoTurno[]; // solo lectura (sin estado mutable, A4)
}
export interface ResultadoHerramientaAgente {
  readonly paraElModelo: unknown;
  readonly efectos: readonly EfectoTurno[];
}
export interface Herramienta {
  readonly definicion: DefinicionHerramienta; // tipo de `llm` (esquema + JSON Schema)
  ejecutar(argumentos: unknown, ctx: ContextoHerramienta): Promise<ResultadoHerramientaAgente>;
}
export const HERRAMIENTAS_AGENTE = Symbol('HERRAMIENTAS_AGENTE');

// src/modulos/agente/puertos/historial-conversacion.ts
export interface TurnoHistorial { readonly rol: 'usuario' | 'asistente'; readonly texto: string }
export const HISTORIAL_CONVERSACION = Symbol('HISTORIAL_CONVERSACION');
export interface HistorialConversacion {
  leer(sesion: ClaveSesion, turnos: number): Promise<readonly TurnoHistorial[]>;
  agregar(sesion: ClaveSesion, textoCliente: string, textoBot: string): Promise<void>;
}

// src/modulos/agente/puertos/repositorio-contacto-agente.ts
export interface DatosCapturados {
  readonly nombre: string; readonly telefonoAlterno: string | null;
  readonly direccion: string; readonly localidad: string;
}
export const REPOSITORIO_CONTACTO_AGENTE = Symbol('REPOSITORIO_CONTACTO_AGENTE');
export interface RepositorioContactoAgente {
  leerResumen(contactoId: string): Promise<{ nombre: string | null; ultimoProductoId: string | null }>;
  guardarDatosCapturados(contactoId: string, datos: DatosCapturados): Promise<void>;
  establecerUltimoProducto(contactoId: string, productoId: string): Promise<void>;
}

// src/modulos/agente/puertos/evaluador-lead.ts
export interface PropuestaLead {
  readonly temperatura: 'tibio' | 'caliente'; readonly senales: readonly string[];
  readonly resumen: string; readonly productoId: string | null;
}
export const EVALUADOR_LEAD = Symbol('EVALUADOR_LEAD');
export interface EvaluadorLead {
  evaluar(propuesta: PropuestaLead, ctx: ContextoHerramienta): Promise<{ derivado: boolean; motivo?: string }>;
}

// src/modulos/canales/puertos/salida-canal.ts
export type MensajeSaliente =
  | { readonly tipo: 'texto'; readonly texto: string }
  | { readonly tipo: 'imagen'; readonly claveObjeto: string; readonly leyenda?: string };

// src/modulos/medios/puertos/almacenamiento.ts (se agrega)
leer(clave: string): Promise<{ contenido: Buffer; contentType: string }>;

// src/modulos/llm/dominio/tipos-llm.ts (se agrega a SolicitudGeneracion)
readonly plazoMs?: number;

// src/modulos/catalogo
BuscarProductos.ejecutar(texto: string): Promise<readonly ProductoResumen[]>;
ObtenerFotosProducto.ejecutar(idOSku: string, maximo: number):
  Promise<{ claveCollage: string | null; clavesFotos: readonly string[] }>;
```

Contratos con el modelo (nombres y argumentos iguales al prototipo, SPEC del prototipo §3.1; la
respuesta de `obtener_ficha` ya no trae `recargo_contraentrega_texto`, CAT2):

| Herramienta | Argumentos | `paraElModelo` |
|---|---|---|
| `buscar_producto` | `{ query }` | `[{ id, sku, nombre, descripcion_corta }]` (≤ 5) |
| `obtener_ficha` | `{ id_producto }` | `{ id, sku, nombre, descripcion_larga, precio_texto, tiene_fotos }` o `{ error }` |
| `cotizar_envio` | `{ id_producto, departamento, ciudad? }` | `{ cobertura: true, rango_texto, dias_texto, contraentrega_disponible, politica_contraentrega_texto? }` o `{ cobertura: false, mensaje_sin_cobertura }` |
| `consultar_politica` | `{ tema }` | `{ encontrada: true, texto }` o `{ encontrada: false, temas_disponibles }` |
| `enviar_fotos` | `{ id_producto, modo: 'collage' \| 'individuales' }` | `{ enviadas, error? }` |
| `guardar_datos_contacto` | `{ nombre_completo, telefono_contacto, direccion, localidad }` | `{ guardado: true }` |
| `marcar_lead_caliente` | `{ temperatura, senales, resumen, id_producto \| null }` | `{ derivado, motivo? }` |

## Módulos y fronteras

| Módulo | Importa (barril) | Nunca importa |
|---|---|---|
| `agente` | `conversaciones`, `llm`, `catalogo`, `horario` | `canales` (regla 13), `medios` (no lo necesita: solo pasa claves) |
| `canales` | `medios` | `conversaciones`, `agente` |
| `catalogo` | `compartido/texto` | `agente` |

Sin eventos de dominio nuevos. Sin endpoints nuevos. Sin esquema nuevo (`contacto` ya tiene
`nombre`, `telefono_alterno`, `direccion`, `localidad`, `ultimo_producto_id`).

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `buscarEnResumen`, `auditarDinero`, bucle (encadenado, efectos, desconocida, inválidas, vueltas, plazo, errores), cada herramienta, ensamblado del prompt | `FakePuertoLlm`, `ClockFalso`, dobles en `test/fakes/` |
| Unit | Gateway con `plazoMs` (LLM14) | `FakeAdaptadorLlm` existente |
| Integration | `ObtenerFotosProducto` y `listarFotos`; `RepositorioContactoAgentePrisma`; `HistorialRedis` (TTL, recorte); `Almacenamiento.leer` contra MinIO; adaptador multipart contra `chatwoot-falso` | Testcontainers |
| Integration | `CargadorPrompts` lee los `.md` desde `dist/` tras `nest build` | Test que corre sobre la salida compilada |
| E2E | Webhook → ficha, cotización con política, collage como imagen, datos guardados, fallo/techo del LLM | `test/e2e/agente-llm.e2e-spec.ts` con `FakePuertoLlm` sobrescribiendo `LLM_PORT` |
| `[manual]` | Multipart con `content_attributes` contra Chatwoot local real | T1 |

## Threat Matrix

| Amenaza | Aplica | Control |
|---|---|---|
| Datos del contacto (nombre, teléfono, dirección) en logs | Sí | AGT10 tercer escenario con el logger real |
| Prompt injection que intenta sacar datos fuera de las herramientas | Sí | El modelo solo tiene 7 herramientas de lectura acotada y escrituras sobre su propio contacto; ninguna herramienta acepta ids de otra conversación (el contacto sale del contexto, nunca de los argumentos) |
| Clave de objeto manipulada por el modelo para enviar un archivo arbitrario | Sí | `enviar_fotos` recibe `id_producto`, nunca una clave; las claves salen de `ObtenerFotosProducto` |
| Shell, subprocesos, VCS | No | — |

## Migration / Rollout

Sin esquema. Revertir la cadena o volver a componer `ContenidoEcoProvisional`. Review: **RDD** por
commit. `judgment-day` no es obligatorio; se **recomienda** opcionalmente sobre PR2-PR5 por el peso de
R1/R2 (decisión del usuario).

## Open Questions

- [ ] P27 ubicación (marcador y regla del prompt según la recomendación).
- [ ] P31 `mensaje_error_llm` (default del prototipo).
