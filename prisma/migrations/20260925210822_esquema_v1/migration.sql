-- CreateEnum
CREATE TYPE "estado_atencion" AS ENUM ('bot', 'handoff_pendiente', 'humano', 'pausado');

-- CreateEnum
CREATE TYPE "canal_conversacion" AS ENUM ('whatsapp', 'instagram', 'messenger', 'web', 'otro');

-- CreateEnum
CREATE TYPE "temperatura_lead" AS ENUM ('frio', 'tibio', 'caliente');

-- CreateEnum
CREATE TYPE "estado_lead" AS ENUM ('nuevo', 'en_atencion', 'ganado', 'perdido', 'descartado');

-- CreateEnum
CREATE TYPE "tipo_movimiento" AS ENUM ('entrada', 'salida', 'ajuste', 'devolucion');

-- CreateEnum
CREATE TYPE "origen_movimiento" AS ENUM ('usuario', 'sistema');

-- CreateEnum
CREATE TYPE "estado_venta" AS ENUM ('pendiente', 'confirmada', 'cancelada', 'rechazada');

-- CreateEnum
CREATE TYPE "estado_envio" AS ENUM ('pendiente', 'despachado', 'entregado', 'rechazado');

-- CreateEnum
CREATE TYPE "canal_venta" AS ENUM ('whatsapp', 'marketplace', 'instagram', 'presencial', 'otro');

-- CreateEnum
CREATE TYPE "metodo_pago" AS ENUM ('contraentrega', 'transferencia', 'efectivo');

-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('admin', 'asesor');

