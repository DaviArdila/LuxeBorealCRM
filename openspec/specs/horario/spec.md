# Horario Specification

## Purpose

Define el contrato observable del puerto `Horario`: si un momento dado está dentro o fuera del
horario de atención del negocio, combinando el patrón semanal editable
(`parametro.horario_atencion`, R15) con las excepciones puntuales (`excepcion_horario`, festivos y
cierres). Se separa de `catalogo` porque es un puerto reutilizable por otras fases (Fase 08, R10 de
`openspec/specs/leads/spec.md`, ya depende de "fuera de horario"; Fase 04, P13, evalúa si Chatwoot
puede reemplazarlo — no se decide aquí).

## Nota de implementación

El título exacto de cada escenario **es** el criterio de aceptación, no un detalle de estilo. Cada
test de esta fase MUST nombrarse `"<id del requisito> — <título del escenario>"`, usando el título
exacto de los encabezados `#### Scenario:` de abajo, sin parafrasear.

## Requirements

### Requirement: HOR1 — La excepción del día gana sobre el patrón semanal

El sistema MUST tratar como fuera de horario cualquier fecha que tenga una fila en
`excepcion_horario`, sin importar lo que diga el patrón semanal de `parametro.horario_atencion` para
ese día de la semana.

#### Scenario: Una excepción (festivo) cierra el día aunque el patrón diga abierto

- Dado un patrón semanal que marca el miércoles como abierto de 08:00 a 18:00, y una fila en
  `excepcion_horario` para la fecha de hoy (miércoles),
- Cuando se consulta si un momento de hoy a las 10:30 está dentro de horario,
- Entonces el resultado es `false` (fuera de horario), sin importar que el patrón semanal diga que
  el miércoles está abierto a esa hora.

### Requirement: HOR2 — Sin parámetro configurado se asume dentro de horario

Cuando no existe ninguna fila de `parametro` para la clave `horario_atencion`, el sistema MUST
asumir que el momento consultado está dentro de horario (el bot se comporta como si no hubiera
restricción de horario), salvo que exista una excepción para esa fecha (HOR1, que sigue
aplicando primero).

#### Scenario: Sin parámetro horario_atencion configurado se asume dentro de horario

- Dado que no existe ninguna fila de `parametro` con clave `horario_atencion`, y no hay ninguna
  excepción para la fecha de hoy,
- Cuando se consulta si un momento de hoy está dentro de horario,
- Entonces el resultado es `true` (dentro de horario).

### Requirement: HOR3 — JSON inválido en el parámetro solo advierte y asume dentro de horario

Cuando el valor guardado en `parametro.horario_atencion` no es JSON válido, el sistema MUST registrar
una advertencia (sin lanzar un error que interrumpa el flujo) y MUST asumir que el momento consultado
está dentro de horario.

#### Scenario: Un valor de horario_atencion que no es JSON válido asume dentro de horario y solo advierte

- Dado un parámetro `horario_atencion` cuyo valor guardado no es JSON válido, y no hay ninguna
  excepción para la fecha de hoy,
- Cuando se consulta si un momento de hoy está dentro de horario,
- Entonces el resultado es `true` (dentro de horario), y el sistema registra una advertencia en vez
  de fallar la consulta.

### Requirement: HOR4 — Un día fuera del patrón semanal se asume dentro de horario

Cuando el patrón semanal configurado no tiene ninguna clave, exacta ni de rango de días, que cubra
el día de la semana consultado, el sistema MUST asumir que ese día está dentro de horario.

#### Scenario: Un día no mencionado en el patrón semanal se asume dentro de horario

- Dado un patrón semanal que solo define un rango para "lun-vie" y una clave exacta para "sab", sin
  ninguna entrada para "dom",
- Cuando se consulta si un domingo está dentro de horario, sin ninguna excepción registrada para esa
  fecha,
- Entonces el resultado es `true` (dentro de horario).

### Requirement: HOR5 — Un patrón vacío o null para el día se asume fuera de horario

Cuando el patrón semanal sí tiene una entrada para el día consultado (por clave exacta o por rango) y
su valor es `null` o una cadena vacía, el sistema MUST asumir que ese día está fuera de horario.

#### Scenario: Un día con valor null en el patrón semanal se asume fuera de horario

- Dado un patrón semanal con la clave exacta "dom" en `null`,
- Cuando se consulta si un domingo está dentro de horario, sin ninguna excepción registrada para esa
  fecha,
- Entonces el resultado es `false` (fuera de horario).

### Requirement: HOR6 — Un rango que cruza medianoche se evalúa correctamente

El sistema MUST evaluar correctamente un rango horario cuya hora de inicio es mayor que la hora de
fin (por ejemplo `"20:00-02:00"`), tratándolo como el tramo que va desde el inicio hasta medianoche
más el tramo desde medianoche hasta el fin.

#### Scenario: Un rango que cruza medianoche incluye las horas antes y después de medianoche, y excluye las de en medio

- Dado el rango `"20:00-02:00"`,
- Cuando se evalúa si los minutos correspondientes a las 23:00, la 01:00 y las 12:00 del día están
  dentro de ese rango,
- Entonces las 23:00 y la 01:00 están dentro del rango, y las 12:00 están fuera.

### Requirement: HOR7 — El puerto Horario lee el momento del Clock inyectado

El puerto `Horario` MUST resolver el momento a evaluar por defecto a partir del `Clock` inyectado de
`plataforma/reloj` (`CLOCK.ahora()`), nunca llamando directamente a `Date.now()` ni a
`new Date()` dentro de la lógica de negocio del módulo `horario`.

#### Scenario: Sin fecha explícita, el puerto usa el momento que devuelve el Clock inyectado

- Dado un `Clock` de prueba fijado a un instante conocido, sin ninguna excepción ni parámetro que
  cambie el resultado para ese instante,
- Cuando se consulta si el sistema está dentro de horario sin pasar una fecha explícita,
- Entonces la evaluación usa el instante que devuelve ese `Clock`, no el reloj real del sistema.
