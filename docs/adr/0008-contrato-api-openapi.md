# 0008. Contrato de API: OpenAPI 3.1 code-first con nestjs-zod y Scalar

- Estado: aceptada (2026-09-23)
- Fecha: 2026-09-23

## Contexto

El proyecto expone una API para un cliente de back office independiente (`SPEC.md` §1, punto 4), pero
solo está mencionada, no especificada: `docs/analisis/02-investigacion.md:52` cita
`@nestjs/swagger` y la Fase 14 habla de un "contrato OpenAPI estable", sin convenciones de
versionado, errores, paginación ni auth, sin ADR, y con la documentación arrancando en la Fase 14
aunque hay endpoints desde la Fase 00 (`/health`), la 04 (webhook de Chatwoot), la 09 (admin/kill
switch) y la 11 (auth).

Hay además un conflicto latente de fuente de verdad: el stack usa **zod** para validar
configuración y payloads (`CLAUDE.md` §Stack), pero `@nestjs/swagger` "puro" documenta desde clases
con decoradores (`@ApiProperty`) separadas de los DTO de validación. Sin una decisión, cada endpoint
tendría dos definiciones que se pueden desincronizar: la que valida y la que documenta.

## Alternativas

1. **OpenAPI 3.1 + Swagger UI clásico**: `@nestjs/swagger` con decoradores en clases DTO propias,
   Swagger UI como interfaz. Resuelve la documentación pero mantiene las dos fuentes de verdad
   (DTO de validación en zod + DTO de documentación con decoradores) y no deja evidencia en CI de
   que el contrato publicado sea el que el código realmente expone.
2. **Contrato YAML escrito a mano (contract-first)**: se define `openapi.yaml` primero y el código
   se implementa contra él. Da control total sobre el documento pero es la fuente de verdad más
   fácil de dejar desactualizada: nada obliga a que el código siga el YAML, y con equipo de dos
   personas el costo de mantenerlo a mano en paralelo al código no se paga.
3. **Code-first con `nestjs-zod` + Scalar** (elegida): el esquema zod de cada endpoint es la única
   fuente — valida el payload y genera el fragmento OpenAPI (`createZodDto`,
   `cleanupOpenApiDoc`) — y Scalar sirve ese documento como interfaz de lectura.
4. **Sin contrato formal**: seguir documentando en prosa (como hoy). Se descarta: el cliente de back
   office (Fase 14, `docs/analisis/06-cliente-back-office.md`) necesita un contrato máquina-legible
   para generar su cliente HTTP.

## Decisión

**OpenAPI 3.1, code-first, con `nestjs-zod` como única fuente de validación y documentación por
endpoint**, y Scalar como interfaz de lectura del contrato.

- **Una sola fuente por endpoint**: el esquema zod se envuelve con `createZodDto` (`nestjs-zod`,
  compatible con zod ^3.25 o ^4) y genera a la vez el DTO que Nest valida y el fragmento OpenAPI que
  documenta; `cleanupOpenApiDoc` limpia el documento generado antes de publicarlo. Nadie escribe el
  YAML/JSON de OpenAPI a mano.
- **Interfaz**: Scalar en `/docs` (`@scalar/nestjs-api-reference`, integración oficial para NestJS),
  más legible que Swagger UI sobre el mismo documento. En producción queda detrás de autenticación o
  desactivada; el JSON público nunca expone los endpoints marcados `internal`.
- **Contrato versionado en git**: `openapi/openapi.json` se genera y se commitea. CI regenera el
  documento y falla si difiere del commiteado (ningún cambio de API pasa sin verse en el diff del
  PR), lint con **Spectral** y detección de cambios incompatibles con **oasdiff** contra `main`
  (herramientas candidatas a confirmar y fijar en la Fase 00).
- **Convenciones** (detalladas con escenarios en `openspec/specs/api/spec.md`, resumen aquí):
  - prefijo `/api/v1`; recursos en plural y en español (`/api/v1/ventas`); `operationId` estable por
    operación (el cliente generado de la Fase 14 usa esos nombres);
  - JSON en camelCase; ids UUID; fechas ISO 8601 en UTC; dinero en enteros de pesos colombianos
    (nunca decimales, coherente con la regla de dinero de `luxeboreal-arquitectura` §5);
  - errores en **RFC 9457** (`application/problem+json`) con un código de error propio estable;
  - paginación por cursor + filtros explícitos; nada de endpoints hechos a la medida de una
    pantalla;
  - `Idempotency-Key` obligatorio en los POST que crean ventas o movimientos de inventario
    (sin clave → 400, misma clave con otro contenido → 422, original aún en proceso → 409; retención
    configurable, 24 h por defecto; detalle en `openspec/specs/api/spec.md` API6);
  - autorización por rol (admin/asesor) exigida en el servidor, nunca solo en el cliente; el
    mecanismo de autenticación (tipo de token o sesión) se decide en la Fase 11, no aquí;
  - endpoints internos (webhook de Chatwoot, kill switch) etiquetados `internal` y excluidos del
    documento público.
- **Empieza en la Fase 00, no en la 14**: la Fase 00 deja el pipeline (generación, snapshot, Scalar,
  CI); cada fase que agrega o cambia un endpoint actualiza `openapi/openapi.json` en el mismo commit.
  La Fase 14 pasa a estabilizar la API v1 y probar un cliente generado, no a documentarla por primera
  vez.

## Consecuencias

- Un solo lugar cambia cuando cambia un endpoint: el esquema zod. Elimina la desincronización entre
  validación y documentación.
- CI gana una responsabilidad nueva: regenerar y comparar el contrato, correr Spectral y oasdiff. Si
  esas herramientas fallan o no se fijan bien en la Fase 00, el pipeline bloquea PRs sin motivo real;
  su configuración exacta (reglas de Spectral, umbral de oasdiff) se confirma al cerrar la Fase 00.
- El cliente de back office (Fase 14) puede generarse desde `openapi.json` en vez de escribirse a
  mano contra la API (`docs/analisis/06-cliente-back-office.md`).
- Prohibido: escribir o editar `openapi/openapi.json` a mano; documentar un endpoint con
  `@ApiProperty` en vez del esquema zod; exponer un endpoint `internal` en el documento público;
  Scalar accesible sin protección en producción.
- Pendiente de otra decisión: el mecanismo de autenticación/autorización concreto (Fase 11) y los
  valores exactos de configuración de Spectral/oasdiff (Fase 00).

## Fuentes

- [nestjs-zod — `createZodDto`, `cleanupOpenApiDoc`, compatibilidad zod ^3.25/^4](https://github.com/BenLorantfy/nestjs-zod)
- [`@scalar/nestjs-api-reference` — integración oficial de Scalar para NestJS](https://github.com/scalar/scalar/tree/main/integrations/nestjs)
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [OpenAPI Specification 3.1.0](https://spec.openapis.org/oas/v3.1.0)
- [draft-ietf-httpapi-idempotency-key-header-07 — códigos 400/422/409 y política de expiración (borrador expirado; referencia de práctica)](https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html)
