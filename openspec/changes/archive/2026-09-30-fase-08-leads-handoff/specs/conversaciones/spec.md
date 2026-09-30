# Delta for Conversaciones

## ADDED Requirements

### Requirement: CNV11 — El handoff por petición de persona y por lead lo ejecuta conversaciones

`conversaciones` MUST aceptar el motivo de handoff `pide-persona` además de `lead-caliente`: los dos
MUST llevar la conversación a `handoff_pendiente` con el mismo espejo de estado y etiquetas que los demás
motivos (CNV8), y `lead-caliente` MUST agregar la etiqueta `lead-caliente` en el canal. La transición
MUST quedar confirmada antes de que se encole el aviso de `notificaciones` (NTF3).

Fase que lo implementa: 08

#### Scenario: Petición de persona pasa a handoff pendiente

- Dado una respuesta del generador con handoff `pide-persona`,
- Cuando `conversaciones` la procesa,
- Entonces la conversación queda en `handoff_pendiente` y el canal la muestra como abierta.

#### Scenario: Lead caliente agrega su etiqueta

- Dado una respuesta del generador con handoff `lead-caliente`,
- Cuando `conversaciones` la procesa,
- Entonces la conversación queda en `handoff_pendiente` y el canal recibe la etiqueta `lead-caliente`.

#### Scenario: El aviso solo se encola tras confirmar la transición

- Dado un handoff `lead-caliente`,
- Cuando la transición a `handoff_pendiente` se confirma,
- Entonces recién entonces se dispara el aviso del lead.
