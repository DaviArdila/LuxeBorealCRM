# Datos de desarrollo

> **Datos de prueba.** Productos, precios, tarifas, cobertura y políticas son inventados para
> probar el bot. No son un catálogo real ni una oferta. No cargar contra una base de producción.

## Qué hay

`catalogo/` es un directorio completo para `npm run catalogo:importar -- --dir`.

| Archivo | Contenido |
|---|---|
| `productos.csv` | 17 productos en 5 categorías (16 activos con 1-2 fotos, 1 inactivo sin fotos) |
| `tarifas.csv` | Bogotá, Medellín, Cali, Atlántico, Santander, Cartagena (sin contra entrega) y tarifa nacional |
| `cobertura.csv` | Sin cobertura: Amazonas, San Andrés, Vaupés, Guainía, Vichada, Chocó y Turbo (Antioquia) |
| `parametros.csv` | Horario, recargo y factor volumétrico (los textos ya no van aquí: el importador los rechaza) |
| `../asistente/casos.json` | 3 casos de intención de ejemplo (devoluciones, garantía, instalación) para `npm run casos:sembrar -- --archivo datos-desarrollo/asistente/casos.json` |
| `excepciones_horario.csv` | Festivos de oct-dic 2026 |
| `complemento.sql` | Categorías y stock (el importador no los carga; ver abajo) |
| `ATRIBUCIONES.md` | Autor y licencia de cada foto |

Categorías: Grifería de lavamanos, Grifería de cocina, Regaderas y duchas, Sanitarios, Accesorios y
sifones. El prefijo del SKU indica la categoría (`GL`, `GC`, `RD`, `SN`, `AS`).

## Cargar

Con Postgres, Redis y MinIO arriba (`docker compose up -d`) y sin más pasos previos:

```bash
npm run catalogo:importar -- --dir datos-desarrollo/catalogo
docker exec -i luxeborealcrm-postgres-1 psql -U luxe -d luxeboreal < datos-desarrollo/catalogo/complemento.sql
```

- Re-ejecutar ambos comandos no duplica nada (el importador hace upsert por SKU; el SQL es idempotente).
- Importar desactiva los productos que no estén en `productos.csv` (comportamiento normal, IMP11).
- Para validar sin escribir: añade `--solo-validar`.

## Las fotos

Las fotos no están en el repositorio. Cada enlace de la columna `fotos` apunta a un archivo libre de
Wikimedia Commons; el importador lo descarga, lo redimensiona y lo sube a MinIO. Hace falta internet
al importar. Autor y licencia de cada una: `catalogo/ATRIBUCIONES.md`.

Para usar tus propias fotos, cambia los enlaces de `fotos` por enlaces `http(s)` (varios separados por `;`).
La columna opcional `fotos_angulos` dice qué muestra cada foto, en el mismo orden y separada por `;`:
`frente`, `lateral_izquierdo`, `lateral_derecho`, `detalle` o `uso` (vacío = sin etiquetar).

## Por qué `complemento.sql`

El importador no lee categoría ni stock (la tabla `categoria_producto` existe, pero el formato de
importación no la alimenta). El SQL los asigna sin tocar el esquema; el stock entra con su movimiento de
ledger `semilla de desarrollo`. Las categorías usan `gen_random_uuid()` (v4), no UUID v7: basta para
pruebas.
