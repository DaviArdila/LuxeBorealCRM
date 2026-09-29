# Design: Fase 07a — Contrato del turno y políticas deterministas

- Change: `fase-07a-turno-y-politicas` · Fecha: 2026-09-29 · Estado: diseño propuesto
- Proposal: `proposal.md` · Análisis de la fase: `exploration.md`
- Specs: `specs/conversaciones/spec.md` (CNV6, R13, CNV7-CNV9), `specs/agente/spec.md` (R12,
  AGT1-AGT3), `specs/canales/spec.md` (CAN9)
- ADRs: [0003](../../../docs/adr/0003-postgres-fuente-de-verdad.md),
  [0004](../../../docs/adr/0004-inbox-outbox.md), [0005](../../../docs/adr/0005-chatwoot-plataforma-de-canales.md),
  [0016](../../../docs/adr/0016-composicion-agente-conversaciones.md) (**propuesta**, D4)

## Technical Approach

`conversaciones` sigue siendo el dueño del turno: debounce, lock, lectura del buffer, punto único de
salida y máquina de estados. Lo que cambia es la **forma** de lo que entrega y recibe del generador
(D1-D2) y dos garantías que faltaban: el espejo del estado en Chatwoot (D3) y la relectura por paso
(D7). El módulo nuevo `agente` implementa el puerto con un pipeline de políticas (D6) y se compone
desde `AppModule` sin que `conversaciones` lo importe (D4, ADR-0016). Sin esquema ni endpoints.

## Architecture Decisions

### Decision D1: contrato ampliado del generador, tipos en conversaciones

**Choice**: el puerto recibe `SolicitudTurno { contexto, mensajes }` y devuelve
`RespuestaTurno { pasos, handoff? }` (firmas en §Interfaces). Los tipos viven en
`conversaciones/puertos/generador-respuesta.ts` y salen del barril.

**Alternatives considered**: (a) tipos en un paquete compartido de `compartido/` (prohibido: regla 2,
`compartido-puro`, no admite tipos de negocio); (b) tipos en `agente` (invierte el puerto: el
consumidor define lo que necesita, no el proveedor).

**Rationale**: el dueño del puerto es quien lo consume (`ProcesarTurno`); así `conversaciones` no
depende de nadie nuevo y el agente es un adaptador intercambiable (**A5**, **A9**).

### Decision D2: el tipo de contenido viaja en el buffer; el texto solo se lee si es texto

**Choice**: `MensajeTurno` gana `tipoContenido` (mismo dominio que `TipoContenido` de `canales`, copiado
como tipo propio en `conversaciones` para no filtrar el tipo de `canales` al agente). El consumidor
solo llama a `LECTOR_MENSAJE_CANAL.obtenerTexto` cuando el tipo es `texto`. Los mensajes viejos del
buffer sin `tipoContenido` (Redis durante un despliegue) se leen como `texto`.

**Alternatives considered**: leer siempre el texto (una llamada HTTP inútil por audio o sticker).

**Rationale**: menos llamadas a Chatwoot y el contrato dice la verdad (CNV7). La compatibilidad hacia
atrás del buffer evita perder la ráfaga en curso durante un despliegue (criterio nunca-perder de la
Fase 05).

### Decision D3: conversaciones ejecuta el handoff y espeja cada transición en el canal

**Choice**: (1) `ProcesarTurno`, tras `EnviarRespuestaTurno.enviar`, si hay `handoff`, relee la
conversación y llama `TransicionarConversacion.ejecutar(conv, 'handoff_pendiente', origen)` con
`origen = motivo === 'lead-caliente' ? 'lead_caliente' : 'regla_handoff_explicita'`, luego vacía el
buffer y sale del bucle de drenado. (2) `TransicionarConversacion`, después de persistir, encola el
espejo con `SALIDA_CANAL.cambiarEstado` según la tabla; `idOperacion = espejo:v<versionNueva>`.

