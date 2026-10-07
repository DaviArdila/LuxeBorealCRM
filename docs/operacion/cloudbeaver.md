# CloudBeaver: ver las bases de desarrollo desde el navegador

**Resumen.** CloudBeaver es un visor web de bases de datos. Corre en un contenedor aparte
(`infra/cloudbeaver/`) y se conecta a los Postgres que ya levantan el servicio y Chatwoot. Solo es
para desarrollo local: escucha en `127.0.0.1` y no forma parte del despliegue.

## Levantarlo

Desde la raíz del repositorio:

```
docker compose -f infra/cloudbeaver/docker-compose.yml up -d
```

Abre <http://localhost:8978>. La primera vez, el asistente pide crear el usuario administrador de
CloudBeaver (es solo de esta herramienta, no del back office). Para otro puerto, define
`LUXE_CLOUDBEAVER_PUERTO_HOST`.

## Conectar las bases

CloudBeaver corre dentro de un contenedor: `localhost` sería él mismo. Usa `host.docker.internal` y
el puerto que cada Compose publica en tu máquina. En **Nueva conexión → PostgreSQL**:

| Base | Host | Puerto | Base de datos | Usuario | Clave |
|---|---|---|---|---|---|
| LuxeBoreal (`servicio/`) | `host.docker.internal` | `5435` | `luxeboreal` | `luxe` | `luxe` |
| Chatwoot (`infra/chatwoot/`) | `host.docker.internal` | `5433` | `chatwoot` | `postgres` | `POSTGRES_PASSWORD` de `infra/chatwoot/.env` |

Los valores de LuxeBoreal son los por defecto de `servicio/docker-compose.yml`; si cambiaste
`LUXE_PG_*` o `LUXE_PG_PUERTO_HOST`, usa los tuyos. La base a la que te conectas tiene que estar
arriba (`docker compose -f servicio/docker-compose.yml up -d postgres`).

Las conexiones y sus claves quedan en el volumen `luxeborealcrm_cloudbeaver_datos`, nunca en el
repositorio. `docker compose -f infra/cloudbeaver/docker-compose.yml down -v` las borra.
