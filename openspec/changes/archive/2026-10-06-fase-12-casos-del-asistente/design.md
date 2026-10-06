# Design: Fase 12 — Casos de uso del asistente, estilo desacoplado y configuración del negocio

- Change: `fase-12-casos-del-asistente` · Fecha: 2026-10-05 · Estado: **spec en revisión**
- Proposal: `proposal.md` · Specs: `asistente` (CAS1-CAS11, dominio nuevo), `configuracion` (CFG1-CFG6; delta de
  `configuracion-negocio`), `estilo-agente` (EST-D1-EST-D5; delta de `agente`), `cliente-shell` (SHL1-SHL11; delta de `cliente`)
- ADR: [0024](../../../docs/adr/0024-casos-del-asistente.md) nuevo (`propuesta`); se apoya en 0020 (matiza dónde se
  guarda el estilo), 0022 y 0023.

## Technical Approach

Una regla separa los tres tipos de dato y manda sobre el diseño:

| Si… | Es… | Vive en… |
|---|---|---|
| el cliente lo lee | un **caso de uso** | `asistente` (tablas `categoria_caso`, `caso_asistente`) |
| el código lo usa para calcular o decidir | un **parámetro del negocio** | `parametro`, por `configuracion` |
| es cómo habla el bot | el **estilo** | `version_estilo`, por `agente` (puerto sin cambios) |

```
cliente/ (Angular)                          servicio/ (NestJS)
┌───────────────────────────────┐          ┌───────────────────────────────────────────────┐
│ menú lateral (grupos, hijos)  │          │ asistente ── casos, categorías, sistema.ts     │
│ DialogoEdicion (compartido)   │  /api/*  │    ▲ puerto TextosAsistente / ConsultaCasos     │
│ área asistente: Casos, Estilo │ ───────▶ │    │                                          │
│ área configuracion: 3 pantallas│         │ agente · conversaciones · catalogo · llm        │
│ cliente HTTP generado         │ ◀─────── │ configuracion ── registro tipado de parametro   │
└───────────────────────────────┘ openapi  │ agente/estilo ── RepositorioEstilo → version_estilo│
                                           └───────────────────────────────────────────────┘
```

Lo que **no** cambia: el bucle del LLM, las conversaciones, el canal, las reglas no negociables en código (R1, R2, R14),
la validación del estilo (AGT20), el puerto `RepositorioEstilo` y cómo se aplica un estilo al instante (AGT19).

## Módulos tocados y dependencias

Solo se importa lo exportado por el barril de cada módulo (`index.ts`).

| Módulo | Cambio | Depende de |
|---|---|---|
| `asistente` (nuevo) | Casos, categorías, lista cerrada del sistema, puertos, semilla, API de admin | `plataforma` (prisma, redis, reloj, errores), `compartido/texto`, `usuarios` (solo el decorador de usuario actual y el rol) |
| `agente` | Pide textos al puerto; `consultar_caso` + índice; estilo en `version_estilo` | `asistente`, `usuarios` (autor del estilo) |
| `conversaciones`, `catalogo`, `llm` | Piden sus textos a `TextosAsistente`; se borran sus lectores sueltos de `parametro` | `asistente` |
| `configuracion` (nuevo) | Registro tipado, grupos Horario/Envíos/Gasto del LLM | `plataforma`, `usuarios`, `catalogo` (invalidar su caché), `horario`, `llm` (solo lectura del estado) |
| `mensajes-fijos` | Adaptador delgado en T5; **se borra en T8** | — |

`asistente` no importa de `agente`, `conversaciones`, `catalogo` ni `llm`: la lista de casos del sistema vive **en
`asistente`** (D2) y los demás importan sus claves, así no hay ciclos. Se agrega a `dependency-cruiser` la arista
«módulo → `asistente`» y se prohíbe la inversa.

## Architecture Decisions

### D1: un módulo dueño de todo lo que el bot le dice al cliente

**Choice**: `servicio/src/modulos/asistente/` (dominio, puertos, aplicación, infraestructura, interfaz) absorbe el módulo
`mensajes-fijos`, las políticas de `catalogo` y los lectores de texto de los demás módulos.
**Alternatives**: dejar cada texto en su módulo y solo agregar una pantalla (mantiene el acoplamiento por clave escrita a
mano); un módulo de «parámetros» genérico (repite el cajón).
**Rationale**: un dueño, un puerto, una caché y una validación. Es la regla del dueño: «todo lo que se le demuestra al
cliente va en casos de uso».