| Destino | Origen | Espejo |
|---|---|---|
| `handoff_pendiente`, `humano` | cualquiera | `abierta` |
| `bot` | `ttl`, `admin` | `pendiente` |
| `bot` | `chatwoot_pending`, `chatwoot_resolved` | ninguno |
| `pausado` | `admin` | ninguno (igual que el prototipo) |

La tabla es una función pura en `conversaciones/dominio/espejo-estado-canal.ts`.

**Alternatives considered**: (a) que el agente transicione (viola **R6** y crea un ciclo); (b) espejar
por evento de dominio con un suscriptor en `canales` (el outbox ya es el mecanismo de efecto
externo; un evento sin reintento podría perderse); (c) transicionar **antes** de enviar (el punto único
de salida exige `bot` y bloquearía el propio mensaje de handoff).

**Rationale**: mismo orden que el prototipo (`chatWorker.ts:45-49`). Desviación consciente de
ADR-0004: el espejo se encola **después** de la transición, no en la misma transacción, porque
`RegistroOutbox.agregar` no acepta un cliente transaccional; la ventana de pérdida es una caída entre
dos escrituras seguidas y la clave por versión hace idempotente cualquier reintento. Queda en Risks.

### Decision D4: agente → conversaciones; AppModule compone con un módulo dinámico (ADR-0016)

**Choice**: `ConversacionesModule.conGenerador(moduloGenerador)` devuelve un `DynamicModule` que
importa ese módulo y **no** registra `AgenteEco`; el `ConversacionesModule` estático conserva
`AgenteEco` para los tests del propio módulo. `AgenteModule` provee y exporta `GENERADOR_RESPUESTA`
(token importado del barril de `conversaciones`). `AppModule` importa
`ConversacionesModule.conGenerador(AgenteModule)`. Regla de fronteras 15
`conversaciones-no-conoce-agente`: nada bajo `src/modulos/conversaciones/` importa
`src/modulos/agente/`.

**Alternatives considered**: (a) registro en `onModuleInit` (patrón de `RegistroConsumidorEventosCanal`):
sirve para eventos, pero para una petición/respuesta obliga a un generador "por defecto" en caliente y
a un orden de arranque implícito; (b) `conversaciones` importa `AgenteModule`: `conversaciones` pasaría
a depender del agente, y el agente, del catálogo y del LLM.

**Rationale**: el puerto queda en su dueño, la dependencia va en un solo sentido y se verifica con una
regla; la composición es explícita en un único lugar. Decisión con consecuencia duradera → ADR-0016.

### Decision D5: capacidades del turno calculadas en conversaciones desde el perfil del canal

**Choice**: `canales` exporta `perfilDeCapacidades` y `PerfilCapacidades` en su barril (solo lo
importa `conversaciones`, regla 13). `conversaciones/aplicacion/capacidades-turno.ts` lo traduce a
`CapacidadesSalida { mensajeSalienteCuesta: boolean; admiteImagen: boolean }`. Perfil no soportado →
`{ mensajeSalienteCuesta: true, admiteImagen: true }` (conservador en costo, útil para el inbox local
de pruebas `otro`).

**Alternatives considered**: pasar el `PerfilCapacidades` completo al agente (arrastra tipos de
`canales` y campos que el agente no usa).

**Rationale**: principio 7 de `SPEC.md` (el agente no pregunta por el canal) sin romper la regla 13
(I10, I11 de `exploration.md`).

### Decision D6: pipeline de políticas en el agente; R12 decidido en el turno

**Choice**: `MotorTurno implements GeneradorRespuesta` recorre `PoliticaTurno[]` en orden
(`PoliticaNoTextuales` → `PoliticaTopeTurnos` → `PoliticaContenido`). Cada política devuelve
`{ decision: 'responder', respuesta, cuentaTurno }` o `{ decision: 'seguir' }`. Después, `MotorTurno`
aplica el aviso de datos (D8) y registra el turno si `cuentaTurno`. En 07a `PoliticaContenido` es
`ContenidoEcoProvisional` (último texto de la ráfaga; sin texto → sin pasos). Reglas de R12:

