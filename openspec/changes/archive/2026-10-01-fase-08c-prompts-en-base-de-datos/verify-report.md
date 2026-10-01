# Verify report: Fase 08c — El estilo del agente se edita desde la base de datos

- Fecha: 2026-10-01 · Ramas: `fase-08c-p1-lectura` … `fase-08c-p4-cierre` (4 PRs apilados, `stacked-to-main`) más la spec
  y el ADR-0020 en `fase-08c-prompts-en-base-de-datos` (#49)
- Change: `openspec/changes/archive/2026-10-01-fase-08c-prompts-en-base-de-datos/`
- ADR: [0020](../../../../docs/adr/0020-estilo-del-agente-editable-desde-la-base-de-datos.md), aceptada el 2026-10-01.
- Commits de unidad de trabajo: T1, T2, T3, T4, T5 y T6 con un commit cada uno (`git log` de las ramas `fase-08c-p*`); el cierre
  documental (T7) en este commit.

## Alcance verificado

Las siete tareas `[x]`. **T6 queda con un pendiente `[manual]`**: la corrida real de evals con un estilo candidato
(`EVALS_MODO=real EVALS_ESTILO=./mi-estilo.md npm run evals`) necesita la clave de OpenAI del dueño. Lo automático está
completo: validación del estilo, lectura de `parametro` con respaldo en el archivo, copia en memoria con versión en Redis,
publicar, restaurar e historial de 10 versiones con transacción y candado consultivo, el comando `npm run prompt:estilo` y la
guía de operación. **No se llamó a ningún LLM real.**

## Checks ejecutados (comandos reales)

Entorno: sin Docker; Postgres 16 y Redis locales con un `globalSetup` alterno fuera del repo (MinIO no disponible).

| Comando | Resultado |
|---|---|
| `npm run lint` · `typecheck` · `fronteras` · `contrato:deriva` · `commits` | Verde |
| `npm test` (unit) | 1073 pasan; 7 fallan por necesitar Docker (los mismos de `main`) |
| `vitest --project integracion` (locales) | 278 pasan; 7 fallan por necesitar MinIO (los mismos de `main`) |
| `vitest --project e2e` (locales) | Verde: 37 tests (2 nuevos del estilo en `agente-llm`) |
| `vitest --project evals` (guionado, locales) | Verde: 35 pasan, 1 omitido (el modo real); veredicto APROBADA |
| `npm run prompt:estilo` (corrida real por la CLI contra la base local) | `ver`, `publicar`, `historial` y un estilo inválido con salida 1 |

`npm run ci` de GitHub corrió en verde en cada PR de la cadena antes de fusionarlo.

## Escenarios de spec — cobertura real

| Requisito | Escenarios | Dónde se prueba |
|---|---|---|
| AGT13 (mod.) | 5 | `ensamblar-prompt.spec.ts`, `contenido-llm.spec.ts` (log de la versión sin contenido) |
| AGT18 | 3 | `proveedor-estilo.spec.ts`, integración de `RepositorioEstiloPrisma`, `ensamblar-prompt.spec.ts` |
| AGT19 | 3 | `proveedor-estilo.spec.ts` (copia, invalidación, Redis caído, TTL), integración de `VersionEstiloRedis`, e2e |
| AGT20 | 3 | `validar-estilo.spec.ts`, `publicar-estilo.spec.ts` |
| AGT21 | 3 | Integración de `PublicarEstilo`/`RestaurarEstilo` contra Postgres y Redis (con 5 publicaciones simultáneas), e2e |
| AGT22 | 3 | `scripts/prompt-estilo.spec.ts` (parseo y reporte), integración del comando de punta a punta |

## Desviaciones respecto a la spec

1. **`EstiloModule`**: para que el comando compusiera el estilo sin el LLM, los leads ni las colas, `ProveedorEstilo`, los casos de uso
   y `CargadorPrompts` pasaron a un módulo propio que `AgenteModule` importa y el barril de `agente` exporta (T5).
2. **`EVALS_ESTILO`** (fuera del mapeo de tareas): publica un estilo candidato en la base de la corrida para medirlo con el LLM real
   antes de publicarlo (T6). Es la forma concreta de cumplir «evals antes de clientes».
3. Los e2e de T6 no tuvieron un RED clásico (el comportamiento venía de T2-T4); se hizo una **prueba de mutación** (quitar la subida
   de la versión compartida) y ambos fallaron.
4. `$queryRaw` no admite el tipo `void` de `pg_advisory_xact_lock` con el adaptador de Prisma: se usa `$executeRaw`.
5. Una corrida local con los tres proyectos de Vitest en paralelo mostró una falla puntual en `leads/repositorio-lead.spec.ts` que no
   se reprodujo (pasa sola, sin mis cambios y en el proyecto de integración completo); el CI corre los proyectos por separado.

## Límites conocidos

- **Nada se probó con un modelo real.** Que un estilo nuevo se cumpla (viñetas, sin emojis, tono) lo decide la corrida real
  `[manual]` (EVL3). Hasta entonces el agente sigue sin exponerse a clientes.
- Un estilo editado a mano en `parametro` se salta la validación y el historial; la guía lo desaconseja.
- Si Redis falla justo al publicar, el estilo queda publicado y los demás procesos lo toman en el TTL de respaldo (5 minutos).
- El historial guarda la fecha en que cada versión **dejó de estar vigente**, no la de su publicación original.
- Solo se edita el estilo: las reglas no negociables y la plantilla del turno siguen en código (por diseño).

## Pendientes abiertos

- `[manual]` T6: corrida real de evals con un estilo candidato y verificación por WhatsApp.
- Heredados: corrida real de la 08b (EVL3), P30, P32, P36 y P41.

## Qué aprendimos que cambia las fases siguientes

1. **Un módulo pequeño y público cuesta poco y evita rutas internas**: `EstiloModule` dejó que un comando de `scripts/` compusiera una
   parte del agente sin arrastrar el LLM ni las colas. Lo mismo servirá para el kill switch de la 09a.
2. **El patrón de copia en memoria con versión en Redis** ya está probado en dos lugares (catálogo y estilo): la próxima configuración
   editable en caliente debería reutilizarlo.
3. **Una prueba de mutación vale lo que un RED** cuando el comportamiento ya existe: confirma que el e2e detecta el fallo que dice cubrir.
4. El back office de las fases 11-14 **reutiliza los casos de uso** de publicar, restaurar e historial; solo hace falta la pantalla.
