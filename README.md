# LuxeBorealCRM

CRM con atención automatizada por WhatsApp (agente LLM + traspaso a asesor humano en Chatwoot +
leads + inventario y ventas), construido como monolito modular en **NestJS**. Es la reescritura
del prototipo funcional `../ChatLuxeCRM`.

**Estado:** planeación. Ver `docs/fases/README.md`.

## Estructura

| Carpeta | Qué es |
|---|---|
| `servicio/` | El servidor NestJS (API, bot, workers), con su `package.json` y sus dependencias |
| `cliente/` | El back office en Angular con Angular Material, con su `package.json` y sus dependencias |
| `openapi/` | El contrato de la API que une a los dos |
| `infra/` | Sistemas externos (Chatwoot local) y, más adelante, el despliegue |
| `docs/`, `openspec/` | Documentación, decisiones y specs del producto |

Para instalar todo: `npm run instalar`. Para la verificación completa: `npm run ci`. Por qué está así:
[ADR-0023](docs/adr/0023-estructura-servicio-y-cliente.md).

## Levantar todo en local

Hace falta Node 24.15 o más y Docker. Todo se corre desde la raíz del repositorio.

| Paso | Comando |
|---|---|
| 1. Dependencias de las dos apps (una vez) | `npm run instalar` |
| 2. Variables de entorno (una vez) | copia `servicio/.env.example` a `servicio/.env` |
| 3. Postgres, Redis y MinIO | `docker compose -f servicio/docker-compose.yml up -d` y luego `docker compose -f servicio/docker-compose.yml ps` (los tres deben salir `healthy`) |
| 4. Cliente Prisma | `npm --prefix servicio run prisma:generar` (normalmente ya lo hizo el paso 1) |
| 5. Tablas | `npm --prefix servicio run prisma:aplicar` |
| 6. Ciudades y departamentos (una vez) | `npm --prefix servicio run semilla:geografia` |
| 7. Textos del bot (una vez) | `npm --prefix servicio run casos:sembrar` |
| 8. Usuario administrador (una vez) | `npm --prefix servicio run usuario:crear -- --email tu@correo.co --nombre "Tu nombre" --rol admin` |
| 9. La API (puerto 3000) | `npm --prefix servicio run start:dev` |
| 10. El back office | `npm --prefix cliente start` y abre <http://localhost:4200> |

El paso 2 copia el ejemplo solo si `servicio/.env` no existe: si ya existe, no lo pises. Revisa que apunte a
Postgres en el puerto **5435** y a Redis en el **6380**, los que publica el Compose. El paso 8 es interactivo:
pide la contraseña dos veces (mínimo 12 caracteres). Los pasos 6 a 8 solo hacen falta con la base vacía.

El cliente reenvía `/api` a la API mediante `cliente/proxy.conf.json`.

**Los datos y los contenedores.** Los datos viven en volúmenes con nombre (`luxeborealcrm_postgres_datos`,
`luxeborealcrm_redis_datos`, `luxeborealcrm_minio_datos`). Si borras solo los contenedores, al volver a
levantarlos los datos siguen ahí. Si borras también los volúmenes, la base queda vacía y hay que repetir los
pasos 5 a 8. Aquí solo corre en Docker la infraestructura; la API y el cliente corren con Node en tu máquina.
La imagen de producción de la API es trabajo de la Fase 09a (`docs/fases/README.md`).

**Chatwoot (opcional, solo para probar el traspaso a un asesor):**
`bash infra/chatwoot/chatwoot-up.sh` lo levanta (la primera vez genera sus secretos) y
`bash infra/chatwoot/chatwoot-up.sh down` lo apaga. Si borraste su `infra/chatwoot/.env` o sus volúmenes, el
script lo trata como primera vez y te deja tres pasos manuales: crear la cuenta en <http://localhost:3001>,
copiar el token de acceso del perfil y correr `bash infra/chatwoot/chatwoot-bootstrap.sh <token>`.

**Si `npm run instalar` falla con `EALLOWSCRIPTS`:** tu `~/.npmrc` define `allow-scripts` y npm no lo acepta en
instalaciones dentro de un proyecto. No es un fallo del repositorio. Anúlalo solo para esa ejecución con
`npm_config_allow_scripts= npm run instalar`, o quita esa línea de tu `~/.npmrc`.

Detalle de cada pantalla y solución de problemas:
[`docs/operacion/cliente-back-office.md`](docs/operacion/cliente-back-office.md).

## Por dónde empezar

| Si quieres… | Lee |
|---|---|
| Entender qué es y sus reglas | `SPEC.md` |
| Saber en qué fase vamos | `docs/fases/README.md` |
| Entender por qué se reescribe | `docs/analisis/01-analisis-chatluxecrm.md` |
| Ver cómo se hace en la industria y la estrategia de LLM | `docs/analisis/02-investigacion.md` |
| Revisar el modelo de datos | `docs/analisis/03-revision-esquema.md` |
| Saber qué se migra del prototipo | `docs/migracion/inventario.md` |
| Responder decisiones pendientes | `docs/PREGUNTAS_ABIERTAS.md` |
| Trabajar en el código | `CLAUDE.md` y `.claude/skills/` |
