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
      comment: 'dominio/ de un módulo solo importa su propio dominio y compartido/ (skill §2).',
      severity: 'error',
      from: { path: '^src/modulos/([^/]+)/dominio/' },
      to: { pathNot: ['^src/modulos/$1/dominio/', '^src/compartido/'] },
    },
    {
      name: 'prisma-solo-en-infraestructura',
      comment:
        '@prisma/client, @prisma/adapter-pg y el cliente generado solo se importan desde ' +
        'plataforma/prisma o infraestructura/ de cada módulo (skill §2). Antes de que T8 instale ' +
        'Prisma, dependency-cruiser no puede resolver estos paquetes y reporta `to.path` como el ' +
        'specifier tal cual (`@prisma/client`); una vez instalados, `to.path` pasa a ser la ruta ' +
        'resuelta dentro de node_modules — de ahí las dos formas de cada patrón (revisar en T8 con ' +
        'el paquete real instalado que la forma resuelta sigue coincidiendo).',
      severity: 'error',
      from: {
        pathNot: ['^src/plataforma/prisma/', '^src/modulos/[^/]+/infraestructura/'],
      },
      to: {
        path: [
          '^@prisma/client$',
          '^@prisma/adapter-pg$',
          '^node_modules/@prisma/client(/|$)',
          '^node_modules/@prisma/adapter-pg(/|$)',
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
  ],
  options: {
    // Las fronteras del proyecto no analizan ciclos ni imports internos de paquetes de terceros.
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
