import { Module } from '@nestjs/common';

// Trivial por diseño (T2, design.md "Archivos/áreas"): los módulos de plataforma
// (ConfiguracionModule, RelojModule, ObservabilidadModule, PrismaModule, RedisModule, SaludModule)
// se cablean en T9, cuando existen.
@Module({})
export class AppModule {}
