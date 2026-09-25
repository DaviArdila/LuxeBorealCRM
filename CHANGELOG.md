# Changelog

Generado automáticamente con [git-cliff](https://git-cliff.org) a partir de los commits de
Conventional Commits (CI8, `openspec/specs/integracion-continua/spec.md`). **No editar a mano**:
cualquier corrección se hace corrigiendo el commit origen (si aún no se publicó) o agregando un
commit nuevo, nunca editando este archivo directamente.
## [Sin publicar]

### Características

- Inicializar esqueleto NestJS 12 ESM con Vitest ([a51a0d1](../../commit/a51a0d1fe854944660805b35a71be89be557dcf0))
- Validar configuración con Zod al arrancar ([2aa152d](../../commit/2aa152dcd704e8477a590ae1d187210fe00e11b7))
- Agregar Clock inyectable y ClockFalso para tests ([fcb182b](../../commit/fcb182b61474da78e7e01067fa665b762d10bfa2))
- Portar dinero, texto y numero como funciones puras ([d2aa48a](../../commit/d2aa48a4212bf62651a36dd25fade59adca96ed2))
- Logger nestjs-pino con redaccion R14 ([2214f0c](../../commit/2214f0c229f50b6b2e4e62a3827707d5b251184b))
- Compose de desarrollo, prisma minimo y cliente redis ([8c93a13](../../commit/8c93a13c7d99fefbee57a27a3c3911b8e6405d0a))
- Health check de postgres y redis con apagado ordenado ([7344138](../../commit/73441386b1a3d3b725d1abaee4247e9240ba3c28))
- Agregar hooks locales, commitlint, gitleaks y auditoria de dependencias ([77f78a4](../../commit/77f78a4935c9740620909c4792dc79a8c6f836c7))
- Agregar filtro RFC 9457 y pipe de validacion nativo ([0290b5e](../../commit/0290b5ec9172f62b7bca5df2210ee4e612272cdf))
- Generar el contrato OpenAPI de forma determinista ([da2da40](../../commit/da2da40a1837274cd9f72c4ca3066c24fca0354b))
- Documentar /health como internal y montar /docs con Scalar ([64a4e0a](../../commit/64a4e0ad1b3f854f69076b9a4a7e8fb81349b4e4))
- Agregar lint y diff del contrato OpenAPI con Spectral y oasdiff ([1702eeb](../../commit/1702eeb91ffc94235a4dfa4a91f2efb70490dafd))
- Agregar workflow de GitHub Actions y componer npm run ci ([d18c2d7](../../commit/d18c2d7555bd649fc21bcdb1d7ce8568e26951c3))

### Correcciones

- Make openspec config valid yaml and require closing record ([0466785](../../commit/0466785aa8f4f8849cf8687fb41622447233f356))
- Reforzar clasificacion de errores tras review RDD ([1677fdc](../../commit/1677fdc3abfba5138f51d465fdd9981270e06619))
- Cubrir ruta resuelta de @prisma/* tras review RDD ([704e895](../../commit/704e895bc10d38e6e866254625c5cacdacf54eda))
- No lanzar en apagado si el cliente nunca conecto ([4048771](../../commit/4048771aa2f993550250f5703cdb2ada6232f1f0))
- Corregir referencias y conteos tras el archivado de 00a ([f3fd4d3](../../commit/f3fd4d32401b1f8a1c7c69567236de9380d32692))

### Documentación

- Add initial planning documents ([f3fcbc6](../../commit/f3fcbc66792fb5915a8d48388fdea9ebcbf1ba70))
- Accept pending ADRs 0001 0003 0004 0005 0007 ([1865c12](../../commit/1865c122eca67ee36322d347957f9e1beb88add7))
- Move invariants to openspec specs ([28c5829](../../commit/28c5829cb7dd780d22ae1464235f633dbdca5ee2))
- Adopt sdd cycle for phases ([00e9a52](../../commit/00e9a5281812e16d3ac43acf3f5a0df502fdbd43))
- Record decisions on open questions ([b09f81a](../../commit/b09f81afa2f72b77a2e979a57a8c58de1b01f8c7))
- Close adopt-openspec tracking tasks ([499536a](../../commit/499536adc2558edaf6ae8ce97b06e45c841baa53))
- Fix R13 cost rule and cover spending ceiling ([671e904](../../commit/671e904a356324a21d4b0bb259571fd696b3e093))
- Align tdd gate, scenario test naming and approval gate ([4d0b28a](../../commit/4d0b28a72f842f5e6615ef137375cb758fba3fb6))
- Record review follow-up in tracking file ([cc60476](../../commit/cc6047637fc0e2823e6a12742fd5dbc92690ce1f))
- Propose api contract with openapi code-first ([db02667](../../commit/db026677b69d3e64c5cda8e1838f45b118c04b5e))
- Api contract and documentation standard in workflow ([884ef1d](../../commit/884ef1d0cbeb7cc21b3ec08487977ad4e1f75760))
- Record future back-office client guidance ([10ff7cb](../../commit/10ff7cb29072d30b4375f84f73614365c3c95808))
- Fix closing checklist references after skill renumbering ([407c97f](../../commit/407c97f8525350ef76ecfee80a02950c414bd48e))
- Harden api idempotency, auth and contract determinism ([8d6ca19](../../commit/8d6ca19ee66c8cd82210185a330d4109aca94d45))
- Accept ADR-0008 and approve SPEC 0.3 ([4c412da](../../commit/4c412dae7af148fd9feb04b0a7808bc036719c5f))
- Add fase-00 exploration and switch preflight to automatic pace ([3f15755](../../commit/3f157550d04831880ab7ced84082f39380d61b8d))
- Amend ADR-0001 to NestJS 12 and switch runner to Vitest ([799a5ec](../../commit/799a5ec4c1513e9c9a2e23f2cd7842e064ff5280))
- Split fase 00 into 00a and 00b ([6fdb5a4](../../commit/6fdb5a47a1c64cefbcb7b6804ee5add1d49fa6a1))
- Apply fase 00a/00b split content ([b3f4ec4](../../commit/b3f4ec4d4725cdadc0734317e384e1c3fe5c52af))
- Point remaining fase 00 references to 00a/00b ([d649782](../../commit/d64978254b2e1b4acd3c31a0f8fca79f1ffaa8b6))
- Add fase-00a proposal ([76d19b6](../../commit/76d19b6f1da1a7fd6b7b31621f454742101dd20c))
- Add fase-00a specs and design ([e0535eb](../../commit/e0535eb2ed6e2092c803c543d04cea1a7edc0924))
- Fix api2 test name markup in fase-00a design ([f91e156](../../commit/f91e15694fab1d4989e1bc8b94530efc009225b2))
- Add fase-00a tasks ([10f7951](../../commit/10f7951366ba6a25f606c8ecd924262695d50c44))
- Add task checklist to fase-00a tasks ([0f67ec9](../../commit/0f67ec937edda0e8fef48981347db127586762c4))
- Approve fase-00a-esqueleto change ([d4b20b0](../../commit/d4b20b0cb70a826b5d4a4e6271ee035d06185492))
- Replace nestjs-zod with native nestjs 12 zod support ([5cb5c07](../../commit/5cb5c078e86b6cf8ae5751eebdde9e8a4937f32d))
- Mark fase-00a task 1 done (nestjs 12 confirmed) ([475545e](../../commit/475545e689cfd5d42149c7d171dcc4a26e6ccb5b))
- Fix stale nestjs-zod mention in fase 00b roadmap row ([f6be60a](../../commit/f6be60a71e29209f466715a2faf16c43cad1901b))
- Fix adr-0008 title still naming the replaced nestjs-zod mechanism ([6786818](../../commit/6786818d3b11c6e32b0e4d105b7faa279f4628b4))
- Registrar hash del commit de T5 en tasks.md ([85d5e9b](../../commit/85d5e9b53e9b0bd6fb28b5608fc4dddaf6618feb))
- Registrar hash del commit de T6 en tasks.md ([9910bb3](../../commit/9910bb309e10ca40de0c935dda812375c983596d))
- Registrar hallazgo de review sobre redaccion de err.message ([462f935](../../commit/462f935b5f1458e6336899b40b3684f1dbbec349))
- Documentar variables de entorno de desarrollo ([b2bd6d0](../../commit/b2bd6d01addad1fc9e3a75f38d54432bb34641b5))
- Registrar hash del commit de cierre de T3 ([c8a6fc6](../../commit/c8a6fc6cdd2d13c07cbb0be713a507efa04aa40c))
- Registrar hash del commit de T7 ([0daed13](../../commit/0daed133fce26260d9ef6ca756e32849b84cd72e))
- Registrar hash del commit de T8 en tasks.md ([899378b](../../commit/899378bc42a19d4a7b1178f7a081da302ae2a2e5))
- Registrar hash del commit de T9 en tasks.md ([995988c](../../commit/995988c9b28939ebe595ebe66e3d93f638ae4004))
- Cerrar fase con comandos, skill y documentacion actualizada ([fa40269](../../commit/fa4026993c1e7034921918ab37a93d16e1515e9f))
- Unificar nombre del escenario R14 de PLT3 ([335da59](../../commit/335da59bb03cb08eb13344bb236a6d8deb493144))
- Planear la fase 00b (CI y contrato de API) ([403693e](../../commit/403693e3e96fa18753b02f1ad8d42762f63911e2))
- Registrar hash del commit de T1 en tasks.md ([9ed68e8](../../commit/9ed68e8e9812d34161dfe57fccd7242e549dda35))
- Registrar decisiones del usuario sobre T1 ([7e0c385](../../commit/7e0c385584f7c8d0d515e77cc3b55eda1ff7f092))
- Registrar hash del commit de T2 en tasks.md ([3e72626](../../commit/3e726261f1670fcfb6ff2bdb3b29d1186273e7a5))
- Registrar hash del commit de T3 en tasks.md ([6c70cac](../../commit/6c70cac602ce45bd20a83d1ddcad01a8d7b245eb))
- Registrar hash del commit de T4 en tasks.md ([f120d99](../../commit/f120d995fd48e6acbc82ed2eceeb6bc2584c91e6))
- Registrar hash del commit de T5 en tasks.md ([fdec913](../../commit/fdec91368c2467597f09385aac4f2c94062914c1))
- Registrar hash del commit de T6 en tasks.md ([b464c5c](../../commit/b464c5c23ecd14329ac09c86cbcc8b33529495bb))

### Mantenimiento

- Initialize openspec in hybrid mode ([4a80e33](../../commit/4a80e3349f11204fe8972f3258ac073cfc945f2f))
- Archive fase-00a-esqueleto ([099aba8](../../commit/099aba853ebd3d6539c618c8fb5fd2bf26f888ed))

### Tests

- Verificar reglas de dependency-cruiser y eslint ([92b9211](../../commit/92b9211545708a00595a0a960f78e5a26e0345a7))
- Restaurar el spy del logger en finally ([8e0250c](../../commit/8e0250c1bb96d4a4cb86c2dfbdb88dd097598083))

