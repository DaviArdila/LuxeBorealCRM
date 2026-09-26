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
      comment: 'Los dobles de prueba viven en test/fakes/, nunca al revés (skill §3).',
      severity: 'error',
      from: { path: '^src/' },
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
  },
};
