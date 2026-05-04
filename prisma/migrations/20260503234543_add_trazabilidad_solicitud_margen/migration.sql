-- AlterTable: agrega trazabilidad a SolicitudMargen
-- aprobadaPorId: quién aprobó o rechazó
-- resolvedAt: cuándo se tomó la decisión
-- motivoRechazo: motivo obligatorio al rechazar

ALTER TABLE "SolicitudMargen"
  ADD COLUMN "aprobadaPorId" INTEGER,
  ADD COLUMN "resolvedAt"    TIMESTAMP(3),
  ADD COLUMN "motivoRechazo" TEXT;

ALTER TABLE "SolicitudMargen"
  ADD CONSTRAINT "SolicitudMargen_aprobadaPorId_fkey"
  FOREIGN KEY ("aprobadaPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
