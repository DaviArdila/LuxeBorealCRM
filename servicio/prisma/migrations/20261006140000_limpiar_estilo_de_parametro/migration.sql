-- Fase 12, T11 (CFG6, EST-D4): el estilo del bot vive en `version_estilo` desde la migración 20261006120000, que copió el
-- vigente y su historial. Se borran las tres claves viejas de `parametro` para que el texto tenga un solo dueño. Los textos
-- `mensaje_*`, `aviso_*` y `politica_*` no se tocan aquí: los retira `npm run casos:sembrar` al copiarlos a casos.
DELETE FROM "parametro" WHERE "clave" IN ('prompt_estilo', 'prompt_estilo_version', 'prompt_estilo_historial');
