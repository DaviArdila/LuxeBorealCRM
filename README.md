# LuxeBorealCRM

CRM con atención automatizada por WhatsApp (agente LLM + traspaso a asesor humano en Chatwoot +
leads + inventario y ventas), construido como monolito modular en **NestJS**. Es la reescritura
del prototipo funcional `../ChatLuxeCRM`.

**Estado:** planeación. Ver `docs/fases/README.md`.

## Estructura

| Carpeta | Qué es |
|---|---|
| `servicio/` | El servidor NestJS (API, bot, workers), con su `package.json` y sus dependencias |
| `cliente/` | El back office en Angular, con su `package.json` y sus dependencias |
| `openapi/` | El contrato de la API que une a los dos |
| `infra/` | Sistemas externos (Chatwoot local) y, más adelante, el despliegue |
| `docs/`, `openspec/` | Documentación, decisiones y specs del producto |

Para instalar todo: `npm run instalar`. Para la verificación completa: `npm run ci`. Por qué está así:
[ADR-0023](docs/adr/0023-estructura-servicio-y-cliente.md).

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
