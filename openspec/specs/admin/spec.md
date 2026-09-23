# Admin — Specification

## Purpose

Cubre los controles administrativos del sistema sobre la atención automática: la capacidad de
apagarla, de forma global o por contacto, sin depender de un despliegue.

## Requirements

### Requirement: R16 — Kill switch

El sistema MUST exponer un kill switch, protegido por token, que permita desactivar la atención
automática de forma global o para un contacto específico.

Fase que lo implementa: 09

#### Scenario: Kill switch global

- Dado que un administrador activa el kill switch global,
- Cuando se activa,
- Entonces el bot deja de responder a todos los contactos hasta que se desactive.

#### Scenario: Kill switch por contacto

- Dado que un administrador activa el kill switch para un contacto específico,
- Cuando se activa,
- Entonces el bot deja de responder solo a ese contacto, y sigue atendiendo a los demás.

#### Scenario: Token inválido

- Dado que se llama al endpoint del kill switch sin el token correcto,
- Cuando se llama,
- Entonces la petición se rechaza y el estado del kill switch no cambia.
