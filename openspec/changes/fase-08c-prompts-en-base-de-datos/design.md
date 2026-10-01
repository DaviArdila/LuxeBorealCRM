# Design: Fase 08c — El estilo del agente se edita desde la base de datos

- Change: `fase-08c-prompts-en-base-de-datos` · Fecha: 2026-10-01 · Estado: **diseño en revisión**
- Proposal: `proposal.md` · Specs: `agente` (AGT13 modificado; AGT18-AGT22)
- ADRs: [0020](../../../docs/adr/0020-estilo-del-agente-editable-desde-la-base-de-datos.md) (propuesta),
  [0002](../../../docs/adr/0002-pasarela-llm.md) (prefijo estable)

## Technical Approach

Un solo módulo tocado, `agente`, sin módulos ni puertos hacia otros módulos. El estilo deja de salir de
`CargadorPrompts` y pasa a un `ProveedorEstilo` que lee `parametro` con respaldo en el archivo, guarda una copia
en memoria y la invalida con una versión en Redis, igual que el catálogo compacto (CAT4, CAT5). Publicar,
historial y restaurar son casos de uso; el comando `prompt:estilo` es solo una puerta de entrada a ellos (la
pantalla del back office será otra).

```
estilo.v2.md ──(respaldo)──┐
parametro.prompt_estilo ───┼─▶ ProveedorEstilo ─▶ EnsamblarPrompt ─▶ [reglas][estilo][catálogo][turno]
Redis agente:prompt:version ┘     (copia en memoria + versión)

PublicarEstilo / RestaurarEstilo ─▶ validarEstilo ─▶ RepositorioEstilo (parametro) ─▶ INCR agente:prompt:version
```

## Architecture Decisions

### D1: el estilo vive en `parametro`; el historial, en una segunda clave

**Choice**: `prompt_estilo` (texto) y `prompt_estilo_historial` (arreglo `jsonb` de `{ version, texto, fecha }`,
hasta 10). La versión vigente se guarda dentro de una tercera clave `prompt_estilo_version` (entero) para que
`prompt_estilo` siga siendo un texto simple, compatible con el patrón de textos del negocio (AGT3).
**Alternatives**: una sola clave con un objeto (rompe el patrón «un valor que no es texto cae al respaldo»); tabla
nueva (decisión de esquema del dueño, ADR-0020 alternativa B). **Rationale**: sin migración ni cambio de esquema; el
registro tipado de `parametro` (MODELO_DATOS §`parametro`) valida cada clave en código.

### D2: la escritura es atómica

**Choice**: `RepositorioEstilo.publicar` escribe las tres claves en **una** transacción de Prisma
(`prompt_estilo`, historial recortado a 10 y versión + 1). Después incrementa `agente:prompt:version` en Redis. Si
Redis falla tras confirmar la base, el TTL de respaldo (5 min) alcanza a los procesos. **Rationale**: nunca queda
un estilo publicado con un historial que no lo refleja.

### D3: la copia en memoria compara la versión de Redis en cada turno

**Choice**: `ProveedorEstilo.obtener()` lee `agente:prompt:version`; si coincide con la de su copia y no expiró (5
min, por `Clock`), devuelve la copia; si no, lee la base (`prompt_estilo` y su versión) y reemplaza la copia. Si Redis
lanza, lee la base y no guarda la copia con versión (la siguiente llamada reintenta). **Alternatives**: leer la base
cada turno; TTL corto sin Redis (ADR-0020). **Rationale**: es el patrón de `CacheCatalogoRedis` (estado de
instancia, `REDIS_CLIENTE` y `CLOCK` inyectados, nunca `Date.now()`).

### D4: `validarEstilo` es una función pura del dominio

**Choice**: `agente/dominio/validar-estilo.ts` devuelve `{ valido: true } | { valido: false, motivo }` con las reglas
de AGT20 (no vacío, ≤ 4.000, sin pesos, sin `SKU-XXXX`, sin `{{...}}`). Reutiliza `PATRON_PESOS` y el patrón de SKU
de las aserciones/dominio existentes cuando puede. **Rationale**: se prueba sin infraestructura y la usan por igual el
comando y el futuro back office.

### D5: `EnsamblarPrompt` recibe el estilo del proveedor

**Choice**: `CargadorPrompts` conserva `reglas` y `turno` y el archivo `estilo` como respaldo
(`estiloDeRespaldo`); `EnsamblarPrompt` pide el estilo a `ProveedorEstilo` y devuelve también `versionEstilo` para el
log (AGT13). El orden del prompt no cambia. **Rationale**: el ensamblador y las reglas quedan como estaban en la 08b.

### D6: el comando es una puerta de entrada fina

**Choice**: `scripts/prompt-estilo.ts` registrado en `scripts/cli.ts` (como `catalogo:importar`) crea el contexto de
Nest, llama a los casos de uso y escribe a stdout solo versión, origen y motivos de rechazo; **nunca** el texto en
los logs (R14). `ver` sí imprime el texto en la terminal del dueño (no en logs). `publicar` y `restaurar` terminan
recordando la corrida real de evals (EVL3).

## Módulos tocados y dependencias

`agente` (dominio `validar-estilo`, aplicación `ProveedorEstilo`, `PublicarEstilo`, `RestaurarEstilo`,
`ListarHistorialEstilo`, infraestructura `RepositorioEstiloPrisma`, `VersionEstiloRedis`) y `scripts/`. Importa solo
`plataforma/prisma`, `plataforma/redis` y `plataforma/reloj`. Sin eventos de dominio nuevos.

## Configuración nueva

Ninguna. El tope de caracteres, el número de versiones y el TTL de respaldo son constantes de código (resiliencia
técnica, no datos del negocio; R15 no aplica).

## Riesgos de diseño

| Riesgo | Mitigación |
|---|---|
| Dos procesos publican a la vez | La transacción serializa la escritura; la versión sube de a uno y el último gana |
| Un `parametro` editado a mano sin pasar por el caso de uso | La lectura solo exige texto no vacío; el historial puede quedar sin esa versión (documentado en la guía de operación) |
| El texto del estilo termina en un log | Los casos de uso y el comando solo reciben/escriben la versión; revisión explícita en T5 |
