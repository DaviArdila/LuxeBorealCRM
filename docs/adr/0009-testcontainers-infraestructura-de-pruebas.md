# 0009. Testcontainers como infraestructura única de pruebas

- Estado: aceptada
- Fecha: 2026-09-23

## Contexto

Las pruebas de integración y e2e necesitan Postgres 16 y Redis 7 reales (A12: sin mocks de
infraestructura). CI (Fase 00b) usa Testcontainers. En la máquina de desarrollo ya hay un Postgres
nativo en 5432 y el Postgres del Chatwoot del prototipo en 5433.

## Alternativas

1. Servicios de Docker Compose levantados a mano antes de probar: rápido, pero paso manual, datos
   compartidos con desarrollo y distinto de CI.
2. Compose en local y Testcontainers en CI: dos mecanismos que mantener.
3. Testcontainers en local y en CI (elegida): contenedores limpios por corrida, puertos efímeros,
   ~10-20 s de arranque.

## Decisión

Las pruebas de integración y e2e levantan sus contenedores con Testcontainers desde un `globalSetup`
de Vitest (`test/soporte/contenedores.global-setup.ts`, proyectos `integracion` y `e2e` de
`vitest.config.ts`). Docker Compose queda solo para desarrollo manual (`npm run start:dev`). El
aislamiento por worker (base por worker, prefijo de claves de Redis) se construye sobre ese mismo
arnés en la Fase 01.

Implementado en la Fase 00a (T8, T9): `testcontainers` + `@testcontainers/postgresql` +
`@testcontainers/redis` levantan Postgres 16 y Redis 7 una sola vez por corrida de cada proyecto;
`test/soporte/infraestructura.ts` entrega la URL de administración de cada contenedor a los tests.
`npm run verify` corre con este mecanismo en menos de 3 minutos, con Docker Desktop activo.

## Consecuencias

- `npm run verify` y CI usan el mismo mecanismo; Docker MUST estar corriendo para probar.
- No hay choque de puertos con otros servicios de la máquina.
- Prohibido: pruebas que dependan de servicios levantados a mano o de datos del entorno de desarrollo.
