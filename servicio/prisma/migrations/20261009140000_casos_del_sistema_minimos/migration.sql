-- Fase 12d, T7 (CAS14, pasos 2 y 3) — migración de datos escrita a mano ([manual]: Prisma no genera sentencias de datos).
--
-- La lista cerrada de casos del sistema queda en cinco (CAS4). Esta migración retira de la base los tres que salen:
--   (2) `aviso_datos` pasa a ser el caso de intención «Tratamiento de datos» (CAS13), conservando el texto que el dueño
--       editó; si ese título ya existe (la semilla de T5 lo crea copiando este mismo texto) la fila de sistema se borra.
--   (3) `mensaje_handoff` y `mensaje_handoff_fuera_horario` se borran: el aviso al cliente ya no lo escribe un texto fijo.
-- `mensaje_espera_handoff` NO se renombra: las bases existentes conservan el título guardado.
--
-- El paso (1) —los tres casos que pasan a intención— es la migración 20261009130000_casos_a_intencion.
--
-- La clave y el disparador cambian en la MISMA sentencia: el CHECK `caso_asistente_evento_requiere_sistema_check`
-- (20261006130000_asistente_casos) exige clave del sistema a todo caso de disparador `evento`.
--
-- El «cuándo aplica», el modo y la categoría son los mismos que la semilla (`CASOS_INICIALES_DE_INTENCION`,
-- asistente/dominio/semilla.ts) da a «Tratamiento de datos»; la categoría «Políticas» solo si existe. La búsqueda se
-- recalcula con el algoritmo de `normalizarTexto` (minúsculas, NFD, sin marcas combinantes, espacios colapsados, recorte).
-- Es idempotente: tras la primera corrida ninguna fila cumple los WHERE.

-- (2a) El título ya existe: se borra la fila de sistema; el caso existente no se toca.
DELETE FROM "caso_asistente"
WHERE "clave_sistema" = 'aviso_datos'
  AND EXISTS (SELECT 1 FROM "caso_asistente" WHERE "titulo_normalizado" = 'tratamiento de datos');

-- (2b) El título está libre: se convierte la fila conservando su texto.
UPDATE "caso_asistente"
SET "clave_sistema" = NULL,
    "disparador" = 'intencion',
    "modo" = 'guia',
    "titulo" = 'Tratamiento de datos',
    "titulo_normalizado" = 'tratamiento de datos',
    "cuando_aplica" = 'Cuando el bot va a tomar datos de despacho o a registrar el interés de compra y el cliente aún no aceptó el tratamiento de datos (consentimiento pendiente).',
    "busqueda_normalizada" = btrim(regexp_replace(regexp_replace(normalize(lower(
        'Tratamiento de datos Cuando el bot va a tomar datos de despacho o a registrar el interés de compra y el cliente aún no aceptó el tratamiento de datos (consentimiento pendiente). ' || "texto"
      ), NFD), '[\u0300-\u036f]', '', 'g'), '\s+', ' ', 'g')),
    "categoria_id" = COALESCE((SELECT "id" FROM "categoria_caso" WHERE "nombre_normalizado" = 'politicas'), "categoria_id"),
    "actualizado" = CURRENT_TIMESTAMP
WHERE "clave_sistema" = 'aviso_datos';

-- (3) Los dos traspasos se borran.
DELETE FROM "caso_asistente" WHERE "clave_sistema" IN ('mensaje_handoff', 'mensaje_handoff_fuera_horario');
