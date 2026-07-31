-- CreateTable
CREATE TABLE "CostoFijoMupi" (
    "id" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "medida" TEXT,
    "costo" DOUBLE PRECISION,
    "costoHora" DOUBLE PRECISION,
    "precioSinIgv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurrente" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostoFijoMupi_pkey" PRIMARY KEY ("id")
);