| Ráfaga | Resultado |
|---|---|
| Algún mensaje `texto` | Seguir (y reiniciar el contador de audios) |
| Último `audio`, contador de audios de la sesión pasa a 1 | Responder `mensaje_pedir_texto_audio` |
| Último `audio`, contador llega a 2 | Responder `mensaje_handoff`/`_fuera_horario` + `handoff: audio-repetido` |
| Último `imagen` | Responder `mensaje_imagen_no_procesada` |
| Último `ubicacion` | Seguir (07b la presenta al LLM, P27) |
| Último `sticker`, `documento`, `otro` | Responder sin pasos, `cuentaTurno: false` |

**Alternatives considered**: decidir R12 en el consumidor, antes del buffer (dos respuestas por ráfaga,
fuera del lock, y `conversaciones` tendría textos del agente); un `if` por tipo dentro de un
orquestador único (**A5**).

**Rationale**: una respuesta por ráfaga (**R13**), bajo el lock (**R8**) y por el punto único de
salida (**R5**); cada política se prueba sola.

### Decision D7: relectura por paso con una guardia que conversaciones registra en canales

**Choice**: `SolicitudEnvioMensajes` gana `requiereEstado?: string` (opaco para `canales`); la fila de
outbox lo guarda en `datos.requiereEstado`. `canales` define el puerto
`GuardiaEnvioCanal.puedeEnviar(idConversacion, requiereEstado): Promise<boolean>` y un
`RegistroGuardiaEnvioCanal` (mismo patrón que `RegistroConsumidorEventosCanal`).
`conversaciones` registra `GuardiaEnvioConversaciones` en `onModuleInit` (relee `conversacion.estado`
y compara). `PublicarEfectoCanal.publicarMensaje` consulta la guardia antes de enviar; si niega,
lanza `FalloPublicacion('permanente', 'estado-cambio')` y el outbox ya aborta la secuencia.
`EnviarRespuestaTurno` pasa `requiereEstado: 'bot'`; el aviso de espera de CNV3,
`'handoff_pendiente'`.

**Alternatives considered**: (a) seguir releyendo una vez por lote al encolar (incumple R5 con
secuencias de varios pasos, aprendizaje 4 de la Fase 05); (b) encolar paso a paso esperando cada
publicación (convierte el envío en síncrono y pierde el orden por grupo del outbox).

**Rationale**: la relectura ocurre en el instante real del envío, que es lo que protege al cliente
de un bot hablando encima de un asesor; reutiliza el aborto de secuencia existente.

### Decision D8: sesión = conversación + versión; contadores en Redis del agente

**Choice**: la sesión bot es `(conversacionId, version)`: la versión solo cambia al transicionar, así
que es constante mientras la conversación está en `bot`. Claves Redis del agente con prefijo de
módulo: `agente:<conversacionId>:v<version>:turnos` y `...:audios`, con TTL `AGENTE_SESION_TTL_H`
(default 168 h). Primer turno de la conversación = `version === 0` y `turnos === 0` (sin almacenamiento
extra). El aviso se antepone al primer paso de texto con un salto de párrafo.

**Alternatives considered**: (a) contadores por conversación sin reinicio (prototipo: tras volver del
asesor, el primer mensaje vuelve a derivar por tope — P29); (b) marca de "aviso enviado" en Redis
(estado extra que puede perderse).

**Rationale**: cero acoplamiento (el agente no necesita eventos de `conversaciones` para reiniciar) y
comportamiento sensato tras un traspaso. La 07b reutiliza la misma clave de sesión para el historial
(ADR-0017).

### Decision D9: textos del agente en un repositorio propio con respaldo único

**Choice**: `REPOSITORIO_PARAMETRO_AGENTE` (`puertos/`) con `obtenerTexto(clave: ClaveTextoAgente)`;
adaptador Prisma en `infraestructura/prisma/` con un único mapa de respaldos (textos del prototipo,
P31). Nunca lanza por "no configurado".

**Alternatives considered**: leer `parametro` desde `catalogo` o `conversaciones` (acopla módulos sin
necesidad).

