import { Module } from '@nestjs/common';
import { ContratoFixtureController } from './contrato-fixture.controller.js';

/**
 * Fixture del pipeline de contrato (D3 de `design.md`): solo se importa desde tests
 * (`Test.createTestingModule({ imports: [AppModule, ContratoFixtureModule] })`), nunca desde
 * `src/` — la frontera `src-no-importa-test` (T1 de 00a) lo hace estructuralmente imposible.
 * `scripts/generar-contrato.ts` (T3) construye solo `AppModule`, así que estas rutas nunca
 * aparecen en el documento OpenAPI generado.
 */
@Module({
  controllers: [ContratoFixtureController],
})
export class ContratoFixtureModule {}
