-- AlterTable: CostoFijoMupi pasa de ser una config global a una tabla por reserva
ALTER TABLE "CostoFijoMupi" ADD COLUMN     "reservaId" INTEGER;
ALTER TABLE "CostoFijoMupi" ADD COLUMN     "numeroCaras" DOUBLE PRECISION NOT NULL DEFAULT 2;

-- Ya no hay filas existentes (eran solo de config global/prueba), reservaId pasa a ser NOT NULL
DELETE FROM "CostoFijoMupi";
ALTER TABLE "CostoFijoMupi" ALTER COLUMN "reservaId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CostoFijoMupi_reservaId_concepto_key" ON "CostoFijoMupi"("reservaId", "concepto");

-- AddForeignKey
ALTER TABLE "CostoFijoMupi" ADD CONSTRAINT "CostoFijoMupi_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
