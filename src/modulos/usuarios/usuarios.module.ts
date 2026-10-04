import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { CerrarSesion } from './aplicacion/cerrar-sesion.js';
import { IniciarSesion } from './aplicacion/iniciar-sesion.js';
import { ObtenerSesionActual } from './aplicacion/obtener-sesion-actual.js';
import { HasheadorArgon2 } from './infraestructura/hasheador-argon2.js';
import { RepositorioUsuarioPrisma } from './infraestructura/prisma/repositorio-usuario-prisma.js';
import { AlmacenSesionesRedis } from './infraestructura/redis/almacen-sesiones-redis.js';
import { LimiteIntentosRedis } from './infraestructura/redis/limite-intentos-redis.js';
import { AuthController } from './interfaz/auth.controller.js';
import { GuardiaCsrf } from './interfaz/guardia-csrf.js';
import { GuardiaRoles } from './interfaz/guardia-roles.js';
import { GuardiaSesion } from './interfaz/guardia-sesion.js';
import { ALMACEN_SESIONES } from './puertos/almacen-sesiones.js';
import { HASHEADOR_CONTRASENA } from './puertos/hasheador-contrasena.js';
import { LIMITE_INTENTOS } from './puertos/limite-intentos.js';
import { REPOSITORIO_USUARIO } from './puertos/repositorio-usuario.js';

/**
 * Módulo de usuarios (Fase 11a): dueño de la tabla `usuario` y de las sesiones. Registra las tres guardias globales
 * en orden —CSRF, sesión y roles (D3)—, de modo que toda ruta de `/api/v1` exige sesión salvo las `@Publico()`. No
 * importa ningún otro módulo de negocio; `canales` solo usa sus decoradores. `CLOCK` y `CONFIGURACION` son globales.
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [AuthController],
  providers: [
    { provide: REPOSITORIO_USUARIO, useClass: RepositorioUsuarioPrisma },
    { provide: ALMACEN_SESIONES, useClass: AlmacenSesionesRedis },
    { provide: HASHEADOR_CONTRASENA, useClass: HasheadorArgon2 },
    { provide: LIMITE_INTENTOS, useClass: LimiteIntentosRedis },
    IniciarSesion,
    CerrarSesion,
    ObtenerSesionActual,
    { provide: APP_GUARD, useClass: GuardiaCsrf },
    { provide: APP_GUARD, useClass: GuardiaSesion },
    { provide: APP_GUARD, useClass: GuardiaRoles },
  ],
  exports: [ObtenerSesionActual],
})
export class UsuariosModule {}