### D2: la lista de casos del sistema es una constante tipada en `asistente`

**Choice**: `asistente/dominio/sistema.ts` exporta `CASOS_DEL_SISTEMA` (`clave`, `titulo`, `descripcion`,
`categoriaInicial`, `textoRespaldo`) y el tipo `ClaveSistema`. Los once casos de hoy: los diez mensajes fijos más
`contra_entrega`. Hoy cada módulo declara los suyos (`TEXTOS_FIJOS_AGENTE`, `…_CONVERSACIONES`, `…_CATALOGO`, `…_LLM`):
pasan a esta lista única; los consumidores importan la clave, no el texto.
**Alternatives**: que cada módulo siga exportando su catálogo y `asistente` los componga (como hace hoy
`mensajes-fijos/catalogo-real.ts`): obliga a `asistente` a depender de todos y crea ciclos con el puerto de textos.
**Rationale**: el texto de respaldo es conocimiento de qué le dice el bot, que es de `asistente`; y es la única lista
que el código necesita (una situación nueva exige código que la detecte).

### D3: un puerto único y una copia versionada, con el patrón del estilo

**Choice**: `TEXTOS_ASISTENTE` (`textoDelSistema(clave): Promise<string>`, nunca lanza) y `CONSULTA_CASOS`
(`indice()`, `consultar(titulo)`), implementados por un `ProveedorAsistente` que guarda en memoria el texto de los casos
del sistema y los casos de intención activos mientras la versión compartida de Redis (`asistente:version`) no cambie,
con TTL de respaldo de 5 minutos (resiliencia técnica, no dato del negocio; igual que `ProveedorEstilo`). Toda escritura
de caso o categoría sube la versión. Redis caído → se lee la base sin guardar copia; base caída → respaldo del código.
**Alternatives**: leer la base en cada mensaje (hoy los mensajes fijos lo hacen: simple, pero con el índice del prompt
sería una consulta más por turno); invalidar con eventos de dominio (más piezas).
**Rationale**: reutiliza el mecanismo ya probado de AGT19 y mantiene «rige en el siguiente mensaje» sin consulta extra.

### D4: modelo de datos (esquema = decisión del dueño, P62)

Se diseña primero en `MODELO_DATOS.md`. Llaves UUID v7 (ADR-0007).

| Tabla | Columnas |
|---|---|
| `categoria_caso` | `id`, `nombre`, `nombre_normalizado` (único), `orden`, `creado`, `actualizado` |
| `caso_asistente` | `id`, `categoria_id` (FK `RESTRICT`), `titulo`, `titulo_normalizado` (único), `cuando_aplica`, `disparador` (`evento`\|`intencion`), `clave_sistema` (único, nulo), `modo` (`literal`\|`guia`), `texto`, `activo`, `busqueda_normalizada`, `creado`, `actualizado` |
| `version_estilo` | `id`, `version` (único), `texto`, `vigente`, `publicado_en`, `publicado_por_id` (FK a `usuario`, nulo), `publicado_por_nombre` (instantánea) |

Restricciones que Prisma no expresa y se escriben a mano (`[manual]`, T3 y T4): índice único parcial de `vigente` en
`version_estilo`; en `caso_asistente`, `disparador = 'evento'` exige `clave_sistema` no nula y modo `literal`, y un caso
con `clave_sistema` no puede estar inactivo.

- `disparador` y `clave_sistema` son independientes: `contra_entrega` es un caso de **intención** (el LLM puede
  consultarlo) con clave del sistema (el código lo adjunta a la cotización). Un caso con clave del sistema se edita pero no
  se borra ni se desactiva.
- Los `*_normalizado` y `busqueda_normalizada` (minúsculas, sin acentos) se calculan en código al escribir; así la
  búsqueda por `q` no depende de la extensión `unaccent` de Postgres. Para decenas de casos basta un `LIKE`.
- `publicado_por_nombre` es una instantánea para auditar quién publicó aunque el usuario cambie de nombre; evita que
  `agente` lea la tabla de `usuarios` (frontera de módulos).
- Paginación por cursor (API5): el cursor es opaco y codifica `(orden de categoría, título normalizado, id)`.

### D5: el agente recibe un índice y consulta con `consultar_caso`

