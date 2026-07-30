-- AlterTable
ALTER TABLE "SolicitudMargen" ADD COLUMN IF NOT EXISTS "clienteId" INTEGER;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SolicitudMargen_clienteId_fkey'
  ) THEN
    ALTER TABLE "SolicitudMargen"
      ADD CONSTRAINT "SolicitudMargen_clienteId_fkey"
      FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
