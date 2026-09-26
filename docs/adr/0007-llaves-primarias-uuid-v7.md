# 0007. Llaves primarias UUID v7 nativas

- Estado: aceptada (2026-09-23)
- Fecha: 2026-09-22

## Contexto

El prototipo usa `cuid()` guardado como `text` en casi todas las tablas y el teléfono como PK de
`contacto`. El usuario pidió quitar el teléfono como PK y prefiere UUID.

## Alternativas

1. `cuid()` en `text` (como el prototipo): funciona, pero ocupa más y no es tipo nativo.
2. Enteros autoincrementales: compactos, pero exponen conteos ("pedido 3") y dependen de la base.
3. UUID v4: nativo y aleatorio; los índices se fragmentan con inserciones aleatorias.
4. UUID v7: nativo (16 bytes), ordenado por tiempo de creación.

## Decisión

- **UUID v7**, tipo `uuid` de Postgres (`@db.Uuid`), generado por Prisma (`@default(uuid(7))`); si
  la versión de Prisma fijada en la Fase 00a (`schema.prisma` mínimo) no lo soporta, se genera en la aplicación.
- **Excepciones con llave natural**: `departamento.id` y `ciudad.id` (códigos DANE),
  `parametro.clave`.
- **Consecutivo legible aparte** donde una persona lo dice en voz alta: `venta.numero`.

## Consecuencias

- Índices compactos e inserciones al final (como un serial), sin exponer volumen de negocio.
- Los ids se pueden generar antes de insertar (útil para outbox y eventos).
- Costo: 16 bytes por id frente a 4-8 de un entero; irrelevante a este volumen.
- El orden por id equivale aproximadamente al orden de creación; no se usa como reemplazo de
  `creado`.

## Implementado en la Fase 01

Confirmado en ejecución (T2, 2026-09-25), no solo de forma estática: Prisma 7.10.0 acepta
`@default(uuid(7)) @db.Uuid`, la migración generada no trae `DEFAULT` en la columna `id`, y un
`create()` real por `PrismaService` devuelve un id con el nibble de versión `7`. No hizo falta el
plan B (generación del id en la aplicación).
