// Fronteras entre módulos (D11 de openspec/changes/fase-00a-esqueleto/design.md, skill
// luxeboreal-arquitectura §2). CommonJS porque el proyecto es ESM (`"type": "module"` en
// package.json) y dependency-cruiser carga la config de fronteras sin transpilar: la extensión
// `.cjs` la aísla del modo ESM del resto del repo.
//
// Los patrones `$1` en `to.path`/`to.pathNot` son un mecanismo nativo de dependency-cruiser: toma
// el primer grupo de captura de la expresión regular de `from.path` y lo sustituye en `to`
// (`src/validate/match-dependency-rule.mjs` → `extractGroups` + `replaceGroupPlaceholders`), lo
// que permite expresar "el mismo módulo/submódulo del origen" sin enumerar nombres concretos.
module.exports = {
  forbidden: [
    {
      name: 'sin-ciclos',
      comment:
        'Ningún ciclo de imports entre módulos (skill §2); un ciclo también rompe el bundling ' +
        'de SWC+ESM (design D7).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'compartido-puro',
      comment:
        'compartido/ no importa nada fuera de sí mismo — ni otro módulo, ni npm, ni core de ' +
        'Node (skill §1, §2).',
      severity: 'error',
      from: { path: '^src/compartido/' },
      to: { pathNot: '^src/compartido/' },
    },
    {
      name: 'dominio-aislado',
      comment:
        'dominio/ de un módulo solo importa su propio dominio y compartido/ (skill §2). Los ' +
        'tests unitarios colocados junto al código (*.spec.ts) quedan fuera de esta regla, igual ' +
        'que la regla 9 los exceptúa de "sin devDependencies" (skill §7) — hallazgo real de T3 de ' +
        'fase-01-persistencia: sin esta excepción, ningún dominio/*.spec.ts podría importar ' +
        '`vitest`.',
      severity: 'error',
      from: { path: '^src/modulos/([^/]+)/dominio/', pathNot: '\\.spec\\.ts$' },
      to: { pathNot: ['^src/modulos/$1/dominio/', '^src/compartido/'] },
    },
    {
      name: 'prisma-solo-en-infraestructura',
      comment:
        '@prisma/client, @prisma/adapter-pg y el cliente generado solo se importan desde ' +
        'plataforma/prisma o infraestructura/ de cada módulo (skill §2). Con el paquete real ' +
        'instalado (T8), `to.path` es la ruta resuelta dentro de node_modules; el prefijo depende ' +
        'de `baseDir` — "node_modules/@prisma/client/..." cuando `baseDir` es la raíz del repo ' +
        '(`npm run fronteras`), pero "../../../node_modules/@prisma/client/..." cuando `baseDir` ' +
        'es `test/fronteras/fixtures/` (dependency-cruiser.spec.ts, `baseDir` más profundo que el ' +
        'repo real), de ahí que el patrón no ancle `node_modules` al inicio de la cadena. Los ' +
        'patrones del specifier bare (`^@prisma/client$`) cubren el caso sin el paquete instalado ' +
        '(no aplica ya en 00a, pero no daña dejarlos).',
      severity: 'error',
      from: {
        pathNot: ['^src/plataforma/prisma/', '^src/modulos/[^/]+/infraestructura/'],
      },
      to: {
        path: [
          '^@prisma/client$',
          '^@prisma/adapter-pg$',
          '(^|/)node_modules/@prisma/client(/|$)',
          '(^|/)node_modules/@prisma/adapter-pg(/|$)',
          '^src/plataforma/prisma/generado/',
        ],
      },
    },
    {
      name: 'sin-rutas-internas-de-modulo',
      comment:
        'Un módulo solo importa lo que otro módulo exporta en su index.ts, nunca una ruta ' +
        'interna (skill §2, ADR-0001).',
      severity: 'error',
      from: { path: '^src/modulos/([^/]+)/' },
      to: {
        path: '^src/modulos/[^/]+/',
        pathNot: ['^src/modulos/$1/', '^src/modulos/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'sin-rutas-internas-de-plataforma',
      comment:
        'Un submódulo de plataforma/ solo importa archivos internos propios; desde otros ' +
        'orígenes solo se importa el index.ts público.',
      severity: 'error',
      // El primer patrón captura el submódulo de plataforma de origen; la alternativa cubre los
      // demás archivos de src/ sin captura, de modo que solo pueden importar un index.ts público.
      from: { path: '^src/(?:plataforma/([^/]+)/|[^/]+(?:/|$))' },
      to: {
        path: '^src/plataforma/[^/]+/',
        pathNot: ['^src/plataforma/$1/', '^src/plataforma/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'plataforma-no-conoce-modulos',
      comment: 'plataforma/ no importa nada de modulos/ (dirección de dependencias, skill §2).',
      severity: 'error',
      from: { path: '^src/plataforma/' },
      to: { path: '^src/modulos/' },
    },
    {
      name: 'src-no-importa-test',
      comment:
        'Los dobles de prueba viven en test/fakes/, nunca al revés (skill §3). Los tests ' +
        'unitarios colocados junto al código (*.spec.ts) sí pueden importar un doble de ' +
        '`test/fakes/`, igual que la regla 3 y la regla 9 ya exceptúan a los `.spec.ts` de sus ' +
        'propias restricciones — hallazgo real de T4 de fase-01-persistencia: ' +
        '`sembrar-geografia.spec.ts` bajo `aplicacion/` necesita ' +
        '`test/fakes/repositorio-geografia-en-memoria.ts` para probar el caso de uso con un ' +
        'puerto falso (skill §7, "casos de uso con puertos falsos").',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.spec\\.ts$' },
      to: { path: '^test/' },
    },
    {
      name: 'src-sin-dev-dependencies',
      comment: 'El código de producción no depende de paquetes de devDependencies.',
      severity: 'error',
      // Los tests unitarios colocados junto al código viven en src/ y pueden usar devDependencies.
      from: { path: '^src/', pathNot: '\\.spec\\.ts$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'sin-irresolubles',
      comment: 'Todo import MUST resolver a un módulo real (ESM exige extensión .js explícita).',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'scripts-solo-barriles-de-plataforma',
      comment:
        'scripts/ solo importa la API pública de cada submódulo de plataforma (D12 de 00b).',
      severity: 'error',
      from: { path: '^scripts/' },
      to: {
        path: '^src/plataforma/[^/]+/',
        pathNot: '^src/plataforma/[^/]+/index\\.ts$',
      },
    },
    {
      name: 'prisma-service-solo-en-infraestructura',
      comment:
        'La regla 4 prohíbe @prisma/client fuera de infraestructura/, pero no cierra el hueco de ' +
        'importar el barril público plataforma/prisma/index.ts, que expone PrismaService (un ' +
        'PrismaClient completo) — D10 de openspec/changes/fase-01-persistencia/design.md. Solo ' +
        'infraestructura/ de cada módulo y <m>.module.ts (raíz de composición) pueden tocar ' +
        'plataforma/prisma; aplicacion/, puertos/ e interfaz/ no.',
      severity: 'error',
      from: { path: '^src/modulos/[^/]+/(aplicacion|puertos|interfaz)/' },
      to: { path: '^src/plataforma/prisma/' },
    },
    {
      name: 'solo-conversaciones-importa-canales',
      comment:
        'D9 de la Fase 04 / D15 de la Fase 05: solo modulos/conversaciones importa el barril de ' +
        'modulos/canales (previsto para que solo conversaciones use SALIDA_CANAL). ' +
        'dependency-cruiser resuelve por archivo, no por export nombrado, así que esta regla ' +
        'protege el barril completo de canales/index.ts — mismo objetivo práctico, sin poder ' +
        'distinguir qué símbolo concreto se importó (desviación anotada en tasks.md T6).',
      severity: 'error',
      from: {
        pathNot: ['^src/modulos/canales/', '^src/modulos/conversaciones/', '^src/app\\.module\\.ts$'],
      },
      to: { path: '^src/modulos/canales/index\\.ts$' },
    },
    {
      name: 'ai-solo-en-infraestructura-llm',
      comment:
        'ADR-0002 / LLM11 (Fase 06): el AI SDK (`ai`) y los providers de proveedores (OpenRouter y ' +
        '`@ai-sdk/*`, ADR-0019 / LLM20) solo se ' +
        'importan desde modulos/llm/infraestructura/, el único lugar que conoce a un proveedor. ' +
        'Cubre el specifier bare y la ruta resuelta en node_modules (mismo criterio que la regla ' +
        '4 con @prisma/client). Numerada 14 porque la 13 ya es solo-conversaciones-importa-canales.',
      severity: 'error',
      from: { pathNot: '^src/modulos/llm/infraestructura/' },
      to: {
        path: [
          '^ai$',
          '^@openrouter/',
          '^@ai-sdk/',
          '(^|/)node_modules/ai(/|$)',
          '(^|/)node_modules/@openrouter/',
          '(^|/)node_modules/@ai-sdk/',
        ],
      },
    },
    {
      name: 'conversaciones-no-conoce-agente',
      comment:
        'ADR-0016 / D4 de la Fase 07a: conversaciones es dueña del puerto GENERADOR_RESPUESTA y no ' +
        'depende de su implementación; agente importa el barril de conversaciones (token y tipos) y ' +
        'AppModule los compone con ConversacionesModule.conGenerador(AgenteModule). Numerada 15.',
      severity: 'error',
      from: { path: '^src/modulos/conversaciones/' },
      to: { path: '^src/modulos/agente/' },
    },
    {
      name: 'asistente-no-conoce-a-sus-consumidores',
      comment:
        'D2 de la Fase 12: asistente es dueño de la lista de casos del sistema y del puerto de textos; agente, ' +
        'conversaciones, catalogo y llm importan su barril (puerto y claves) y asistente no importa a ninguno, así no ' +
        'hay ciclos. Numerada 16.',
      severity: 'error',
      from: { path: '^src/modulos/asistente/' },
      to: { path: '^src/modulos/(agente|conversaciones|catalogo|llm|configuracion)/' },
    },
  ],
  options: {
    // Las fronteras del proyecto no analizan ciclos ni imports internos de paquetes de terceros
    // ni del cliente Prisma generado (T8): `doNotFollow` deja de recorrer más allá de
    // `generado/`, así que sus propios imports internos nunca se convierten en aristas "desde
    // generado/" (design.md, "el directorio generado/ queda excluido de dependency-cruiser como
    // origen"); la arista *hacia* `generado/` sigue existiendo y la sigue verificando la regla
    // `prisma-solo-en-infraestructura`.
    doNotFollow: {
      path: 'node_modules|^src/plataforma/prisma/generado/',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    // T4 de fase-03-importador-medios: `csv-parse` (D10) solo declara subrutas (`./sync`) en su
    // `package.json` `exports`, sin un campo `main` que las cubra. El resolvedor de
    // dependency-cruiser (`enhanced-resolve`) no consulta `exports` a menos que se le pida
    // explícitamente (`exportsFields: []` es su valor por defecto, confirmado en
    // `node_modules/dependency-cruiser/src/main/resolve-options/normalize.mjs`); sin esto, la
    // regla `sin-irresolubles` marca `csv-parse/sync` como no resoluble aunque Node/Vitest lo
    // resuelvan sin problema. Mismos nombres de condición que la plantilla oficial de
    // `dependency-cruiser init` para proyectos ESM.
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
