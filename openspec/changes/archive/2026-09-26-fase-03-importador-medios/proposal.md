# Proposal: Fase 03 — Importador y medios

- Change: `fase-03-importador-medios` · Fase de la hoja de ruta: **03** (`docs/fases/README.md`)
- Rama: `fase-03-importador-medios` · Fecha: 2026-09-26 · Estado: **en borrador** (proposal, specs,
  design y tasks pendientes de aprobación del usuario)
- Depende de: **Fase 00a y Fase 02, cerradas** (esquema v1 de Fase 01 con `producto`/`foto`/
  `parametro`/`zona_sin_cobertura`/`tarifa_estimada`/`excepcion_horario`; módulo `catalogo` de
  Fase 02 con `CACHE_CATALOGO` y su invalidación por versión; módulo `geografia` de Fase 01 para
  resolver nombres de lugar a código DANE; `plataforma/reloj` de Fase 00a)
- Insumo principal: exploración delegada del prototipo `../ChatLuxeCRM` (código y tests de
  `src/catalogo/*`, `src/media/collage.ts`, `src/media/placeholder.ts`,
  `src/db/repositorios/catalogo.ts`, `docs/CATALOGO.md`); `docs/migracion/inventario.md`;
  `openspec/specs/catalogo/spec.md` (Fase 02, ya fusionada); `MODELO_DATOS.md` §3-§5;
  `docs/analisis/01-analisis-chatluxecrm.md` (A1, A14). *(Nota de proceso: igual que en la Fase 02,
  el dispatcher de agentes SDD rechazó el lanzamiento de `sdd-explore`/`sdd-propose` pese al
  preflight confirmado; el material se reunió con un agente genérico y se verificó leyendo
  directamente el código y las specs citadas en este documento.)*

## Intent

El catálogo hoy se llena a mano (no hay comando de carga masiva) y las fotos no tienen dónde vivir:
Fase 02 construyó la lectura (`ObtenerFichaProducto`, `ListarProductosActivos`) sobre un catálogo
vacío. El prototipo ya resuelve esto con un importador desde Google Sheets, todo-o-nada, con collage
automático — pero guarda las fotos en disco local (**A14**), lo que impide correr más de una
instancia y no sirve para el VPS de producción (Fase 09, Dokploy).

Esta fase porta ese importador, corrigiendo A14 con un puerto `Almacenamiento` sobre MinIO
(**ADR-0012**), y adapta la escritura de tarifas/cobertura al esquema nuevo de Fase 01
(`zona_sin_cobertura` + `tarifa_estimada` con FK a `departamento`/`ciudad`, en vez del texto libre
del prototipo).

Éxito = la verificación de salida de la fila 03 de `docs/fases/README.md`: **`npm run
catalogo:importar -- --dir <fixtures>` deja el catálogo y las fotos listos; todo-o-nada.**

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Almacenamiento de objetos | **MinIO self-hosted**, detrás de un puerto `Almacenamiento`; mismo backend en dev y producción | **ADR-0012** (nuevo, propuesta) |
| Fuente de Google Sheets | Se conserva el endpoint público `gviz/tq?tqx=out:csv` (hoja compartida "cualquiera con el enlace: lector"), sin API key ni cuenta de servicio — funciona en el prototipo sin fricción de credenciales | `docs/migracion/inventario.md` línea 28; `../ChatLuxeCRM/docs/CATALOGO.md` §1 |
| Modo local para el criterio de salida | `--dir <fixtures>` lee CSVs locales (mismo formato que las pestañas de la hoja), sin depender de red — es el modo que exige la verificación de salida de esta fase | `docs/fases/README.md` fila 03 |
| Esquema de catálogo/envío/horario | Ya migrado en Fase 01; esta fase no crea tablas, solo las llena | `MODELO_DATOS.md` §3-§5, `verify-report.md` de Fase 01 |
| Invalidación de caché tras importar | Reutiliza `CACHE_CATALOGO.invalidar()` de Fase 02, no reimplementa invalidación | `openspec/specs/catalogo/spec.md` CAT5 |
| Entrega | `auto-chain`, cadena `stacked-to-main`, slices de ~400 líneas de autoría | preflight de esta sesión |
| Review | RDD por commit de unidad de trabajo; **sin** `judgment-day` (03 no es 04/05/06/10) | regla 6 de `docs/fases/README.md` |

