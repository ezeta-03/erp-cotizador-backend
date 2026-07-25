-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN IF NOT EXISTS "cotizacionId" INTEGER;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Reserva_cotizacionId_fkey'
  ) THEN
    ALTER TABLE "Reserva"
      ADD CONSTRAINT "Reserva_cotizacionId_fkey"
      FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
