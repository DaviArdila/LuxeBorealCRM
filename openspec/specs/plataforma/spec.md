# Plataforma — Specification

## Purpose

Comportamiento técnico transversal (no de negocio) que toda fase posterior hereda: configuración
validada al arrancar, tiempo leído de un reloj inyectable, logs estructurados sin datos personales,
salud de las dependencias externas, apagado ordenado y verificación local automatizada. Nada de esto
es lógica de negocio; es lo que hace posible construir negocio encima sin repetir los antipatrones
del prototipo (`A1`, `A2`, `A3`, `A10`, `A11`, `B8`, `B11`, `SPEC.md` §4, ADR-0001).

## Requirements

### Requirement: PLT1 — Configuración validada y única fuente de lectura de variables de entorno

El sistema MUST validar toda la configuración de arranque contra un esquema Zod antes de aceptar
tráfico. Si una variable requerida falta o no cumple el esquema, el proceso MUST NOT arrancar y
MUST informar el error nombrando la variable afectada, sin imprimir su valor. `process.env` MUST
leerse **solo** dentro de `plataforma/config`; el resto del código MUST obtener configuración por
inyección de dependencias. El sistema MUST NOT reconocer variables `MOCK_*` como mecanismo de
selección de implementación.

Fase que lo implementa: 00a

#### Scenario: La aplicación no arranca con configuración inválida o incompleta

- Dado que falta una variable de entorno requerida o su valor no cumple el esquema de configuración,
- Cuando se intenta arrancar la aplicación,
- Entonces el proceso termina sin aceptar tráfico y el mensaje de error nombra la variable que falló,
  sin mostrar el valor que traía (si tenía alguno).

#### Scenario: Una lectura de `process.env` fuera de `plataforma/config` falla la verificación

- Dado un archivo fuera de `plataforma/config` que lee `process.env` directamente,
- Cuando corre `npm run verify`,
- Entonces la comprobación de reglas de lint falla y señala el archivo y la línea.

### Requirement: PLT2 — Reloj inyectable (`Clock`)

El sistema MUST exponer el tiempo actual únicamente a través de un puerto `Clock` inyectado por el
token `CLOCK`; la lógica de negocio y de aplicación MUST NOT llamar a `Date.now()` ni a
`new Date()` sin argumentos fuera de `plataforma/reloj`. Los tests MUST poder sustituir el reloj de
sistema por un `ClockFalso` inyectado, sin depender de temporizadores falsos globales
(`vi.useFakeTimers`) sobre lógica de negocio.

Fase que lo implementa: 00a

#### Scenario: El código de aplicación lee la hora del `Clock` inyectado

- Dado un caso de uso o servicio que necesita la hora actual,
- Cuando la consulta,
- Entonces la obtiene llamando al puerto `Clock` inyectado (token `CLOCK`), nunca a `Date.now()` ni
  a `new Date()` directamente.

#### Scenario: Un test fija el tiempo con `ClockFalso`

- Dado un test que necesita una hora determinada para verificar su resultado,
- Cuando sustituye la implementación de `CLOCK` por `ClockFalso` con la hora fijada,
- Entonces el código bajo prueba usa esa hora fijada sin tocar el reloj del sistema real.

#### Scenario: Un uso de `Date.now()` o `new Date()` fuera de `plataforma/reloj` falla la verificación

- Dado un archivo fuera de `plataforma/reloj` que llama a `Date.now()` o a `new Date()` sin
  argumentos,
- Cuando corre `npm run verify`,
- Entonces la comprobación de reglas de lint falla y señala el archivo y la línea.

### Requirement: PLT3 — Logs estructurados en JSON sin datos personales

El sistema MUST emitir todos sus logs en formato JSON estructurado a través del logger central de
la plataforma; `console.log`, `console.error` y el resto de la API de `console` MUST NOT usarse en
el código de la aplicación. El logger MUST redactar automáticamente, en cualquier log que los
incluyera, el contenido de mensajes de conversación, números de teléfono completos (dejando visibles
solo los últimos 4 dígitos), números de cédula, correos electrónicos y tokens o secretos, sin que
cada punto de log tenga que invocar una función de enmascarado a mano. Este comportamiento
implementa, a nivel de plataforma, el requisito `R14` de `openspec/specs/privacidad/spec.md`; el
escenario que lo verifica se llama `R14 — Redacción en logs` y corre contra el logger real, no
contra un doble.

Fase que lo implementa: 00a

#### Scenario: Los logs se emiten en JSON estructurado

- Dado que el sistema está corriendo,
- Cuando cualquier parte del código registra un log,
- Entonces la línea emitida es un objeto JSON con campos estructurados (nivel, mensaje, metadatos),
  nunca texto libre de `console.*`.

#### Scenario: R14 — Redacción en logs

- Dado un log que, sin redacción, incluiría contenido de un mensaje, un número de teléfono completo,
  una cédula, un correo o un token,
- Cuando el logger lo escribe,
- Entonces esos campos quedan redactados en la salida (el número de teléfono conserva solo sus
  últimos 4 dígitos) sin que el código que generó el log haya tenido que enmascararlos manualmente.

### Requirement: PLT4 — Health check de Postgres y Redis