## Scope

### In Scope

1. **Puerto `FuenteCatalogo`**: lee pestañas de productos/fotos/tarifas/parámetros/excepciones desde
   (a) el endpoint público de Google Sheets por pestaña, o (b) un directorio local de CSVs con el
   mismo formato (`--dir <fixtures>`, modo del criterio de salida). Detecta explícitamente hoja no
   compartida (responde HTML en vez de CSV) o pestaña inexistente, con error claro.
2. **Puerto `Almacenamiento`** sobre MinIO (ADR-0012): `guardar`, `obtenerUrl`, `eliminar` sobre
   claves de objeto (`foto.clave_archivo`, `producto.clave_collage`), nunca rutas de filesystem.
   `docker-compose.yml` gana el servicio `minio` (dev); producción se resuelve en Fase 09.
3. **Descarga de fotos desde Google Drive**: conversión de enlaces (`/file/d/ID/`, `open?id=`,
   `uc?id=`) a URL de descarga directa; detecta enlace de carpeta o archivo no compartido (HTML en
   vez de imagen, validado también por *magic bytes* JPEG/PNG/WEBP, no solo `content-type`).
4. **Procesamiento de fotos e idempotencia**: redescarga solo si `origen_url` cambió o falta el
   archivo; redimensiona a ≤1600px, JPEG calidad 80; borra fotos sobrantes de importaciones previas.
5. **Collage automático** (`medios/collage.ts`, puro): grilla 2×2 (≤4 fotos) o 2×3 (más), tiles
   400×400 `cover`, JPEG calidad 85; regenera solo si hubo fotos nuevas o cambió `fotos_hash`
   (hash de los enlaces de origen, evita recomputar sin cambios).
6. **Validación previa** (todo-o-nada, `validar.ts` portado): SKU único con formato fijo, precio
   entero positivo, 1-6 fotos con URL http(s), peso/medidas opcionales, tarifas (franja de peso sin
   solapes inválidos, rango min≤max, días min≤max), parámetros (claves conocidas validadas por forma,
   claves desconocidas generan advertencia, no error — ver Q3), excepciones de horario (fecha
   parseable). Una fila inválida MUST dejar la base exactamente como estaba.
7. **Resolución de departamento/ciudad a código DANE** (nuevo respecto al prototipo, por el cambio de
   esquema): el importador traduce el texto de la hoja a `departamento_id`/`ciudad_id` reutilizando
   el repositorio de `geografia` (Fase 01) y `normalizarLugar` de `compartido/texto` (mismo criterio
   de comparación que `elegirTarifa` de Fase 02, CAT8). Sin match → fila inválida (todo-o-nada, no se
   adivina el departamento/ciudad) — ver Q1.
8. **Escritura todo-o-nada dentro de `PrismaService.$transaction`**: upsert de productos; borrar y
   recrear fotos; desactivar (nunca borrar) productos ausentes de la hoja; reemplazo completo de
   `tarifa_estimada`/`zona_sin_cobertura`; upsert de `parametro` (jsonb, ver Q2); sincronizar
   `excepcion_horario` (solo fechas futuras, conserva pasadas como historial). Las fotos se procesan
   **antes** de la transacción (como el prototipo): si la escritura a BD falla después, pueden quedar
   objetos huérfanos en MinIO — riesgo heredado del prototipo, aceptado explícitamente (ver Risks).
9. **Invalidación de `CACHE_CATALOGO`** al final de una importación exitosa.
10. **Comando CLI** `npm run catalogo:importar -- [--sheet-id <id> | --dir <fixtures>]
    [--solo-validar]`, construido con `NestFactory.createApplicationContext` (o equivalente),
    `FuenteCatalogo`/`Almacenamiento` inyectados — nunca funciones sueltas ni conexión abierta al
    importar el módulo (**A1**).