**Rationale**: mismo patrón que `RepositorioParametroConversacionesPrisma` y
`RepositorioParametroLlmPrisma` (**R15**).

### Decision D10: configuración nueva

| Variable | Default | Regla |
|---|---|---|
| `AGENTE_TOPE_TURNOS` | `12` | entero ≥ 1 (prototipo §7) |
| `AGENTE_SESION_TTL_H` | `168` | entero 1-720 |

## Data Flow

```
webhook → inbox → ConsumidorConversaciones (lee texto solo si tipo=texto)
  → BufferTurno.push({ idMensaje, tipoContenido, texto }) → ColaTurno (debounce)
  → ProcesarTurno (lock) → conversación fresca (estado, version, canal, contactoId)
      contexto = { conversacionId, contactoId, canal, version, capacidades(perfil) }
  → GENERADOR_RESPUESTA = MotorTurno (agente)
      PoliticaNoTextuales → PoliticaTopeTurnos → ContenidoEcoProvisional
      + aviso de datos (primer turno) + registrar turno
  ← RespuestaTurno { pasos, handoff? }
  → EnviarRespuestaTurno (pasos vacíos → nada; requiereEstado 'bot')
  → si handoff: TransicionarConversacion(handoff_pendiente) → espejo 'abierta' por outbox
Publicador del outbox → PublicarEfectoCanal → GuardiaEnvioCanal.puedeEnviar → Chatwoot
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/modulos/conversaciones/puertos/generador-respuesta.ts` | Modify | Contrato D1 |
| `src/modulos/conversaciones/puertos/salida-conversacion.ts` | Modify | `PasoRespuesta` con `tipo: 'texto'` (la 07b agrega `'imagen'`) |
| `src/modulos/conversaciones/aplicacion/consumidor-conversaciones.ts` | Modify | D2; aviso de espera con `requiereEstado` (D7) |
| `src/modulos/conversaciones/aplicacion/procesar-turno.ts` | Modify | Contexto + handoff (D3) |
| `src/modulos/conversaciones/aplicacion/enviar-respuesta-turno.ts` | Modify | Pasos vacíos; `requiereEstado: 'bot'` |
| `src/modulos/conversaciones/aplicacion/transicionar-conversacion.ts` | Modify | Espejo (D3) |
| `src/modulos/conversaciones/dominio/espejo-estado-canal.ts` | Create | Tabla D3, pura |
| `src/modulos/conversaciones/aplicacion/capacidades-turno.ts` | Create | D5 |
| `src/modulos/conversaciones/aplicacion/guardia-envio-conversaciones.ts` | Create | D7 |
| `src/modulos/conversaciones/aplicacion/agente-eco.ts` | Modify | Nueva firma (CNV6) |
| `src/modulos/conversaciones/conversaciones.module.ts` | Modify | `conGenerador` (D4) + registro de la guardia |
| `src/modulos/conversaciones/index.ts` | Modify | Exporta `GENERADOR_RESPUESTA` y tipos del contrato |
| `src/modulos/canales/puertos/salida-canal.ts` | Modify | `requiereEstado?` |
| `src/modulos/canales/puertos/guardia-envio-canal.ts` | Create | Puerto D7 |
| `src/modulos/canales/aplicacion/registro-guardia-envio-canal.ts` | Create | Registro D7 |
| `src/modulos/canales/aplicacion/salida-canal-outbox.ts` | Modify | `datos.requiereEstado` |
| `src/modulos/canales/aplicacion/publicar-efecto-canal.ts` | Modify | Consulta la guardia |
| `src/modulos/canales/canales.module.ts`, `index.ts` | Modify | Registro de guardia; exporta perfil y guardia |
| `src/modulos/agente/agente.module.ts`, `index.ts` | Create | Provee `GENERADOR_RESPUESTA → MotorTurno` |
| `src/modulos/agente/dominio/politica-turno.ts` | Create | Tipos `PoliticaTurno`, `DecisionPolitica` |
| `src/modulos/agente/dominio/decidir-no-textuales.ts` | Create | Tabla de D6, pura |
| `src/modulos/agente/dominio/aviso-datos.ts` | Create | Anteponer aviso, puro |
| `src/modulos/agente/aplicacion/motor-turno.ts` | Create | Pipeline D6 |
| `src/modulos/agente/aplicacion/politicas/politica-no-textuales.ts` | Create | R12 |
| `src/modulos/agente/aplicacion/politicas/politica-tope-turnos.ts` | Create | R13 |
| `src/modulos/agente/aplicacion/politicas/contenido-eco-provisional.ts` | Create | Eco (07b lo reemplaza) |
| `src/modulos/agente/aplicacion/texto-handoff.ts` | Create | Elige texto por horario |
| `src/modulos/agente/puertos/repositorio-parametro-agente.ts` | Create | D9 |
| `src/modulos/agente/puertos/contadores-sesion.ts` | Create | D8 |
| `src/modulos/agente/infraestructura/prisma/repositorio-parametro-agente-prisma.ts` | Create | D9 |
| `src/modulos/agente/infraestructura/redis/contadores-sesion-redis.ts` | Create | D8 |
| `src/app.module.ts` | Modify | `ConversacionesModule.conGenerador(AgenteModule)` |
| `src/plataforma/config/esquema.ts` | Modify | D10 |
| `.env.example` | Modify | D10 |
| `.dependency-cruiser.cjs` + `test/fronteras/dependency-cruiser.spec.ts` | Modify | Regla 15 + fixture |
| `test/fakes/contadores-sesion-en-memoria.ts`, `repositorio-parametro-agente-en-memoria.ts` | Create | Dobles |
| `test/e2e/agente-politicas.e2e-spec.ts` | Create | Flujo por webhook |
| `docs/adr/0016-composicion-agente-conversaciones.md` | Create | D4 |

