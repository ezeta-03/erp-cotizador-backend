-- Los parámetros de costo dejan de ser globales: ahora son propios de cada panel/mupi
-- (tamaño, N° de caras y demás varían de uno a otro).
DELETE FROM "ParametrosCostoMupi";

ALTER TABLE "ParametrosCostoMupi" ADD COLUMN "panelId" INTEGER NOT NULL;

CREATE UNIQUE INDEX "ParametrosCostoMupi_panelId_key" ON "ParametrosCostoMupi"("panelId");

ALTER TABLE "ParametrosCostoMupi" ADD CONSTRAINT "ParametrosCostoMupi_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