-- CreateTable
CREATE TABLE "categoria_producto" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "categoria_id" UUID,
    "nombre" TEXT NOT NULL,
    "descripcion_corta" TEXT NOT NULL,
    "descripcion_larga" TEXT NOT NULL,
    "precio_cop" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "peso_gramos" INTEGER,
    "largo_mm" INTEGER,
    "ancho_mm" INTEGER,
    "alto_mm" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,
    "clave_collage" TEXT,
    "fotos_hash" TEXT,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foto" (
    "id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "clave_archivo" TEXT NOT NULL,
    "es_portada" BOOLEAN NOT NULL DEFAULT false,
    "origen_url" TEXT,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametro" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametro_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "departamento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "departamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciudad" (
    "id" TEXT NOT NULL,
    "departamento_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "ciudad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zona_sin_cobertura" (
    "id" UUID NOT NULL,
    "departamento_id" TEXT NOT NULL,
    "ciudad_id" TEXT,
    "motivo" TEXT,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zona_sin_cobertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifa_estimada" (
    "id" UUID NOT NULL,
    "departamento_id" TEXT,
    "ciudad_id" TEXT,
    "peso_min_g" INTEGER NOT NULL DEFAULT 0,
    "peso_max_g" INTEGER,
    "rango_min_cop" INTEGER NOT NULL,
    "rango_max_cop" INTEGER NOT NULL,
    "dias_min" INTEGER NOT NULL,
    "dias_max" INTEGER NOT NULL,
    "contraentrega_disponible" BOOLEAN NOT NULL DEFAULT true,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarifa_estimada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_fuera_cobertura" (
    "id" UUID NOT NULL,
    "producto_id" UUID,
    "departamento_texto" TEXT NOT NULL,
    "ciudad_texto" TEXT,
    "departamento_id" TEXT,
    "ciudad_id" TEXT,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_fuera_cobertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacto" (
    "id" UUID NOT NULL,
    "chatwoot_contact_id" INTEGER,
    "telefono" TEXT,
    "nombre" TEXT,
    "documento" TEXT,
    "correo" TEXT,
    "telefono_alterno" TEXT,
    "direccion" TEXT,
    "localidad" TEXT,
    "departamento_texto" TEXT,
    "ciudad_texto" TEXT,
    "ciudad_id" TEXT,
    "ultimo_producto_id" UUID,
    "acepta_contacto" BOOLEAN NOT NULL DEFAULT false,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversacion" (
    "id" UUID NOT NULL,
    "contacto_id" UUID NOT NULL,
    "chatwoot_conversation_id" INTEGER NOT NULL,
    "canal" "canal_conversacion" NOT NULL,
    "estado" "estado_atencion" NOT NULL,
    "expira_control_en" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "contacto_id" UUID NOT NULL,
    "conversacion_id" UUID,
    "producto_id" UUID,
    "temperatura" "temperatura_lead" NOT NULL,
    "senales" JSONB NOT NULL,
    "resumen" TEXT NOT NULL,
    "derivado" BOOLEAN NOT NULL,
    "capturado_fuera_horario" BOOLEAN NOT NULL,
    "estado" "estado_lead" NOT NULL,
    "motivo_perdida" TEXT,
    "notificado_en" TIMESTAMPTZ(3),
    "recordatorio_en" TIMESTAMPTZ(3),
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excepcion_horario" (
    "fecha" DATE NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "excepcion_horario_pkey" PRIMARY KEY ("fecha")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "rol_usuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acceso" TIMESTAMPTZ(3),
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_inventario" (
    "id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "tipo" "tipo_movimiento" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "saldo_despues" INTEGER NOT NULL,
    "motivo" TEXT,
    "venta_id" UUID,
    "origen" "origen_movimiento" NOT NULL,
    "usuario_id" UUID,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "contacto_id" UUID NOT NULL,
    "lead_id" UUID,
    "usuario_id" UUID NOT NULL,
    "estado" "estado_venta" NOT NULL,
    "canal" "canal_venta" NOT NULL,
    "metodo_pago" "metodo_pago" NOT NULL,
    "notas" TEXT,
    "confirmada_en" TIMESTAMPTZ(3),
    "cerrada_en" TIMESTAMPTZ(3),
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_item" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario_cop" INTEGER NOT NULL,

    CONSTRAINT "venta_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envio" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "transportadora" TEXT NOT NULL,
    "numero_guia" TEXT,
    "estado" "estado_envio" NOT NULL,
    "porcentaje_contraentrega" DECIMAL(5,2),
    "recargo_contraentrega_cop" INTEGER NOT NULL,
    "costo_transportadora_cop" INTEGER,
    "direccion" TEXT NOT NULL,
    "localidad" TEXT NOT NULL,
    "ciudad_id" TEXT NOT NULL,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_entrante" (
    "id" UUID NOT NULL,
    "origen" TEXT NOT NULL,
    "id_externo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "recibido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesado_en" TIMESTAMPTZ(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "evento_entrante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_en" TIMESTAMPTZ(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximo_intento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uso_llm" (
    "id" UUID NOT NULL,
    "conversacion_id" UUID,
    "proveedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokens_entrada" INTEGER NOT NULL,
    "tokens_salida" INTEGER NOT NULL,
    "tokens_cache" INTEGER NOT NULL,
    "costo_estimado_usd" DECIMAL(12,6) NOT NULL,
    "latencia_ms" INTEGER NOT NULL,
    "exito" BOOLEAN NOT NULL,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uso_llm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categoria_producto_nombre_key" ON "categoria_producto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "producto_sku_key" ON "producto"("sku");

-- CreateIndex
CREATE INDEX "producto_activo_idx" ON "producto"("activo");

-- CreateIndex
CREATE INDEX "producto_categoria_id_idx" ON "producto"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "departamento_nombre_key" ON "departamento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ciudad_departamento_id_nombre_key" ON "ciudad"("departamento_id", "nombre");

-- [manual] zona_sin_cobertura_departamento_id_ciudad_id_key — NULLS NOT DISTINCT (D4, PER6/PER9):
-- dos filas de "todo el departamento" (mismo departamento_id, ciudad_id nulo) MUST tratarse como
-- duplicadas; sin esta cláusula, Postgres trata NULL <> NULL y el bug de tarifa_envio del
-- prototipo (../ChatLuxeCRM/tests/db/repositorios.test.ts:20-24) se repetiría aquí.
-- CreateIndex
CREATE UNIQUE INDEX "zona_sin_cobertura_departamento_id_ciudad_id_key" ON "zona_sin_cobertura"("departamento_id", "ciudad_id") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "contacto_chatwoot_contact_id_key" ON "contacto"("chatwoot_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacto_telefono_key" ON "contacto"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "contacto_documento_key" ON "contacto"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_chatwoot_conversation_id_key" ON "conversacion"("chatwoot_conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "venta_numero_key" ON "venta"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "venta_lead_id_key" ON "venta"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "envio_venta_id_key" ON "envio"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "evento_entrante_origen_id_externo_key" ON "evento_entrante"("origen", "id_externo");

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto" ADD CONSTRAINT "foto_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ciudad" ADD CONSTRAINT "ciudad_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zona_sin_cobertura" ADD CONSTRAINT "zona_sin_cobertura_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zona_sin_cobertura" ADD CONSTRAINT "zona_sin_cobertura_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifa_estimada" ADD CONSTRAINT "tarifa_estimada_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifa_estimada" ADD CONSTRAINT "tarifa_estimada_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_fuera_cobertura" ADD CONSTRAINT "evento_fuera_cobertura_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_fuera_cobertura" ADD CONSTRAINT "evento_fuera_cobertura_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "departamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_fuera_cobertura" ADD CONSTRAINT "evento_fuera_cobertura_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_ultimo_producto_id_fkey" FOREIGN KEY ("ultimo_producto_id") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contacto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contacto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- [manual] movimiento_inventario_cantidad_positiva_check — CHECK (cantidad > 0), D4/PER8/PER9:
-- "siempre positiva; el signo lo da tipo" (MODELO_DATOS.md §6); Prisma no expresa CHECK por sí solo.
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_cantidad_positiva_check" CHECK ("cantidad" > 0);

-- [manual] movimiento_inventario_usuario_si_origen_usuario_check — CHECK que exige usuario_id
-- cuando origen = 'usuario', D4/PER7/PER9 (MODELO_DATOS.md §6); Prisma no expresa CHECK por sí solo.
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_usuario_si_origen_usuario_check" CHECK ("origen" <> 'usuario' OR "usuario_id" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contacto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_item" ADD CONSTRAINT "venta_item_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_item" ADD CONSTRAINT "venta_item_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio" ADD CONSTRAINT "envio_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio" ADD CONSTRAINT "envio_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uso_llm" ADD CONSTRAINT "uso_llm_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