## Interfaces / Contracts

```typescript
// src/modulos/conversaciones/puertos/generador-respuesta.ts
export type TipoContenidoTurno =
  | 'texto' | 'imagen' | 'audio' | 'ubicacion' | 'documento' | 'sticker' | 'otro';

export interface MensajeTurno {
  readonly idMensaje: string;
  readonly tipoContenido: TipoContenidoTurno;
  /** Vacío salvo tipoContenido === 'texto' (CNV7). */
  readonly texto: string;
}

export interface CapacidadesSalida {
  readonly mensajeSalienteCuesta: boolean;
  readonly admiteImagen: boolean;
}

export interface ContextoTurno {
  readonly conversacionId: string;
  readonly contactoId: string;
  readonly canal: CanalConversacion;
  /** Constante mientras la conversación está en bot: identifica la sesión (D8). */
  readonly version: number;
  readonly capacidades: CapacidadesSalida;
}

export interface SolicitudTurno {
  readonly contexto: ContextoTurno;
  readonly mensajes: readonly MensajeTurno[];
}

export type MotivoHandoff =
  | 'audio-repetido' | 'tope-turnos' | 'fallo-llm' | 'techo-gasto'
  | 'argumentos-invalidos' | 'plazo-agotado' | 'lead-caliente';

export interface RespuestaTurno {
  readonly pasos: readonly PasoRespuesta[];
  readonly handoff?: { readonly motivo: MotivoHandoff };
}

export const GENERADOR_RESPUESTA = Symbol('GENERADOR_RESPUESTA');
export interface GeneradorRespuesta {
  generar(solicitud: SolicitudTurno): Promise<RespuestaTurno>;
}

// src/modulos/conversaciones/puertos/salida-conversacion.ts
export interface PasoRespuesta {
  readonly paso: string;
  readonly tipo: 'texto'; // 07b agrega { tipo: 'imagen'; claveObjeto; leyenda? }
  readonly texto: string;
}

// src/modulos/canales/puertos/guardia-envio-canal.ts
export interface GuardiaEnvioCanal {
  /** true si la conversación sigue en el estado que el mensaje requiere (CAN9). */
  puedeEnviar(idConversacion: string, requiereEstado: string): Promise<boolean>;
}

// src/modulos/agente/dominio/politica-turno.ts
export type DecisionPolitica =
  | { readonly decision: 'seguir' }
  | { readonly decision: 'responder'; readonly respuesta: RespuestaTurno; readonly cuentaTurno: boolean };

export interface PoliticaTurno {
  evaluar(solicitud: SolicitudTurno): Promise<DecisionPolitica>;
}

// src/modulos/agente/puertos/contadores-sesion.ts
export const CONTADORES_SESION = Symbol('CONTADORES_SESION');
export interface ContadoresSesion {
  turnos(sesion: ClaveSesion): Promise<number>;
  registrarTurno(sesion: ClaveSesion): Promise<void>;
  sumarAudio(sesion: ClaveSesion): Promise<number>;
  reiniciarAudios(sesion: ClaveSesion): Promise<void>;
}
export interface ClaveSesion { readonly conversacionId: string; readonly version: number }

// src/modulos/agente/puertos/repositorio-parametro-agente.ts
export type ClaveTextoAgente =
  | 'mensaje_pedir_texto_audio' | 'mensaje_imagen_no_procesada' | 'aviso_datos'
  | 'mensaje_handoff' | 'mensaje_handoff_fuera_horario';
export const REPOSITORIO_PARAMETRO_AGENTE = Symbol('REPOSITORIO_PARAMETRO_AGENTE');
export interface RepositorioParametroAgente {
  obtenerTexto(clave: ClaveTextoAgente): Promise<string>;
}
```

