# 0001. Monolito modular en NestJS con fronteras verificadas

- Estado: propuesta
- Fecha: 2026-09-22

## Contexto

El prototipo (Express, un proceso) organiza el código por feature y documenta capas en
`docs/ARQUITECTURA.md`, pero nada las hace cumplir: hay dependencias en ambos sentidos
(`estado → queue → chatwoot`, `motor → queue/connection`), singletons creados al importar y selección
de implementaciones por variables `MOCK_*` (antipatrones A1-A3 de `docs/analisis/01`). El sistema va
a crecer con inventario, ventas, envíos y una API para el back office. El equipo son dos personas y
el presupuesto de infraestructura es ≤ 20 USD/mes en un solo VPS.

## Alternativas

1. **Mantener Express y ordenar a mano** — sin dependencia nueva, pero hay que construir DI, ciclo de
   vida y módulos a mano.
2. **Microservicios** — aislamiento fuerte, pero multiplica despliegue, observabilidad y RAM; no se
   justifica con este volumen ni equipo.
3. **Monolito modular en NestJS** — un proceso y un despliegue; módulos con API pública explícita,
   DI, ciclo de vida, integraciones oficiales con BullMQ, schedule, config, terminus.

## Decisión

Monolito modular en NestJS 11. Módulos por contexto de negocio con estructura
`dominio / aplicacion / puertos / infraestructura / interfaz` según necesidad (skill
`luxeboreal-arquitectura`). Las fronteras se verifican en CI con una herramienta de reglas de
dependencias. Los módulos se comunican por casos de uso exportados (consultas) y eventos de dominio
(hechos).

## Consecuencias

- Tests de dominio sin infraestructura; integración con `overrideProvider`.
- Extraer un módulo a servicio aparte en el futuro es posible sin reescribir su dominio.
- Costo: curva de NestJS (decoradores, módulos) y algo de ceremonia en módulos pequeños.
- Prohibido: `process.env` fuera de `plataforma/config`, conexiones abiertas al importar, imports a
  rutas internas de otro módulo, `if (MOCK_…)` en código de producción.
