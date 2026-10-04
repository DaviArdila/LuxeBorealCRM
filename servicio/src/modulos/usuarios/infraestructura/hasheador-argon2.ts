import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { HasheadorContrasena } from '../puertos/hasheador-contrasena.js';

/**
 * Parámetros argon2id de OWASP (D6): 19 MiB, 2 pasadas, 1 hilo. No se pasa `algorithm`: argon2id es el valor por
 * defecto de `@node-rs/argon2` y su enum `Algorithm` es un `const enum` ambiental que `isolatedModules` no deja usar
 * (registro de compatibilidad de T1).
 */
const PARAMETROS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Adaptador argon2id de {@link HasheadorContrasena} (USR1, USR10, D6). */
@Injectable()
export class HasheadorArgon2 implements HasheadorContrasena, OnModuleInit {
  private hashFicticio: Promise<string> | undefined;

  /** Calcula una vez el hash ficticio al arrancar, para que el primer correo inexistente no tarde más (D6). */
  async onModuleInit(): Promise<void> {
    await this.obtenerHashFicticio();
  }

  async hashear(contrasena: string): Promise<string> {
    return hash(contrasena, PARAMETROS);
  }

  async verificar(hashGuardado: string, contrasena: string): Promise<boolean> {
    try {
      return await verify(hashGuardado, contrasena);
    } catch {
      return false;
    }
  }

  async verificarFicticio(contrasena: string): Promise<void> {
    await this.verificar(await this.obtenerHashFicticio(), contrasena);
  }

  private obtenerHashFicticio(): Promise<string> {
    this.hashFicticio ??= hash(randomBytes(32).toString('base64url'), PARAMETROS);
    return this.hashFicticio;
  }
}