11. **Fixtures de prueba**: un directorio de CSVs + fotos reales pequeñas (no generadas) que sirva
    como entrada del criterio de salida (`--dir <fixtures>`).

### Out of Scope

| Qué | Fase | Motivo |
|---|---|---|
| Notificación del resultado de la importación (Telegram) | 08 | `docs/migracion/inventario.md` línea 45: `telegram/*` migra a `notificaciones/` en Fase 08; no se adelanta trabajo de fases futuras (`CLAUDE.md`) |
| Generación de imágenes placeholder sintéticas (`generarFotoPlaceholder`) | — | El prototipo solo lo usa desde su script de semilla de datos de prueba, no desde el flujo de importación real; los fixtures de esta fase usan fotos reales pequeñas en vez de generarlas (ver Q4) |
| Poblar `categoria_producto` desde la hoja | — | El prototipo no lo hace (comentario explícito: "la hoja es catálogo, el inventario se maneja en el backoffice"); ninguna fila de `docs/migracion/inventario.md` lo pide |
| Backend de almacenamiento en producción (Dokploy) | 09 | ADR-0012 decide el backend (MinIO), no su despliegue; Fase 09 despliega infraestructura de producción |
| Compensación/outbox si la BD falla tras escribir fotos en MinIO | — | Riesgo heredado y aceptado del prototipo (ver Risks); se revisita solo si se vuelve un problema real |

## Qué se migra del prototipo

| Prototipo (`../ChatLuxeCRM`) | Decisión | Destino | Motivo |
|---|---|---|---|
| `src/catalogo/importar.ts` | **Conservar** (orquestación todo-o-nada) | `catalogo/aplicacion/importar-catalogo.ts` | Lógica probada (fotos antes que BD, validar antes de escribir) |
| `src/catalogo/fuentes.ts` | **Conservar** | `catalogo/infraestructura/fuente-catalogo-sheets.ts` | Funciona sin fricción de credenciales |
| `src/catalogo/drive.ts` | **Conservar** | `catalogo/infraestructura/descarga-drive.ts` | Detección de enlaces y validación por *magic bytes* ya correctas |
| `src/catalogo/fotos.ts` | **Rediseñar** | `catalogo/aplicacion/procesar-fotos.ts` sobre puerto `Almacenamiento` | Reemplaza disco local (**A14**) por MinIO |
| `src/media/collage.ts` | **Conservar** (puro) | `medios/collage.ts` | B-equivalente: función pura, sin tocar BD |
| `src/media/placeholder.ts` | **Posponer** | — | Ver Out of Scope, Q4 |
| `src/catalogo/validar.ts` | **Conservar** (reglas) / **Rediseñar** (forma de parámetros) | `catalogo/dominio/validar-catalogo.ts` | Reglas de negocio se conservan; serialización jsonb es nueva (Q2) |
| `src/db/repositorios/catalogo.ts` | **Rediseñar** | `catalogo/infraestructura/repositorio-importacion-prisma.ts` | Reemplaza texto libre de departamento/ciudad por FK DANE (Q1); resto del patrón de escritura se conserva |
| `src/catalogo/cli.ts` | **Rediseñar** | comando Nest CLI | Corrige **A1** (conexión al importar) |
| `src/catalogo/notificar.ts` | **Posponer** | Fase 08 (`notificaciones/`) | Ver Out of Scope |
| Fotos en `data/media/` (disco local) | **Descartar** | MinIO vía puerto `Almacenamiento` | **A14** |

## Capabilities

### New Capabilities

- `catalogo` (extensión): la Fase 02 ya creó este dominio para lectura (CAT1-CAT11); esta fase agrega
  requisitos de **escritura/importación** (`IMP#`) al mismo dominio, porque el importador escribe
  exactamente las tablas que `catalogo` lee y reutiliza su caché (`CACHE_CATALOGO`) — no se abre un
  dominio nuevo para no partir el contrato observable de "catálogo" en dos specs que un lector tendría
  que cruzar.
- `medios`: contrato observable del puerto `Almacenamiento` y la generación de collage. Se separa de
  `catalogo` porque es una capacidad más genérica (cualquier módulo futuro con archivos la reutiliza),
  igual criterio que separó `horario` de `catalogo` en la Fase 02.

