-- Fase 12d, T6 (CAS14, paso 1) — migración de datos escrita a mano ([manual]: Prisma no genera sentencias de datos).
--
-- `contra_entrega`, `mensaje_fuera_cobertura` y `mensaje_captura_completa` dejan de ser casos del sistema: pasan a casos de
-- intención normales, editables y borrables, conservando título, texto, «cuándo aplica» y fecha de creación del dueño.
-- El código ya no los lee ni los siembra; el modelo los consulta con `consultar_caso` si existen (CAS12).
--
-- La clave y el disparador cambian en la MISMA sentencia: el CHECK `caso_asistente_evento_requiere_sistema_check`
-- (20261006130000_asistente_casos) exige clave del sistema a todo caso de disparador `evento`, así que quitar la clave sin
-- cambiar el disparador lo violaría. `contra_entrega` ya era de intención y solo pierde la clave.
--
-- Los casos convertidos se mueven a «Políticas» solo si esa categoría existe; si no, conservan la suya. Es idempotente:
-- tras la primera corrida ninguna fila cumple el WHERE. Los pasos (2) `aviso_datos` y (3) los dos traspasos son de T7.
UPDATE "caso_asistente"
SET "clave_sistema" = NULL,
    "disparador" = 'intencion',
    "actualizado" = CURRENT_TIMESTAMP,
    "categoria_id" = COALESCE((SELECT "id" FROM "categoria_caso" WHERE "nombre_normalizado" = 'politicas'), "categoria_id")
WHERE "clave_sistema" IN ('mensaje_fuera_cobertura', 'mensaje_captura_completa', 'contra_entrega');
