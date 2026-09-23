# 0006. Un solo negocio (sin multiempresa)

- Estado: aceptada
- Fecha: 2026-09-22

## Contexto

El usuario quiere que algún día el software sirva a varios negocios, pero hoy solo lo usará él, para
probar y entender la operación. Un SaaS completo exige aislamiento de datos por empresa
(`cuenta_id` en toda tabla y consulta), alta de negocios, secretos por empresa, reparto justo de
colas y del LLM, facturación y operación de varios clientes. Para un equipo de dos personas, eso
duplica el trabajo antes del primer mensaje atendido, sin un segundo negocio concreto.

## Alternativas

1. SaaS completo desde el inicio.
2. "Listo para multiempresa": `cuenta_id` y contexto de empresa desde el inicio, operado con una.
3. Un solo negocio, con reglas baratas que no cierran la puerta.

## Decisión

Opción 3. Sin `cuenta_id`. Tres reglas obligatorias:

1. Nada del negocio en el código: textos, horario, parámetros, catálogo y credenciales son datos o
   configuración (R15).
2. Módulos con fronteras (ADR-0001), para que agregar la empresa sea un cambio acotado.
3. El cliente no se identifica por teléfono (id propio + `chatwoot_contact_id`).

## Consecuencias

- Menos complejidad en cada consulta, test y pantalla.
- Pasar a varios negocios después será un proyecto grande pero delimitado (agregar `cuenta_id`,
  rellenar datos, filtrar).
- **Condición para reabrir**: aparece un segundo negocio concreto, con fecha.
