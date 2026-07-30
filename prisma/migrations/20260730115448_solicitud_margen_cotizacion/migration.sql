-- AlterTable
ALTER TABLE "SolicitudMargen" ADD COLUMN IF NOT EXISTS "cotizacionId" INTEGER;
ALTER TABLE "SolicitudMargen" ADD COLUMN IF NOT EXISTS "borradorId" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SolicitudMargen_cotizacionId_fkey'
  ) THEN
    ALTER TABLE "SolicitudMargen"
      ADD CONSTRAINT "SolicitudMargen_cotizacionId_fkey"
      FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
