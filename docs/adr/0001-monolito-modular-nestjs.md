# 0001. Monolito modular en NestJS con fronteras verificadas

- Estado: aceptada (2026-09-23)
- Fecha: 2026-09-22

## Contexto

El prototipo (Express, un proceso) organiza el código por feature y documenta capas en
`docs/ARQUITECTURA.md`, pero nada las hace cumplir: hay dependencias en ambos sentidos
(`estado → queue → chatwoot`, `motor → queue/connection`), singletons creados al importar y selección
de implementaciones por variables `MOCK_*` (antipatrones A1-A3 de `docs/analisis/01`). El sistema va
a crecer con inventario, ventas, envíos y una API para el back office. El equipo son dos personas y
el presupuesto de infraestructura es ≤ 20 USD/mes en un solo VPS.

## Alternativas

1. **Mantener Express y ordenar a mano** — sin dependencia nueva, pero hay que construir DI, ciclo de
   vida y módulos a mano.
2. **Microservicios** — aislamiento fuerte, pero multiplica despliegue, observabilidad y RAM; no se
   justifica con este volumen ni equipo.
3. **Monolito modular en NestJS** — un proceso y un despliegue; módulos con API pública explícita,
   DI, ciclo de vida, integraciones oficiales con BullMQ, schedule, config, terminus.

## Decisión

Monolito modular en NestJS (11 originalmente; enmendado a 12 el 2026-09-23, ver "Enmienda" abajo).
Módulos por contexto de negocio con estructura
`dominio / aplicacion / puertos / infraestructura / interfaz` según necesidad (skill
`luxeboreal-arquitectura`). Las fronteras se verifican en CI con una herramienta de reglas de
dependencias. Los módulos se comunican por casos de uso exportados (consultas) y eventos de dominio
(hechos).

## Consecuencias

- Tests de dominio sin infraestructura; integración con `overrideProvider`.
- Extraer un módulo a servicio aparte en el futuro es posible sin reescribir su dominio.
- Costo: curva de NestJS (decoradores, módulos) y algo de ceremonia en módulos pequeños.
- Prohibido: `process.env` fuera de `plataforma/config`, conexiones abiertas al importar, imports a
  rutas internas de otro módulo, `if (MOCK_…)` en código de producción.

## Enmienda (2026-09-23)

- **Cambio**: NestJS 12 en vez de NestJS 11.
- **Motivo**: verificación en fuente primaria — dist-tags de `@nestjs/core` en npm: `latest =
  12.1.0`, `legacy = 11.2.6` (https://registry.npmjs.org/@nestjs/core). La 11 quedó como legacy; no
  se justifica arrancar un proyecto nuevo sobre una mayor ya retirada de `latest`.
- **Condición (verificación con fallback)**: la primera tarea de la Fase 00a verifica la
  compatibilidad con NestJS 12 de las dependencias clave (`nestjs-zod`, `nestjs-pino`,
  `@nestjs/terminus`, `@nestjs/bullmq`, `@nestjs/swagger`, `@scalar/nestjs-api-reference`). Si
  alguna falla, se retrocede a NestJS 11 y se registra el motivo en el change de la fase.
- Decisión del usuario, 2026-09-23. Estado de este ADR sigue `aceptada`; esta sección se agrega sin
  borrar el razonamiento original de la Decisión.

### Verificación de tarea 1 (2026-09-23) — hallazgo resuelto

La tarea 1 de `openspec/changes/fase-00a-esqueleto/` ejecutó la verificación condicionada arriba
(detalle completo, versiones exactas y evidencia por paquete en la tabla "Registro de compatibilidad"
de `design.md`, D15). Resultado:

- `@nestjs/core`/`common`/`platform-express`/`testing` (`12.1.0`), `@nestjs/terminus` (`12.1.0`),
  `nestjs-pino` (`5.2.0`), `@nestjs/swagger` (`12.0.2`), `@nestjs/bullmq` (`12.0.0`) y
  `@scalar/nestjs-api-reference` (`1.2.21`) resuelven contra NestJS 12 sin excluir `^12` en su rango
  de `peerDependencies`. Instalación real (`npm install`, sin `--legacy-peer-deps`/`--force`/
  `overrides`) de los paquetes que integra 00a terminó sin `ERESOLVE`. Node 24.19.0 (instalado en la
  máquina de desarrollo) cumple los `engines` de las cinco dependencias que los declaran.
- `nestjs-zod@5.5.0` (única versión estable publicada al 2026-09-23) declara
  `peerDependencies.@nestjs/common: "^10.0.0 || ^11.0.0"` — **excluye `^12`**. Esto cumplía
  literalmente el criterio de falla de D15 ("el rango de `peerDependencies` excluye `^12`") para una
  de las dependencias nombradas como "clave" arriba.

**Por qué esto no disparó el fallback a NestJS 11**: `nestjs-zod` es exclusivamente una dependencia de
la Fase 00b (pipeline OpenAPI) — 00a nunca la instala. Retroceder **todo** el monolito a NestJS 11
(afectando T2-T10 de 00a, ya diseñadas sobre NestJS 12) por una dependencia que 00a ni siquiera usa era
una decisión con alternativas reales, reservada al usuario (`CLAUDE.md`, "Cómo se trabaja").

**Decisión del usuario (2026-09-23)**: no se ejecuta el fallback a NestJS 11 y se descarta `nestjs-zod`
por completo (no solo se difiere a 00b). NestJS 12 confirma soporte **nativo** de Standard Schema:
`StandardSchemaValidationPipe` acepta esquemas Zod directamente en `@Body()`/`@Query()`/`@Param()`/
`@RawBody()` sin ningún paquete de terceros, y `@nestjs/swagger` (también 12.x) convierte esos mismos
esquemas Zod a OpenAPI cuando Zod implementa la extensión `~standard.jsonSchema` (Zod ≥4.2; la versión
instalada es 4.6.5). Fuentes: <https://docs.nestjs.com/techniques/validation>,
<https://github.com/nestjs/nest/releases/tag/v12.0.0> y la documentación de OpenAPI de NestJS sobre
Standard Schema. El resto de "dependencias clave" (`@nestjs/core`/`common`/`platform-express`/
`testing`/`terminus`, `nestjs-pino`, `@nestjs/swagger`, `@scalar/nestjs-api-reference`,
`@nestjs/bullmq`) ya habían resuelto limpio contra `^12` (fila anterior). Detalle del mecanismo nativo
y su alcance en el contrato de API: enmienda 2026-09-23 de `docs/adr/0008-contrato-api-openapi.md`.

**Estado**: resuelto. T2-T10 de la Fase 00a proceden bajo NestJS 12, sin fallback a NestJS 11.
