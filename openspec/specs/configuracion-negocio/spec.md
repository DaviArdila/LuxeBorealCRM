# Configuración de negocio — Specification

## Purpose

El horario de atención, los textos que ve el cliente y los parámetros del negocio (recargos,
factores de cálculo, etc.) son decisiones del negocio, no del código. Este dominio garantiza que
cambiarlos no requiera un despliegue.

## Requirements

### Requirement: R15 — Horario, textos y parámetros son datos, no constantes

El horario de atención, los textos enviados al cliente y los parámetros del negocio MUST ser datos
editables (persistidos, con una vía para actualizarlos), nunca constantes en el código.

Fase que lo implementa: 01, 02

#### Scenario: El horario de atención se lee como dato

- Dado que el sistema necesita saber si está dentro o fuera del horario de atención,
- Cuando lo consulta,
- Entonces lo lee de un parámetro editable, nunca de un valor fijo en el código.

#### Scenario: Los textos al cliente vienen de un parámetro

- Dado que el bot necesita enviar un texto al cliente (aviso de datos, mensaje de handoff, mensaje
  de fuera de cobertura, etc.),
- Cuando lo envía,
- Entonces ese texto viene de un parámetro editable, no de una constante en el código.

#### Scenario: Un parámetro del negocio se ajusta sin desplegar código

- Dado que se ajusta un parámetro del negocio (por ejemplo, el porcentaje de recargo contraentrega
  o el factor volumétrico),
- Cuando se actualiza el valor del parámetro,
- Entonces el sistema usa el nuevo valor sin necesidad de desplegar código nuevo.