### Modified Capabilities

- `catalogo`: delta nuevo (`## ADDED Requirements`, ids `IMP#`) sobre `openspec/specs/catalogo/spec.md`
  ya fusionado — no se modifica ningún requisito CAT existente.

## Approach

1. **Dominio primero, puro**: portar `validar.ts` (reglas) y la resolución de departamento/ciudad
   como funciones puras, con sus tests, antes de tocar Prisma/MinIO/HTTP.
2. **Puertos antes que orquestación**: `FuenteCatalogo`, `Almacenamiento`, y el repositorio de
   importación, cada uno con su adaptador y tests de integración (Postgres real para el repositorio,
   MinIO real — o Testcontainers si hay imagen oficial — para `Almacenamiento`).
3. **Collage y procesamiento de fotos** sobre los puertos ya construidos.
4. **Orquestador todo-o-nada** al final: valida → procesa fotos (fuera de la transacción, como el
   prototipo) → escribe en una sola `$transaction` → invalida caché.
5. **CLI al final**, envolviendo el orquestador con `NestFactory.createApplicationContext`.
6. **Evidencia real** por tarea, mismo patrón que Fases 01 y 02.

**Entrega**: `auto-chain`, `stacked-to-main`. Corte natural de slices: (a) dominio puro (validación +
resolución de lugar), (b) puertos `FuenteCatalogo`/`Almacenamiento` + repositorio de importación, (c)
procesamiento de fotos + collage, (d) orquestador todo-o-nada + invalidación de caché, (e) comando CLI
+ fixtures + cierre documental.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `docker-compose.yml` | Modified | Servicio `minio` nuevo (ADR-0012) |
| `docs/adr/0012-*.md` | New | MinIO como almacenamiento de objetos |
| `src/modulos/catalogo/dominio/` | Modified | Validación de importación, resolución de lugar |
| `src/modulos/catalogo/puertos/`, `infraestructura/` | Modified | `FuenteCatalogo`, `Almacenamiento`, repositorio de importación |
| `src/modulos/catalogo/aplicacion/` | Modified | Orquestador todo-o-nada, procesamiento de fotos |
| `src/modulos/medios/` | New | Puerto `Almacenamiento`, adaptador MinIO, `collage.ts` |
| `src/catalogo-cli/` o `scripts/` (ubicación en design) | New | Comando `catalogo:importar` |
| `test/fixtures/catalogo/` | New | CSVs + fotos reales pequeñas para el criterio de salida |
| `openspec/specs/catalogo/` | Modified (al archivar) | Delta `IMP#` fusionado |
| `openspec/specs/medios/` | New (al archivar) | Dominio nuevo |
| `.env.example` | Modified | Variables de MinIO (`MINIO_*`) y `CATALOGO_SHEET_ID` |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modified | Al archivar |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Fotos escritas en MinIO antes de que la transacción de BD confirme: una fila puede fallar después de subir fotos, dejando objetos huérfanos | Media | Riesgo heredado y aceptado del prototipo (mismo orden: fotos primero, "si algo falla aquí, la base no se ha tocado"); objetos huérfanos son baratos de limpiar con un job de mantenimiento futuro, no bloquea esta fase |
| Resolución de departamento/ciudad a DANE sin match exacto por errores de tipeo en la hoja | Media | Q1: sin match → fila inválida (todo-o-nada), nunca se adivina; mensaje de error cita el texto exacto que no matcheó |
| MinIO real en tests de integración puede no tener imagen oficial de Testcontainers tan probada como Postgres/Redis | Baja-Media | `sdd-design` verifica disponibilidad antes de comprometerse; alternativa: contenedor MinIO manual vía Testcontainers genérico (`GenericContainer`) |
| Presupuesto de ~400 líneas con 5+ archivos de infraestructura nuevos (Sheets, Drive, MinIO, repositorio) | Alta | Slices del Approach; si una slice lo supera por naturaleza, se explica y se sigue |

## Rollback Plan

