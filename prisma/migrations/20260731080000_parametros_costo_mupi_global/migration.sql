-- Reemplaza el modelo de costos por reserva (CostoFijoMupi) por un modelo de
-- parámetros de costo globales, aplicados por igual a todos los mupis/paletas.
DROP TABLE "CostoFijoMupi";

ALTER TABLE "Reserva" DROP COLUMN "precioProduccionInstalacion";

CREATE TABLE "ParametrosCostoMupi" (
    "id" SERIAL NOT NULL,
    "luz" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "costoHoraManoObra" DOUBLE PRECISION NOT NULL DEFAULT 32,
    "horasMantenimiento" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "horasInstalacion" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "costoLona" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "anchoLona" DOUBLE PRECISION NOT NULL DEFAULT 1.83,
    "altoLona" DOUBLE PRECISION NOT NULL DEFAULT 0.83,
    "numeroCaras" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametrosCostoMupi_pkey" PRIMARY KEY ("id")
);
