# Delta for Plataforma

## MODIFIED Requirements

### Requirement: PLT7 — `npm run verify` como puerta de verificación local

El sistema MUST proveer el comando `npm run verify`, que MUST ejecutar, en un solo paso: lint,
verificación de tipos (`typecheck`), verificación de fronteras (`dependency-cruiser`), las pruebas
unitarias e de integración del proyecto, y la verificación de deriva del contrato de API: **ambos**
documentos commiteados, `openapi/openapi.json` (público) y `openapi/openapi.interno.json` (interno),
regenerados MUST coincidir con lo commiteado (API1, ADR-0010). Comparar solo el documento público no
basta — hoy nace con `paths: {}` porque no hay endpoints de negocio y `/health` queda excluido de él
(API8), así que un cambio en `/health` sin regenerar el contrato no sería detectable comparando
únicamente ese archivo; el documento interno sí contiene `/health` y hace la deriva observable desde
el primer commit de la fase. `npm run verify` MUST terminar en verde solo si las seis comprobaciones
pasan, y MUST fallar si cualquiera de ellas falla.
La detección de secretos (`gitleaks`), la validación del mensaje de commit (`commitlint`) y la
auditoría de dependencias (`npm audit`) MUST NOT formar parte de `npm run verify`: dependen del estado
de git o del registro de npm, no del código construido, y viven en el hook pre-push y en el workflow
de CI (`openspec/specs/integracion-continua/spec.md`, CI1-CI4). `npm run verify` MUST completarse en
menos de 3 minutos en un entorno de desarrollo local con Postgres y Redis ya arriba.

(Previously: exigía cinco comprobaciones — lint, typecheck, fronteras, tests unitarios e integración —
sin la verificación de deriva del contrato de API, que no existía hasta la Fase 00b.)

Fase que lo implementa: 00a (cinco comprobaciones originales), 00b (sexta comprobación: deriva del
contrato)

#### Scenario: `npm run verify` en verde ejecuta las seis comprobaciones

- Dado un estado del código en el que lint, typecheck, fronteras, tests unitarios, tests de
  integración y la verificación de deriva del contrato de API pasan,
- Cuando se ejecuta `npm run verify`,
- Entonces el comando termina en verde y reporta el resultado de las seis comprobaciones, en menos de
  3 minutos.

#### Scenario: Un fallo en cualquier comprobación hace fallar `npm run verify`

- Dado un estado del código en el que una de las seis comprobaciones (lint, typecheck, fronteras,
  tests unitarios, tests de integración, deriva del contrato) falla,
- Cuando se ejecuta `npm run verify`,
- Entonces el comando termina en rojo y señala cuál comprobación falló.

#### Scenario: Un endpoint modificado sin regenerar el contrato hace fallar `npm run verify`

- Dado que un commit cambia un endpoint pero no regenera `openapi/openapi.json` ni
  `openapi/openapi.interno.json`,
- Cuando se ejecuta `npm run verify`,
- Entonces la comprobación de deriva del contrato falla y señala cuál de los dos documentos generados
  no coincide con el commiteado.

#### Scenario: Un cambio en `/health` sin regenerar el contrato se detecta aunque el documento público esté vacío

- Dado que el documento público (`openapi/openapi.json`) nace con `paths: {}` porque no hay endpoints
  de negocio y `GET /health` queda excluido de él (API8),
- Cuando un commit cambia la respuesta documentada de `GET /health` sin regenerar el contrato,
- Entonces la comprobación de deriva falla comparando `openapi/openapi.interno.json` (que sí contiene
  `/health`) contra lo commiteado, y no queda enmascarada por comparar solo el documento público.

#### Scenario: `gitleaks`, `commitlint` y `npm audit` no forman parte de `npm run verify`

- Dado el comando `npm run verify` en un repositorio con un secreto sin commitear detectable por
  `gitleaks`, un mensaje de commit no convencional en el historial, o una dependencia vulnerable por
  debajo del umbral,
- Cuando se ejecuta `npm run verify`,
- Entonces ninguna de esas tres condiciones afecta su resultado, porque esas comprobaciones corren en
  el hook pre-push y en el workflow de CI, no en `verify`.
