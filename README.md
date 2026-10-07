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
| 3. Postgres, Redis y MinIO | `docker compose -f servicio/docker-compose.yml up -d` |
| 4. Tablas | `npm --prefix servicio run prisma:aplicar` |
| 5. Textos del bot (una vez) | `npm --prefix servicio run casos:sembrar` |
| 6. Usuario administrador (una vez) | `npm --prefix servicio run usuario:crear -- --email tu@correo.co --nombre "Tu nombre" --rol admin` |
| 7. La API (puerto 3000) | `npm --prefix servicio run start:dev` |
| 8. El back office | `npm --prefix cliente start` y abre <http://localhost:4200> |

El cliente reenvía `/api` a la API mediante `cliente/proxy.conf.json`.

**Chatwoot (opcional, solo para probar el traspaso a un asesor):**
`bash infra/chatwoot/chatwoot-up.sh` lo levanta (la primera vez genera sus secretos) y
`bash infra/chatwoot/chatwoot-up.sh down` lo apaga.

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
