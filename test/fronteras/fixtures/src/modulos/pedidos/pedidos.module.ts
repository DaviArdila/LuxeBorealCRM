// Fixture de fronteras (T3, D10 regla 12, permitido): el módulo de composición (`<m>.module.ts`)
// SÍ puede importar PrismaModule desde plataforma/prisma; solo aplicacion/, puertos/ e interfaz/
// tienen prohibido este import (D10).
import { PrismaModule } from '../../plataforma/prisma/index.js';

export const modulo = PrismaModule;