**Choice**: el prompt de cada turno agrega, tras el estilo, el **índice** de casos de intención activos
(`- Título: cuándo aplica`), acotado a 60 casos y 6.000 caracteres (recorta por orden de categoría y avisa en el log solo
con conteos). `consultar_caso({ titulo })` devuelve `{ encontrado, titulo, modo, texto }` o la lista de títulos
disponibles. `reglas.v4.md` agrega: con modo `literal`, copiar palabra por palabra (misma regla de cita de AGT8); con
`guia`, usarlo como base sin inventar datos que el caso no trae; consultar un caso solo si el índice lo lista. `cotizar_envio`
sigue adjuntando el texto de `contra_entrega` (CAS11).
**Alternatives**: volcar todos los textos en el prompt (cuesta tokens y mezcla); detectar el caso por palabras clave
(frágil); RAG (innecesario para decenas de casos).
**Rationale**: el LLM decide cuándo aplica un caso con el «cuándo aplica» que escribe el dueño, y la cita literal sigue
protegiendo R1 y R2.

### D6: la API del asistente

Diez operaciones (tabla en CAS9), todas `@Roles('admin')`, errores RFC 9457 con códigos estables
(`categoria-duplicada`, `categoria-con-casos`, `categoria-inexistente`, `caso-duplicado`, `caso-inexistente`,
`caso-del-sistema`, `caso-modificado`, `caso-invalido`). Editar un caso exige la `actualizado` leída: si cambió, `409`
`caso-modificado` (sin historial de versiones en esta fase, P61). `listarCasos` acepta `q`, `categoriaId`, `disparador`,
`activo`, `cursor`, `limite` y devuelve `{ items, siguienteCursor }`. Validación del texto: las funciones de
`compartido/texto` que ya usa `validar-estilo` (pesos, SKU, marcador de plantilla) más largo y vacío.

### D7: el estilo cambia de lugar, no de comportamiento

`RepositorioEstiloPrisma` se reescribe sobre `version_estilo` sin tocar el puerto `RepositorioEstilo` ni
`PublicarEstilo`/`RestaurarEstilo`/`ListarHistorialEstilo`/`ProveedorEstilo`. La publicación sigue siendo una transacción
con candado consultivo (hoy `pg_advisory_xact_lock` sobre la clave) que pasa la vigente a no vigente, inserta la nueva y
poda a diez anteriores. El caso de uso recibe el autor (usuario de la sesión o nulo para el comando) y lo pasa al
repositorio. La migración copia vigente e historial de `parametro` con sus números; las claves viejas se borran **en T11**
(rollback hasta entonces). Las pruebas de AGT18-AGT23 son la red de seguridad: no se editan sus escenarios.

### D8: configuración del negocio como módulo propio con registro tipado

**Choice**: `configuracion/dominio/registro-parametros.ts` declara, por clave de `parametro`, su esquema Zod
(`horario_atencion`, `recargo_contraentrega_pct`, `factor_volumetrico`, `llm_techo_mensual_usd`) y marca de solo lectura
(`llm_estado_techo`); es el «registro tipado por clave» de MODELO_DATOS §3. Tres controladores de grupo; el de horario
escribe los siete días explícitos (`lun`…`dom`) y gestiona `excepcion_horario` fila a fila. Tras confirmar la escritura,
invalida la caché del catálogo con un puerto exportado por `catalogo` (`InvalidadorCacheCatalogo`); el lector de
`horario/` y el techo del LLM leen en cada uso, y T9 lo verifica antes de escribir código (si alguno guarda caché, se
invalida igual).
**Alternatives**: un editor genérico de clave/valor (un JSON mal escrito deja al bot sin horario); mover los lectores de
cada módulo a `configuracion` (reescribe tres módulos sin necesidad).
**Rationale**: validar al guardar, no al leer. Los módulos dueños siguen leyendo y calculando como hoy (R1); `configuracion`
solo escribe.

### D9: el importador y los datos de desarrollo

`catalogo:importar` deja de aceptar filas de texto en `parametros.csv` (`mensaje_*`, `politica_*`): falla de forma
todo-o-nada nombrando la fila y apunta a «Casos de uso». Las tres políticas de desarrollo (`devoluciones`, `garantia`,
`instalacion`) pasan de `servicio/datos-desarrollo/catalogo/parametros.csv` a un archivo para `casos:sembrar`
(`servicio/datos-desarrollo/asistente/`). `casos:sembrar` copia las filas existentes de `parametro` y las retira en la
misma transacción (CAS6).