- Todo vive en la rama `fase-03-importador-medios`, slices apilados (`stacked-to-main`). Revertir =
  no fusionar la cadena, o `git revert` del commit de la slice afectada.
- No hay datos en producción; el importador nunca corrió con datos reales del negocio (P7 sigue
  aplicando: sin datos del prototipo).
- `docker-compose.yml`: revertir el servicio `minio` no afecta Postgres/Redis existentes.
- El comando CLI es explícito (no corre al arrancar la aplicación); no ejecutarlo no rompe nada.

## Dependencies

- Fase 00a, 01 y 02 cerradas: esquema v1, módulo `geografia`, módulo `catalogo` (lectura + caché),
  `compartido/texto`, `plataforma/reloj`.
- Docker corriendo (Postgres + Redis + MinIO en tests de integración).
- Hoja de Google Sheets real compartida (para probar el modo remoto manualmente; el criterio de
  salida automatizado usa `--dir <fixtures>`, no la red).

## Preguntas abiertas

**Ninguna pregunta de `docs/PREGUNTAS_ABIERTAS.md` bloquea esta fase.**

El backend de almacenamiento de objetos (que sí era una decisión real sin resolver) ya se decidió con
el usuario y quedó en **ADR-0012** (MinIO). Preguntas nuevas de esta proposal, ya decididas por el
usuario (2026-09-26):

| # | Pregunta | Decisión del usuario | Efecto |
|---|---|---|---|
| Q1 | ¿Qué pasa si el departamento/ciudad de una fila de la hoja no matchea ningún nombre de `geografia` (error de tipeo del negocio)? | **Fila inválida, todo-o-nada** (recomendación aceptada) | No se adivina el lugar; el mensaje de error cita el texto exacto sin matchear, igual criterio que una tarifa mal formada |
| Q2 | ¿Cómo se expresa "zona sin cobertura" en la hoja, si `docs/CATALOGO.md` del prototipo no tiene una columna equivalente (el prototipo no tenía esa tabla)? | **Pestaña nueva `cobertura`** (recomendación aceptada) | Columnas `departamento`/`ciudad`/`motivo`, mapeada 1:1 a `zona_sin_cobertura`; `sdd-spec`/`sdd-tasks` la incluyen como pestaña propia, no como fila especial de tarifas |
| Q3 | `parametro.valor` pasa de texto plano (prototipo) a `jsonb` (esquema nuevo) — ¿cómo serializa el importador cada clave conocida? | **Parser propio por clave** (recomendación aceptada) | `horario_atencion` → objeto tipado; `recargo_contraentrega_pct`/`factor_volumetrico` → número; clave desconocida → advertencia, se guarda tal cual (mismo criterio que el prototipo) |
| Q4 | ¿La generación de fotos placeholder sintéticas entra en el alcance de "fixtures" de esta fase? | **No, fotos reales en el repo** (recomendación aceptada) | Los fixtures usan fotos reales pequeñas versionadas en el repo; `generarFotoPlaceholder` no se porta en esta fase |

## Success Criteria

- [ ] `npm run catalogo:importar -- --dir <fixtures>` deja productos, fotos (en MinIO) y collages
      listos a partir de CSVs de prueba, sin tocar la red.
- [ ] Una fila inválida (SKU repetido, precio negativo, foto no accesible, departamento/ciudad sin
      match DANE) deja la base exactamente como estaba antes de importar — ninguna escritura parcial.
- [ ] Re-importar sin cambios no descarga fotos ni regenera collages; cambiar un enlace de foto
      redescarga solo esa foto y regenera solo el collage afectado.
- [ ] Un producto ausente de la hoja se desactiva (nunca se borra).
- [ ] La caché de catálogo compacto (`CACHE_CATALOGO`) se invalida al terminar una importación
      exitosa.
- [ ] `--solo-validar` revisa la hoja y confirma que las fotos son accesibles, sin escribir nada.
- [ ] `npm run verify` en verde.
- [ ] Cada escenario de las specs delta de `catalogo` (`IMP#`) y `medios` tiene su test nombrado
      `<id> — <título>` y pasa.
