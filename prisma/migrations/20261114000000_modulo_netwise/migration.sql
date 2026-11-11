-- Módulo Netwise: catálogo de servicios y cotizaciones con marca
-- AlterTable
ALTER TABLE "Cotizacion" ADD COLUMN     "marca" "Marca" NOT NULL DEFAULT 'ZAAZMAGO';

-- AlterTable
ALTER TABLE "CotizacionItem" ADD COLUMN     "servicioNetwiseId" INTEGER;

-- CreateTable
CREATE TABLE "ServicioNetwise" (
    "id" SERIAL NOT NULL,
    "categoria" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "unidad" TEXT NOT NULL DEFAULT 'servicio',
    "precio" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicioNetwise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicioNetwise_categoria_idx" ON "ServicioNetwise"("categoria");

-- AddForeignKey
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_servicioNetwiseId_fkey" FOREIGN KEY ("servicioNetwiseId") REFERENCES "ServicioNetwise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