### D10: cliente — menú lateral, ventana de edición y áreas

- `EntradaDeMenu` pasa a una unión: una entrada con `ruta` o un grupo con `hijos` (sin `ruta`). El shell arma el árbol desde el
  registro, filtra por rol y oculta grupos sin hijos visibles.
- `MenuLateralComponent` sobre `MatSidenav` (`side` en escritorio, `over` en teléfono con `BreakpointObserver`), modo compacto
  con `MatTooltip` y preferencia en `localStorage` con `try/catch`. jsdom no trae `matchMedia`: las pruebas lo simulan.
- `DialogoEdicionComponent` en `compartido/` sobre `MatDialog`; reutiliza `ConfirmacionComponent` y `EditorConContador`. Una
  API pequeña: título, contenido proyectado, `guardar(): Promise<void>`, `hayCambios()`, mensaje de error. La pantalla mantiene
  el estado en lectura.
- Áreas: `areas/bot/` → `areas/asistente/{casos,estilo}` y nueva `areas/configuracion/{horario,envios,gasto-llm}`. Rutas:
  `/asistente/casos`, `/asistente/estilo`, `/configuracion/horario|envios|gasto-llm`. Las rutas `/bot/*` se retiran sin
  redirección (no hay usuarios que las tengan guardadas).
- Los presupuestos de bundle de la 11b (aviso 700 kB, error 1 MB) se respetan; T1 los mide.
- Estilos solo con tokens `--mat-sys-*`, sin colores sueltos.

### D11: orden de entrega y por qué

1. **12a primero (T1-T3)**: el menú y la ventana se construyen una vez y las pantallas nuevas nacen con ellos; el estilo
   se desacopla temprano porque toca una sola pantalla y un solo adaptador, con sus tests como red.
2. **12b (T4-T8)**: primero la base sin consumidores (T4), después el corte de textos con comportamiento idéntico (T5),
   luego lo nuevo (T6-T8). Entre T5 y T8 «Mensajes fijos» sigue funcionando porque `mensajes-fijos` es un adaptador sobre
   `asistente`: no hay una pantalla que edite datos que el bot ya no lee.
3. **12c (T9-T12)**: configuración y, al final, la limpieza, que es el único paso sin vuelta fácil.

### D12: partición en tres subfases dentro de un change

12 tareas exceden el límite de 10 de `openspec/config.yaml`; se parte en 12a (3), 12b (5) y 12c (4), cada una con una
verificación de salida propia (tabla en `tasks.md`). No se separan en changes distintos para no repetir specs ni
aprobaciones; el dueño puede pedirlo.

## Cambios de contrato

Operaciones nuevas (método, ruta, esquemas y códigos de error en CAS9, CFG1 y EST-D3): diez de `asistente`, seis de
`configuracion`, y el campo `publicadoPor` en las respuestas de estilo. Se retiran `GET /api/v1/mensajes-fijos` y
`PUT /api/v1/mensajes-fijos/{clave}` (T8). El contrato público se regenera y el cliente HTTP se regenera con
`api:generar`, en el mismo commit que el cambio.

## Eventos de dominio y configuración

Ningún evento de dominio nuevo. Ninguna variable de entorno nueva. Constantes de código con motivo: TTL de respaldo de la
copia (5 min), tope del índice (60 casos / 6.000 caracteres), tope del texto de un caso (1.200 caracteres), título (80) y
«cuándo aplica» (200).

## Riesgos de diseño

| Riesgo | Efecto | Mitigación |
|---|---|---|
| El LLM no consulta un caso cuando debería | Respuestas genéricas | El índice lleva el «cuándo aplica» del dueño; evals guionadas por caso y corrida real `[manual]` |
| El LLM inventa un caso que no existe | Datos falsos | `consultar_caso` devuelve la lista de disponibles y `reglas.v4.md` prohíbe responder con datos que no vienen de un caso (R1, R2) |
| Una instantánea de `publicado_por_nombre` queda vieja | Nombre desactualizado en el historial | Es auditoría de lo que pasó, no un dato vivo; el identificador sigue ahí |
| La búsqueda sin extensión no escala a miles de casos | Lenta | Fuera de alcance: son decenas; si crece se evalúa `pg_trgm` en un ADR nuevo |
