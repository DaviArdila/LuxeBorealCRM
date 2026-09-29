# 0016. El agente implementa el puerto de conversaciones; AppModule compone los dos módulos

- Estado: aceptada (2026-09-29)
- Fecha: 2026-09-29

## Contexto

`conversaciones` define el puerto `GENERADOR_RESPUESTA` y hoy lo liga a `AgenteEco`
(`src/modulos/conversaciones/conversaciones.module.ts`). La Fase 07 crea el módulo `agente`, que
necesita `catalogo`, `llm`, `horario` y `medios`. Hay que decidir quién importa a quién sin ciclos
(regla de fronteras 1) y sin que `agente` toque `canales` (regla 13). El patrón de registro en
`onModuleInit` ya existe para eventos (`RegistroConsumidorEventosCanal`), no para un puerto de
petición/respuesta.

## Alternativas

1. **`conversaciones` importa `AgenteModule`**. Simple en Nest, pero el dueño del puerto pasa a
   depender de su implementación y, por transitividad, del LLM y del catálogo.
2. **Registro en `onModuleInit`**: `conversaciones` expone un registro y `agente` se registra.
   Necesita un generador "por defecto" mientras nadie se registró y un orden de arranque implícito.
3. **Módulo dinámico compuesto en `AppModule`**: los tipos y el token del puerto viven en
   `conversaciones`; `agente` los importa del barril y provee el token;
   `ConversacionesModule.conGenerador(AgenteModule)` importa el módulo que se le pasa. Nada en
   `conversaciones` importa `agente`.

## Decisión

Alternativa 3. `agente → conversaciones` (solo el barril: token y tipos). `AppModule` importa
`ConversacionesModule.conGenerador(AgenteModule)`. El `ConversacionesModule` estático conserva
`AgenteEco` para los tests del propio módulo. Una regla nueva de `dependency-cruiser`
(`conversaciones-no-conoce-agente`) prohíbe cualquier import de `src/modulos/agente/` desde
`src/modulos/conversaciones/`.

## Consecuencias

- El puerto queda en su dueño y la dependencia va en un solo sentido, verificada en CI.
- La composición completa de la aplicación se lee en un solo archivo (`app.module.ts`).
- Queda prohibido que `conversaciones` conozca al agente, y que el agente transicione la conversación
  o hable con `canales`: pide (handoff, pasos) y `conversaciones` ejecuta.
- Un generador distinto (p. ej. un agente de otro proveedor o un modo sombra de la Fase 10) se
  compone igual, sin tocar `conversaciones`.
