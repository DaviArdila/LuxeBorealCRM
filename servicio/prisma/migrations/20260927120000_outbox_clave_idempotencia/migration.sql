-- AlterTable
-- D11 de openspec/changes/fase-04-canal-chatwoot/design.md: NOT NULL directo (sin default), porque
-- `outbox` no tiene escritor todavía (P7, MODELO_DATOS.md §7) — no hay filas que migrar. Si una
-- base de desarrollo tuviera filas manuales, esta migración falla con un mensaje claro; basta
-- vaciar `outbox` antes de aplicarla (skill luxeboreal-arquitectura §5).
ALTER TABLE "outbox" ADD COLUMN "clave_idempotencia" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "outbox_clave_idempotencia_key" ON "outbox"("clave_idempotencia");
