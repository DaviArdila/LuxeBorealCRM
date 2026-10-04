# Registro de decisiones técnicas (ADR)

Una decisión por archivo, numerada. Un ADR aceptado no se edita: si cambia, se escribe otro que lo
reemplaza y el viejo se marca *reemplazado por NNNN*. Los ADR del prototipo
(`../ChatLuxeCRM/docs/adr/0001-0008`) son antecedentes: se citan como "ADR-00N del prototipo".

| # | Decisión | Estado | Fecha |
|---|---|---|---|
| [0001](0001-monolito-modular-nestjs.md) | Monolito modular en NestJS con fronteras verificadas | aceptada | 2026-09-22 |
| [0002](0002-pasarela-llm.md) | Pasarela de LLM: puerto propio + AI SDK sobre OpenRouter, GPT-5.6 Luna | aceptada | 2026-09-22 |
| [0003](0003-postgres-fuente-de-verdad.md) | Postgres como fuente de verdad del estado de conversación | aceptada | 2026-09-22 |
| [0004](0004-inbox-outbox.md) | Inbox de eventos entrantes y outbox de efectos externos | aceptada | 2026-09-22 |
| [0005](0005-chatwoot-plataforma-de-canales.md) | Chatwoot como plataforma de canales, historial y bandeja | aceptada | 2026-09-22 |
| [0006](0006-un-solo-negocio.md) | Un solo negocio (sin multiempresa) | aceptada | 2026-09-22 |
| [0007](0007-llaves-primarias-uuid-v7.md) | Llaves primarias UUID v7 nativas | aceptada | 2026-09-22 |
| [0008](0008-contrato-api-openapi.md) | Contrato de API: OpenAPI 3.1 code-first con Scalar | aceptada | 2026-09-23 |
| [0009](0009-testcontainers-infraestructura-de-pruebas.md) | Testcontainers como infraestructura única de pruebas | aceptada | 2026-09-23 |
| [0010](0010-documento-openapi-publico-e-interno.md) | Documento OpenAPI público e interno | propuesta | 2026-09-24 |
| [0011](0011-codigos-de-error-rfc9457.md) | Códigos de error estables y forma del cuerpo RFC 9457 | propuesta | 2026-09-24 |
| [0012](0012-minio-almacenamiento-de-objetos.md) | MinIO como almacenamiento de objetos para medios | aceptada | 2026-09-26 |
| [0013](0013-cortacircuitos-en-memoria-pasarela-llm.md) | Circuit breaker de la pasarela LLM en memoria del proceso | aceptada | 2026-09-28 |
| [0014](0014-fallback-llm-iterado-en-gateway.md) | Fallback nivel 1 de la pasarela LLM: iteración en el gateway, no el parámetro server-side de OpenRouter (matiza 0002) | aceptada | 2026-09-28 |
| [0015](0015-importacion-por-archivo-con-exportacion-previa.md) | Carga y edición masiva por archivo (xlsx/CSV) con exportación previa y control de versión | aceptada | 2026-09-29 |
| [0016](0016-composicion-agente-conversaciones.md) | El agente implementa el puerto de conversaciones; AppModule compone los dos módulos | aceptada | 2026-09-29 |
| [0017](0017-historial-agente-redis-por-sesion.md) | Historial corto del agente en Redis, por sesión bot | aceptada | 2026-09-29 |
| [0018](0018-presupuesto-de-tiempo-del-turno.md) | Presupuesto de tiempo del turno del agente: plazo compartido y tope de vueltas | aceptada | 2026-09-29 |
| [0019](0019-proveedores-llm-configurables.md) | Proveedores de LLM configurables: conexión directa (primero OpenAI) además de OpenRouter (matiza 0002 y 0014) | aceptada | 2026-09-30 |
| [0020](0020-estilo-del-agente-editable-desde-la-base-de-datos.md) | El estilo del agente se edita desde la base de datos, con el archivo como respaldo | aceptada | 2026-10-01 |
| [0021](0021-sesion-cookie-redis.md) | Sesión en cookie httpOnly guardada en Redis, no JWT | propuesta | 2026-10-03 |
| [0022](0022-cliente-angular-en-el-repo.md) | Cliente de back office en Angular, dentro de este repo (`cliente/`) (enmienda el doc 06) | propuesta | 2026-10-03 |

## Plantilla

```markdown
# NNNN. Título en una línea

- Estado: propuesta | aceptada | reemplazada por NNNN
- Fecha: YYYY-MM-DD

## Contexto
Qué problema hay, con hechos (archivos, números, síntomas). Sin adjetivos.

## Alternativas
Las opciones reales consideradas, con su costo.

## Decisión
Qué se hace, en presente.

## Consecuencias
Qué gana el proyecto, qué paga, y qué queda prohibido u obligatorio desde ahora.
```
