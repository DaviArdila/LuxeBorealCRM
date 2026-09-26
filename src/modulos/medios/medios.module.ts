import { Module } from '@nestjs/common';
import { AlmacenamientoMinio } from './infraestructura/almacenamiento-minio.js';
import { ALMACENAMIENTO } from './puertos/almacenamiento.js';

/**
 * Módulo de medios (D1, D3): capacidad genérica de almacenamiento de objetos y generación de
 * collage — cualquier módulo futuro con archivos (fotos de perfil, adjuntos de soporte) la
 * reutiliza sin depender de `catalogo`. No importa `plataforma/config` explícito: `CONFIGURACION`
 * es `@Global()` (mismo patrón que usa `RedisModule`, ver `design.md` §"Módulos y dependencias").
 * `AppModule` MUST NOT importarlo todavía — lo hará la primera fase que exponga un endpoint sobre
 * él (07+), mismo patrón que `GeografiaModule`/`HorarioModule` tras sus fases.
 */
@Module({
  providers: [{ provide: ALMACENAMIENTO, useClass: AlmacenamientoMinio }],
  exports: [ALMACENAMIENTO],
})
export class MediosModule {}
