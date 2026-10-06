-- CreateEnum
CREATE TYPE "disparador_caso" AS ENUM ('evento', 'intencion');

-- CreateEnum
CREATE TYPE "modo_caso" AS ENUM ('literal', 'guia');

-- CreateTable
CREATE TABLE "categoria_caso" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_normalizado" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_caso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caso_asistente" (
    "id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "titulo_normalizado" TEXT NOT NULL,
    "cuando_aplica" TEXT NOT NULL,
    "disparador" "disparador_caso" NOT NULL,
    "clave_sistema" TEXT,
    "modo" "modo_caso" NOT NULL DEFAULT 'literal',
    "texto" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "busqueda_normalizada" TEXT NOT NULL,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caso_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categoria_caso_nombre_normalizado_key" ON "categoria_caso"("nombre_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "caso_asistente_titulo_normalizado_key" ON "caso_asistente"("titulo_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "caso_asistente_clave_sistema_key" ON "caso_asistente"("clave_sistema");

-- CreateIndex
CREATE INDEX "caso_asistente_categoria_id_idx" ON "caso_asistente"("categoria_id");

-- AddForeignKey
ALTER TABLE "caso_asistente" ADD CONSTRAINT "caso_asistente_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_caso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- [manual] caso_asistente_evento_requiere_sistema_check — CHECK (Fase 12, CAS4/CAS5):
-- un caso de disparador `evento` (lo envía el código, no el LLM) exige clave del sistema y modo `literal`;
-- Prisma no expresa CHECK por sí solo.
ALTER TABLE "caso_asistente" ADD CONSTRAINT "caso_asistente_evento_requiere_sistema_check" CHECK ("disparador" <> 'evento' OR ("clave_sistema" IS NOT NULL AND "modo" = 'literal'));

-- [manual] caso_asistente_sistema_activo_check — CHECK (Fase 12, CAS4):
-- un caso con clave del sistema nunca está inactivo: el código lo necesita siempre.
ALTER TABLE "caso_asistente" ADD CONSTRAINT "caso_asistente_sistema_activo_check" CHECK ("clave_sistema" IS NULL OR "activo");
