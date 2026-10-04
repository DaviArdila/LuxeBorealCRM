# Integración Continua — Specification

## Purpose

Gobierna la puerta de calidad automatizada del repositorio, observable desde fuera del código: qué se
comprueba antes de empujar un commit (hook pre-push), qué se comprueba en el servidor (workflow de
GitHub Actions), qué condiciones hacen fallar el build, y cómo se genera `CHANGELOG.md`. La secuencia
completa de comprobaciones vive en una única definición (`npm run ci`, ADR-0008) que el hook y el
workflow reutilizan, para que un YAML que hoy no se ejecuta de verdad (el repositorio es local,
`CLAUDE.md` §Repositorio) no se desincronice del proyecto sin que nadie lo note.

Esta spec no repite las reglas del contrato de API: la generación determinista de
`openapi/openapi.json` y su deriva viven en API1 (`openspec/specs/api/spec.md`) y en PLT7
(`openspec/specs/plataforma/spec.md`); el lint y la detección de cambios incompatibles del contrato
viven en API10. Aquí solo se cubre la orquestación de CI y lo que no pertenece a ningún dominio de
negocio: secretos, convención de commits, auditoría de dependencias, la política cuando falta un
documento base para comparar, y la generación del changelog.

## Requirements

### Requirement: CI1 — Hook pre-push local con comprobaciones rápidas

El sistema MUST instalar un hook de git `pre-push` que ejecute, antes de permitir el push: lint,
verificación de tipos (`typecheck`), tests unitarios, validación del mensaje de commit (`commitlint`,
CI2) y detección de secretos (`gitleaks`, CI3). El hook MUST NOT ejecutar los tests de integración ni
los tests e2e (se quedan en CI, CI5). Si cualquiera de las comprobaciones falla, el push MUST
bloquearse nombrando cuál comprobación falló. El hook MUST poder saltarse de forma explícita y visible
(`git push --no-verify`); un salto MUST NOT ocurrir en silencio ni sin que quien lo usa lo sepa.

#### Scenario: Un error de lint bloquea el push

- Dado un cambio con un error de lint,
- Cuando se ejecuta `git push`,
- Entonces el hook pre-push falla, nombra la comprobación (lint) y el push no llega al remoto.

#### Scenario: El hook se salta explícitamente

- Dado un cambio que se quiere empujar sin correr el hook,
- Cuando se ejecuta `git push --no-verify`,
- Entonces el push se completa sin correr las comprobaciones del hook, dejando constancia visible en
  la salida de la terminal de que se usó `--no-verify`.

#### Scenario: El hook no corre tests de integración

- Dado un repositorio con Postgres o Redis apagados en la máquina local,
- Cuando se ejecuta `git push` con un cambio que pasa lint, typecheck, tests unitarios, commitlint y
  gitleaks,
- Entonces el hook pasa sin necesitar Postgres ni Redis levantados, porque no ejecuta tests de
  integración.

### Requirement: CI2 — Mensajes de commit verificados con Conventional Commits

