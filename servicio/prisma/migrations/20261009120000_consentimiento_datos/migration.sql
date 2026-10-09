-- AlterTable
ALTER TABLE "contacto" ADD COLUMN     "consentimiento_datos_en" TIMESTAMPTZ(3),
ADD COLUMN     "consentimiento_rechazado_en" TIMESTAMPTZ(3);

-- [manual] contacto_consentimiento_excluyente_check — CHECK (Fase 12d, PRV1):
-- un contacto nunca tiene a la vez aceptación y rechazo del tratamiento de datos; aceptar borra el rechazo y
-- rechazar borra la aceptación. Prisma no expresa CHECK por sí solo.
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_consentimiento_excluyente_check" CHECK ("consentimiento_datos_en" IS NULL OR "consentimiento_rechazado_en" IS NULL);
