# Delta for Integración continua

## ADDED Requirements

### Requirement: CI10 — La secuencia de CI incluye el cliente de back office

`npm run ci` (CI5) MUST incluir, después de los pasos del servidor, los del cliente en `cliente/`: instalación con
`npm ci`, lint, tests, build de producción, auditoría de dependencias con el mismo umbral `high` de CI4 y la
verificación de deriva del cliente HTTP generado (CLT2). El workflow de GitHub Actions MUST seguir invocando solo
`npm run ci`, sin redefinir los pasos. `npm run fronteras` (`dependency-cruiser`) MUST seguir cruzando solo `src/` y
`scripts/`, y el lint de la raíz MUST ignorar `cliente/`, que tiene su propia configuración. El hook `pre-push`
(`ci:hook`) MUST NOT incluir el build del cliente, para seguir siendo rápido.

Fase que lo implementa: 11b

#### Scenario: `npm run ci` corre los pasos del cliente

- Dado el repositorio con `cliente/`,
- Cuando se ejecuta `npm run ci`,
- Entonces, además de los pasos de CI5, corren lint, tests, build, auditoría y deriva del cliente, y un fallo de
  cualquiera hace fallar el comando.

#### Scenario: Un test roto del cliente hace fallar la CI

- Dado un test del cliente que falla,
- Cuando se ejecuta `npm run ci`,
- Entonces el comando termina con error y nombra el paso del cliente que falló.

#### Scenario: Las fronteras del servidor no recorren el cliente

- Dado el repositorio con `cliente/`,
- Cuando se ejecuta `npm run fronteras`,
- Entonces `dependency-cruiser` analiza solo `src/` y `scripts/`.
