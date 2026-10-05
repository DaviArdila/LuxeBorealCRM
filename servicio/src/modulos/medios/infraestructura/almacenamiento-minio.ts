import { Inject, Injectable } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import { ObjetoNoEncontrado, type Almacenamiento, type ObjetoAlmacenado } from '../puertos/almacenamiento.js';

/**
 * Región requerida por el constructor de `S3Client` aunque MinIO la ignore por completo (no tiene
 * el concepto de regiones de AWS); cualquier valor no vacío sirve.
 */
const REGION_S3_IGNORADA_POR_MINIO = 'us-east-1';

/**
 * Adaptador MinIO del puerto {@link Almacenamiento} (D3, MED1) sobre `@aws-sdk/client-s3`
 * (`S3Client`, `PutObjectCommand`, `DeleteObjectCommand` — ADR-0012 ya nombra este SDK). El bucket
 * es público y de URL determinística (D3): {@link obtenerUrl} construye la URL de forma
 * **síncrona** por dentro, envuelta en `Promise.resolve(...)` para cumplir la interfaz — nunca pide
 * una URL firmada, porque las fotos de catálogo se citan al cliente por WhatsApp y pueden reabrirse
 * semanas después.
 */
@Injectable()
export class AlmacenamientoMinio implements Almacenamiento {
  private readonly cliente: S3Client;
  private readonly bucket: string;
  private readonly urlPublicaBase: string;

  constructor(@Inject(CONFIGURACION) configuracion: Configuracion) {
    const esquema = configuracion.MINIO_SSL ? 'https' : 'http';
    this.bucket = configuracion.MINIO_BUCKET;
    this.cliente = new S3Client({
      endpoint: `${esquema}://${configuracion.MINIO_ENDPOINT}:${configuracion.MINIO_PUERTO}`,
      region: REGION_S3_IGNORADA_POR_MINIO,
      credentials: {
        accessKeyId: configuracion.MINIO_ACCESS_KEY,
        secretAccessKey: configuracion.MINIO_SECRET_KEY,
      },
      // MinIO self-hosted resuelve por ruta (`<endpoint>/<bucket>/<clave>`), no por subdominio
      // virtual (`<bucket>.<endpoint>/<clave>`) — D3.
      forcePathStyle: true,
    });
    this.urlPublicaBase = configuracion.MINIO_URL_PUBLICA ?? `${esquema}://${configuracion.MINIO_ENDPOINT}:${configuracion.MINIO_PUERTO}`;
  }

  async guardar(clave: string, contenido: Buffer, contentType: string): Promise<void> {
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        Body: contenido,
        ContentType: contentType,
      }),
    );
  }

  /**
   * URL pública determinística (D3): `<urlPublicaBase>/<bucket>/<clave>`, sin URL firmada ni
   * expiración. La construcción es síncrona; se envuelve en `Promise.resolve` solo para cumplir la
   * firma del puerto {@link Almacenamiento}.
   */
  obtenerUrl(clave: string): Promise<string> {
    return Promise.resolve(`${this.urlPublicaBase}/${this.bucket}/${clave}`);
  }

  /**
   * MED10: `GetObjectCommand` y lectura completa del cuerpo. Un `NoSuchKey` se traduce a
   * {@link ObjetoNoEncontrado}; cualquier otro fallo del SDK se propaga tal cual para que quien
   * lee lo trate como transitorio (no se filtran detalles del proveedor hacia el dominio).
   */
  async leer(clave: string): Promise<ObjetoAlmacenado> {
    try {
      const respuesta = await this.cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: clave }));
      const bytes = await respuesta.Body?.transformToByteArray();
      if (bytes === undefined) throw new ObjetoNoEncontrado(clave);
      return {
        contenido: Buffer.from(bytes),
        contentType: respuesta.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') throw new ObjetoNoEncontrado(clave);
      throw error;
    }
  }

  async eliminar(clave: string): Promise<void> {
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }));
  }
}