`CanalConversacion` ya existe en `conversaciones/puertos/repositorio-conversacion.ts`; se exporta como
tipo desde el barril.

## Módulos y fronteras

| Módulo | Importa | Nunca importa |
|---|---|---|
| `conversaciones` | `canales` (barril), plataforma | `agente` (regla 15 nueva) |
| `agente` | `conversaciones` (barril: token y tipos), `horario` (barril), plataforma | `canales` (regla 13), `@prisma/client` fuera de `infraestructura/` |
| `canales` | plataforma | `conversaciones`, `agente` |
| `app.module.ts` | todos | — |

Sin eventos de dominio nuevos. Sin endpoints nuevos: `openapi/` no cambia.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `decidirNoTextuales`, `anteponerAviso`, `espejoEstadoCanal`, `capacidadesTurno` | Funciones puras, tablas de casos |
| Unit | `MotorTurno` y cada política; `ProcesarTurno` con handoff y pasos vacíos; `PublicarEfectoCanal` con guardia | Dobles en memoria (`test/fakes/`), `ClockFalso` |
| Integration | Consumidor con tipo de contenido; `TransicionarConversacion` + espejo en outbox; guardia real contra Postgres; contadores Redis con TTL | Testcontainers (arnés `base-por-worker`) |
| Fronteras | Regla 15 + fixture violadora | `npm run fronteras` |
| E2E | Webhook firmado → audio, segundo audio, imagen, sticker, texto con aviso, tope | `test/e2e/agente-politicas.e2e-spec.ts` con Chatwoot falso (`test/soporte/chatwoot-falso.ts`) |

Nombres de test: `<id> — <título exacto del escenario>`.

## Threat Matrix

| Amenaza | Aplica | Control |
|---|---|---|
| Contenido o PII en logs al registrar tipos y motivos | Sí | Solo se loguean `tipoContenido`, `motivo`, ids; test de redacción con el logger real (patrón LLM10) |
| Borde de ruteo, comandos shell, subprocesos, automatización VCS | No | — |

## Migration / Rollout

Sin esquema. Rollout por la cadena de PRs; revertir = sacar `conGenerador(AgenteModule)` de
`AppModule`. Review: **RDD** por commit; `judgment-day` no obligatorio (regla 6).

## Open Questions

- [ ] P27 (ubicación) — la recomendación está en el delta de R12.
- [ ] P28, P29, P31 — no bloquean; defaults recomendados aplicados.
