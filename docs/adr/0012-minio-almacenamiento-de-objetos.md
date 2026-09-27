# 0012. MinIO como almacenamiento de objetos para medios

- Estado: aceptada (2026-09-26)
- Fecha: 2026-09-26

## Contexto

El prototipo guarda las fotos y el collage de cada producto en disco local (`data/media/`),
antipatrón A14 (`docs/analisis/01-analisis-chatluxecrm.md`): impide correr más de una instancia y
ata el dato a la máquina donde corrió el importador. `MODELO_DATOS.md` §3 ya corrigió el esquema
para no asumirlo (`foto.clave_archivo`, `producto.clave_collage`: clave de objeto, no ruta de
filesystem), pero ningún ADR, `CLAUDE.md`, `docker-compose.yml` ni pregunta de
`docs/PREGUNTAS_ABIERTAS.md` había fijado **qué** backend de almacenamiento de objetos usar. La
Fase 03 (Importador y medios) necesita esa decisión antes de construir el puerto `Almacenamiento`
(nombre ya anticipado por `docs/migracion/inventario.md`, fila del importador).

## Alternativas

1. **MinIO self-hosted**: contenedor en `docker-compose.yml` (desarrollo) y en el mismo VPS de
   Dokploy (producción, Fase 09). API S3-compatible (`@aws-sdk/client-s3` sirve igual). Sin costo de
   terceros; el usuario administra backup y disco del volumen.
2. **Cloudflare R2**: gratis hasta cierto volumen, sin costo de egress, API S3-compatible. Requiere
   cuenta de Cloudflare y credenciales en `.env` desde el primer día, incluido en desarrollo (o un
   segundo backend solo para dev, lo que duplica configuración).
3. **AWS S3**: estándar de la industria, pero cobra egress y es el único de los tres que no encaja
   con el resto del stack, todo self-hosted en el VPS de Dokploy (Postgres, Redis, Chatwoot).

## Decisión

**MinIO self-hosted**, detrás de un puerto propio `Almacenamiento` (interfaz mínima: `guardar`,
`obtenerUrl`, `eliminar`, sobre claves de objeto, nunca rutas de filesystem). Un solo backend en
desarrollo y producción, sin distinguir por entorno: el mismo contenedor MinIO se agrega a
`docker-compose.yml` en esta fase, y su despliegue en el VPS de Dokploy se resuelve en la Fase 09
como el resto de la infraestructura de producción (Postgres, Redis, Chatwoot ya siguen ese patrón).
El SDK usado (S3-compatible) permite migrar a R2 o S3 después sin tocar el dominio si el volumen o
el costo de egress lo justifican — la decisión no es irreversible, solo evita bloquear la Fase 03
con una cuenta de un proveedor externo.

## Consecuencias

- `docker-compose.yml` gana un servicio `minio` (Fase 03); su volumen de datos sigue el mismo patrón
  que el de Postgres.
- El puerto `Almacenamiento` es la única superficie que el resto del código ve; ningún módulo importa
  el SDK de MinIO/S3 directamente fuera de su adaptador.
- Producción (Fase 09) decide si MinIO corre en el mismo VPS de Dokploy o se sustituye por R2/S3 en
  ese momento, sin que esto obligue a reescribir el dominio (el puerto ya abstrae el backend).
- Costo: el usuario administra backup y espacio en disco de MinIO en producción; no hay factura de
  egress mientras se quede en self-hosted.

## Implementado en la Fase 03

Implementado en T5 (2026-09-26) con un hallazgo real no anticipado por esta decisión: la imagen
`minio/minio` ya no está disponible en Docker Hub sin autenticación (MinIO retiró su distribución
gratuita en 2025). `docker-compose.yml` y `test/soporte/contenedores.global-setup.ts` usan en su
lugar `bitnamilegacy/minio:latest` (distribución congelada de Bitnami, gratuita, mismo binario
`minio`), aprobada por el usuario al cerrar la fase. Corre como usuario no-root `1001`, con volumen
en `/bitnami/minio/data` (no `/data`) — documentado con comentarios en ambos archivos. El puerto
`Almacenamiento` (`guardar`/`obtenerUrl`/`eliminar`) y la ausencia de URLs firmadas quedaron
implementados exactamente como los fijó esta decisión, sin cambios. Antes del despliegue de
producción (Fase 09), reconfirmar que `bitnamilegacy/minio` sigue publicada y estable, o migrar a
otra imagen/backend sin tocar el dominio (el puerto ya abstrae el backend, como anticipa la
Decisión).