El sistema MUST exponer `GET /health` usando `@nestjs/terminus`, que MUST comprobar activamente que
Postgres responde (`SELECT 1`) y que Redis responde (`PING`). Si ambas dependencias están arriba, el
endpoint MUST responder `200` con un cuerpo que indique el estado de cada dependencia comprobada. Si
alguna dependencia no responde, el endpoint MUST responder con un código de error (`503`) que nombre
cuál dependencia falló. El cuerpo de la respuesta MUST NOT incluir secretos, cadenas de conexión ni
credenciales.

Fase que lo implementa: 00a

#### Scenario: Postgres y Redis arriba responden 200

- Dado que Postgres y Redis están accesibles y responden,
- Cuando llega un `GET /health`,
- Entonces el servicio responde `200` con un cuerpo que reporta ambas dependencias como saludables.

#### Scenario: Una dependencia caída responde error nombrándola

- Dado que Postgres o Redis no responde,
- Cuando llega un `GET /health`,
- Entonces el servicio responde `503` y el cuerpo nombra explícitamente cuál de las dos
  dependencias falló, sin afectar el reporte de la que sigue sana.

#### Scenario: El cuerpo de health no expone secretos

- Dado cualquier resultado de `GET /health` (dependencias arriba o caídas),
- Cuando se inspecciona el cuerpo de la respuesta,
- Entonces no contiene cadenas de conexión, contraseñas, tokens ni ningún otro secreto de
  configuración.

### Requirement: PLT5 — Apagado ordenado

El sistema MUST cerrar ordenadamente sus recursos al recibir `SIGTERM`: MUST dejar de aceptar
conexiones HTTP nuevas, MUST permitir que una solicitud HTTP en curso termine antes de cerrar el
servidor, y MUST cerrar las conexiones abiertas a Postgres y a Redis antes de terminar el proceso.
Ningún recurso (conexión a base de datos, cliente de Redis, etc.) MUST abrirse como efecto
secundario de importar un archivo; MUST abrirse solo durante el ciclo de vida gestionado por
NestJS (`OnModuleInit`/`OnApplicationShutdown`) con `enableShutdownHooks()` activo.

Fase que lo implementa: 00a

#### Scenario: `SIGTERM` cierra las conexiones a Postgres y Redis

- Dado que la aplicación está corriendo con conexiones abiertas a Postgres y Redis,
- Cuando el proceso recibe `SIGTERM`,
- Entonces cierra la conexión a Postgres, cierra la conexión a Redis y termina el proceso sin
  dejarlas abiertas.

#### Scenario: Una solicitud en curso termina antes de cerrar el servidor

- Dado que hay una solicitud HTTP en curso cuando llega `SIGTERM`,
- Cuando el proceso empieza el apagado,
- Entonces esa solicitud recibe su respuesta completa antes de que el servidor HTTP termine de
  cerrarse, y no se aceptan solicitudes nuevas mientras tanto.

### Requirement: PLT6 — Fronteras entre módulos verificadas por herramienta

El sistema MUST verificar automáticamente, como parte de `npm run verify`, las reglas de fronteras
entre módulos de la skill `luxeboreal-arquitectura` §2: `compartido/` MUST NOT importar nada de
`plataforma/` ni de `modulos/`; ningún módulo MUST importar una ruta interna de otro módulo (solo lo
que ese módulo exporta); `@prisma/client` MUST NOT importarse fuera de `plataforma/prisma` y de la
carpeta `infraestructura/` de cada módulo; y no MUST NOT existir ciclos de imports entre módulos.
Una violación de cualquiera de estas reglas MUST hacer fallar `npm run verify`.

Fase que lo implementa: 00a

#### Scenario: Un import prohibido hace fallar `npm run verify`

- Dado un archivo que importa una ruta interna de otro módulo, o que importa `@prisma/client` fuera
  de `plataforma/prisma`/`infraestructura/`, o que crea un ciclo de imports entre módulos,
- Cuando corre `npm run verify`,
- Entonces la comprobación de fronteras falla y señala el import que la viola.

#### Scenario: Un import permitido no afecta la verificación de fronteras

- Dado un módulo que importa únicamente lo que otro módulo exporta en su punto de entrada,
- Cuando corre `npm run verify`,
- Entonces la comprobación de fronteras pasa para ese import.

### Requirement: PLT7 — `npm run verify` como puerta de verificación local

El sistema MUST proveer el comando `npm run verify`, que MUST ejecutar, en un solo paso, lint,
verificación de tipos (`typecheck`), verificación de fronteras (`dependency-cruiser`) y las pruebas
unitarias e de integración del proyecto. `npm run verify` MUST terminar en verde solo si las cinco
comprobaciones pasan, y MUST fallar si cualquiera de ellas falla. `npm run verify` MUST completarse
en menos de 3 minutos en un entorno de desarrollo local con Postgres y Redis ya arriba.

Fase que lo implementa: 00a

#### Scenario: `npm run verify` en verde ejecuta las cinco comprobaciones

- Dado un estado del código en el que lint, typecheck, fronteras, tests unitarios y tests de
  integración pasan,
- Cuando se ejecuta `npm run verify`,
- Entonces el comando termina en verde y reporta el resultado de las cinco comprobaciones, en menos
  de 3 minutos.

#### Scenario: Un fallo en cualquier comprobación hace fallar `npm run verify`

- Dado un estado del código en el que una de las cinco comprobaciones (lint, typecheck, fronteras,
  tests unitarios, tests de integración) falla,
- Cuando se ejecuta `npm run verify`,
- Entonces el comando termina en rojo y señala cuál comprobación falló.
