-- Complemento de la semilla de catálogo (solo desarrollo). El importador (`catalogo:importar`) no
-- carga categoría ni stock; este archivo los asigna DESPUÉS de importar. Es idempotente: se puede
-- aplicar varias veces y sobrevive a re-importaciones (el upsert del importador no toca estas
-- columnas). Datos de prueba: no usar contra una base real.
--
--   docker exec -i luxeborealcrm-postgres-1 psql -U luxe -d luxeboreal \
--     < datos-desarrollo/catalogo/complemento.sql

BEGIN;

INSERT INTO categoria_producto (id, nombre, orden)
SELECT gen_random_uuid(), v.nombre, v.orden
FROM (VALUES
  ('Grifería de lavamanos', 1),
  ('Grifería de cocina', 2),
  ('Regaderas y duchas', 3),
  ('Sanitarios', 4),
  ('Accesorios y sifones', 5)
) AS v(nombre, orden)
ON CONFLICT (nombre) DO NOTHING;

UPDATE producto p
SET categoria_id = c.id
FROM (VALUES
  ('SKU-GL001', 'Grifería de lavamanos'),
  ('SKU-GL002', 'Grifería de lavamanos'),
  ('SKU-GC001', 'Grifería de cocina'),
  ('SKU-GC002', 'Grifería de cocina'),
  ('SKU-GC003', 'Grifería de cocina'),
  ('SKU-RD001', 'Regaderas y duchas'),
  ('SKU-RD002', 'Regaderas y duchas'),
  ('SKU-RD003', 'Regaderas y duchas'),
  ('SKU-RD004', 'Regaderas y duchas'),
  ('SKU-SN001', 'Sanitarios'),
  ('SKU-SN002', 'Sanitarios'),
  ('SKU-SN003', 'Sanitarios'),
  ('SKU-AS001', 'Accesorios y sifones'),
  ('SKU-AS002', 'Accesorios y sifones'),
  ('SKU-AS003', 'Accesorios y sifones'),
  ('SKU-AS004', 'Accesorios y sifones'),
  ('SKU-AS005', 'Accesorios y sifones')
) AS m(sku, categoria)
JOIN categoria_producto c ON c.nombre = m.categoria
WHERE p.sku = m.sku;

-- Stock inicial con su entrada en el ledger (el ledger es la verdad; producto.stock es caché,
-- MODELO_DATOS.md §6). Solo se inserta la entrada si el producto aún no tiene la de la semilla.
WITH inicial(sku, cantidad, minimo) AS (VALUES
  ('SKU-GL001', 25, 5), ('SKU-GL002', 40, 8), ('SKU-GC001', 18, 4), ('SKU-GC002', 12, 3),
  ('SKU-GC003', 20, 4), ('SKU-RD001', 60, 10), ('SKU-RD002', 30, 6), ('SKU-RD003', 8, 2),
  ('SKU-RD004', 45, 8), ('SKU-SN001', 10, 2), ('SKU-SN002', 6, 2), ('SKU-SN003', 7, 2),
  ('SKU-AS001', 80, 15), ('SKU-AS002', 14, 3), ('SKU-AS003', 50, 10), ('SKU-AS004', 35, 6)
), nuevos AS (
  INSERT INTO movimiento_inventario (id, producto_id, tipo, cantidad, saldo_despues, motivo, origen)
  SELECT gen_random_uuid(), p.id, 'entrada', i.cantidad, i.cantidad, 'semilla de desarrollo', 'sistema'
  FROM inicial i
  JOIN producto p ON p.sku = i.sku
  WHERE NOT EXISTS (
    SELECT 1 FROM movimiento_inventario m
    WHERE m.producto_id = p.id AND m.motivo = 'semilla de desarrollo'
  )
  RETURNING producto_id, saldo_despues
)
UPDATE producto p
SET stock = n.saldo_despues,
    stock_minimo = i.minimo
FROM nuevos n
JOIN inicial i ON TRUE
WHERE p.id = n.producto_id
  AND p.sku = i.sku;

COMMIT;