El sistema MUST validar cada mensaje de commit contra la convención de Conventional Commits antes de
aceptarlo, en el hook y en CI. Un mensaje sin un tipo válido (`feat`, `fix`, `docs`, etc.) MUST
rechazarse. Un mensaje que incluya una línea de atribución de IA (`Co-Authored-By` u otra marca
equivalente) MUST rechazarse, sin importar si el resto del mensaje es válido (`CLAUDE.md` §"Cómo se
trabaja").

#### Scenario: Mensaje sin tipo válido rechazado

- Dado un commit con el mensaje `"arreglo cosas"` (sin tipo de Conventional Commits),
- Cuando `commitlint` lo valida,
- Entonces lo rechaza y señala que falta un tipo válido.

#### Scenario: Mensaje con atribución de IA rechazado

- Dado un commit cuyo mensaje incluye una línea `Co-Authored-By: <asistente de IA>`,
- Cuando `commitlint` lo valida,
- Entonces lo rechaza, aunque el tipo y el resto del mensaje sean válidos.

#### Scenario: Mensaje convencional válido aceptado

- Dado un commit con mensaje `"fix(salud): corregir el indicador de Redis"`,
- Cuando `commitlint` lo valida,
- Entonces lo acepta sin bloquear el hook ni el workflow de CI.

### Requirement: CI3 — Detección de secretos bloqueante

El sistema MUST ejecutar `gitleaks` sobre el repositorio en el hook pre-push y en CI. Un secreto
detectado (token, credencial, clave privada) MUST bloquear el push y el build, nombrando el archivo y
la regla que lo detectó, sin imprimir el secreto completo en la salida. Un falso positivo conocido
MUST resolverse únicamente agregándolo a una allowlist versionada y revisada, nunca desactivando la
comprobación por omisión.

#### Scenario: Un secreto detectado bloquea el push

- Dado un archivo en el commit que contiene una cadena que coincide con una regla de detección de
  secretos de `gitleaks`,
- Cuando se ejecuta el hook pre-push o el workflow de CI,
- Entonces la comprobación falla, señala el archivo afectado y no imprime el secreto completo en la
  salida.

#### Scenario: Un falso positivo se resuelve con allowlist versionada

- Dado un hallazgo de `gitleaks` que el equipo confirma como falso positivo,
- Cuando se agrega su huella a la allowlist versionada del repositorio,
- Entonces las ejecuciones posteriores del mismo contenido no lo reportan, y la allowlist queda
  visible en el control de versiones para revisión futura.

### Requirement: CI4 — Auditoría de dependencias con umbral de severidad explícito

El sistema MUST ejecutar `npm audit` en CI con un umbral de severidad explícito y versionado en la
configuración del proyecto. Una vulnerabilidad con severidad igual o mayor al umbral MUST hacer fallar
el build, nombrando el paquete y la severidad. Una alerta por debajo del umbral MUST NOT bloquear el
build.

#### Scenario: Vulnerabilidad sobre el umbral bloquea el build

- Dado que una dependencia tiene una vulnerabilidad con severidad igual o mayor al umbral configurado,
- Cuando corre `npm audit` en CI,
- Entonces el build falla y señala el paquete y la severidad de la vulnerabilidad.

#### Scenario: Vulnerabilidad bajo el umbral no bloquea el build

- Dado que una dependencia tiene una vulnerabilidad con severidad menor al umbral configurado,
- Cuando corre `npm audit` en CI,
- Entonces el build no falla por esa vulnerabilidad, aunque quede reportada en la salida.

### Requirement: CI5 — Una sola definición de la secuencia completa de CI

El sistema MUST definir la secuencia completa de comprobaciones de integración continua en un único
script (`npm run ci`): lint, typecheck, `dependency-cruiser`, tests unitarios, tests de integración,
`gitleaks`, `npm audit`, `commitlint`, verificación de deriva de los dos documentos commiteados
`openapi/openapi.json` y `openapi/openapi.interno.json` (API1, PLT7, ADR-0010), lint del contrato con
Spectral sobre ambos documentos y comparación con oasdiff sobre el documento público (API10). El hook
pre-push MUST invocar únicamente el subconjunto rápido de esa secuencia (CI1); el workflow de GitHub
Actions (CI6) MUST invocar la secuencia completa a través de ese mismo script, sin redefinir los pasos
en YAML. Cambiar un paso de la secuencia MUST requerir editar un solo lugar.

#### Scenario: `npm run ci` ejecuta la secuencia completa en un entorno local

- Dado un entorno de desarrollo local con Docker disponible para Testcontainers,
- Cuando se ejecuta `npm run ci`,
- Entonces corren, en orden, lint, typecheck, fronteras, tests unitarios, tests de integración,
  `gitleaks`, `npm audit`, `commitlint`, la verificación de deriva del contrato, Spectral y oasdiff, y
  el comando reporta el resultado de cada paso.

#### Scenario: El workflow de CI invoca la misma definición, sin duplicarla

- Dado el archivo del workflow de GitHub Actions,
- Cuando se inspecciona su contenido,
- Entonces invoca `npm run ci` (o los scripts que este compone) en vez de repetir la lista de pasos
  directamente en YAML.

### Requirement: CI6 — Workflow de GitHub Actions completo y validado estáticamente

El sistema MUST tener un workflow de GitHub Actions (`.github/workflows/`) que ejecute la secuencia
completa de CI (CI5) en cada push y en cada pull request, aunque el repositorio no tenga hoy un
remoto en GitHub (`CLAUDE.md` §Repositorio). El workflow MUST validarse estáticamente (`actionlint` u
otra herramienta equivalente) como parte de la propia secuencia de CI, para detectar un YAML mal
formado o desincronizado sin necesidad de un remoto real donde ejecutarlo.

#### Scenario: Un YAML de workflow mal formado falla la validación estática

- Dado un archivo de workflow con un error de sintaxis o una acción inexistente,
- Cuando corre la validación estática del workflow,
- Entonces la comprobación falla y señala el archivo y el error.

#### Scenario: El workflow ejecuta la secuencia completa en cada push y PR

- Dado el archivo de workflow ya escrito,
- Cuando se inspeccionan sus disparadores (`on:`),
- Entonces está configurado para correr en cada push y en cada pull request, invocando la secuencia
  completa de CI (CI5).

### Requirement: CI7 — Orden de ejecución de pruebas preserva la pirámide

La secuencia de CI (CI5) MUST ejecutar primero los tests unitarios (sin infraestructura) y después los
tests de integración (con Postgres y Redis reales vía Testcontainers, ADR-0009), nunca al revés ni
mezclados sin separación. Esto preserva la corrección del antipatrón A12 (pirámide de tests invertida
del prototipo) confirmada en la Fase 00a: un fallo rápido en unitarios MUST reportarse antes de pagar
el costo de levantar contenedores para integración.

#### Scenario: Un test unitario roto falla antes de levantar contenedores

- Dado un cambio que rompe un test unitario y no toca nada de integración,
- Cuando corre `npm run ci`,
- Entonces el paso de tests unitarios falla y el pipeline se detiene ahí, sin llegar a levantar los
  contenedores de Testcontainers para el paso de integración.

### Requirement: CI8 — `CHANGELOG.md` generado desde Conventional Commits

El sistema MUST generar `CHANGELOG.md` con `git-cliff` a partir de los mensajes de commit de
Conventional Commits, usando una configuración versionada en el repositorio (`cliff.toml`).
`CHANGELOG.md` MUST NOT editarse a mano: cualquier corrección MUST hacerse corrigiendo el commit origen
(si aún no se publicó) o agregando un commit nuevo, nunca editando el archivo generado directamente.

#### Scenario: El changelog se regenera desde los commits

- Dado un conjunto de commits nuevos con mensajes de Conventional Commits desde la última generación,
- Cuando se ejecuta la generación de `CHANGELOG.md`,
- Entonces el archivo incluye una entrada por cada commit visible según la configuración de
  `cliff.toml`, agrupada por tipo.

#### Scenario: Una edición manual del changelog se detecta

- Dado que alguien edita `CHANGELOG.md` a mano en vez de regenerarlo,
- Cuando se vuelve a ejecutar la generación con `git-cliff` sobre el mismo historial de commits,
- Entonces el resultado regenerado sobrescribe la edición manual, dejando evidencia en el diff de que
  el archivo no coincide con lo que los commits documentan.

### Requirement: CI9 — Política explícita cuando falta el documento base del contrato

Cuando `oasdiff` no encuentra un documento `openapi/openapi.json` en `main` contra el cual comparar
(por ejemplo, el primer PR que introduce el contrato, ADR-0008), el paso de detección de cambios
incompatibles (API10) MUST NOT fallar el build por esa ausencia, pero MUST reportar explícitamente en
la salida que no hubo comparación real, nombrando que falta el documento base. Un build MUST NOT
terminar en verde de forma silenciosa cuando en realidad no se ejecutó ninguna comparación.

#### Scenario: Sin documento base, el paso no falla pero deja rastro visible

- Dado que `main` todavía no tiene `openapi/openapi.json` commiteado,
- Cuando CI intenta comparar el contrato de la rama contra `main` con `oasdiff`,
- Entonces el paso no falla el build, pero su salida indica explícitamente que no hubo documento base
  para comparar.

#### Scenario: Con documento base, la comparación es real

- Dado que `main` ya tiene `openapi/openapi.json` commiteado,
- Cuando CI compara el contrato de la rama contra `main` con `oasdiff`,
- Entonces el paso ejecuta la comparación real y su resultado (verde o fallo por cambio incompatible)
  depende de esa comparación, no de una omisión.

### Requirement: CI10 — La secuencia de CI incluye el cliente de back office

El repositorio tiene dos aplicaciones hermanas, `servicio/` y `cliente/`, cada una con su `package.json`, su lockfile y
su propio script `ci` (ADR-0023). `npm run ci` de la raíz MUST encadenar con `&&` el `ci` del servicio (la secuencia de
CI5), el `ci` del cliente (lint, tests, pruebas de sus herramientas, build de producción y verificación de deriva del
cliente HTTP generado, CLT2) y la auditoría de dependencias del cliente con el mismo umbral `high` de CI4 y sus propias
excepciones (`cliente/auditoria-excepciones.json`). El `package.json` de la raíz MUST NOT declarar dependencias. El
workflow de GitHub Actions MUST seguir invocando solo `npm run ci` de la raíz, después de instalar cada aplicación con
su lockfile (`npm run instalar:ci`), sin redefinir los pasos. Los scripts del servicio MUST NOT mencionar al cliente.
`npm run fronteras` (`dependency-cruiser`) MUST seguir cruzando solo `src/` y `scripts/` del servicio. El hook
`pre-push` (`ci:hook` del servicio) MUST NOT incluir pasos del cliente, para seguir siendo rápido.

Fase que lo implementa: 11b (estructura de dos aplicaciones: ADR-0023, 2026-10-04)

#### Scenario: `npm run ci` corre los pasos del cliente

- Dado el repositorio con `servicio/` y `cliente/`,
- Cuando se ejecuta `npm run ci` en la raíz,
- Entonces, además de los pasos de CI5 del servicio, corren lint, tests, build, deriva y auditoría del cliente, y un
  fallo de cualquiera hace fallar el comando.

#### Scenario: Un test roto del cliente hace fallar la CI

- Dado un test del cliente que falla,
- Cuando se ejecuta `npm run ci` en la raíz,
- Entonces el comando termina con error y nombra el paso del cliente que falló.

#### Scenario: Las fronteras del servidor no recorren el cliente

- Dado el repositorio con `servicio/` y `cliente/`,
- Cuando se ejecuta `npm run fronteras` en `servicio/`,
- Entonces `dependency-cruiser` analiza solo `src/` y `scripts/` del servicio.

#### Scenario: Cada aplicación acepta solo sus propios riesgos

- Dada una vulnerabilidad `high` en una dependencia del cliente con excepción solo en
  `servicio/auditoria-excepciones.json`,
- Cuando corre la auditoría del cliente,
- Entonces falla y nombra el paquete.
