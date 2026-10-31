-- AlterTable
ALTER TABLE "Comprobante" ADD COLUMN     "cuotas" JSONB,
ADD COLUMN     "detraccionCodigo" TEXT,
ADD COLUMN     "detraccionCuenta" TEXT,
ADD COLUMN     "detraccionMonto" DOUBLE PRECISION,
ADD COLUMN     "detraccionPorcentaje" DOUBLE PRECISION,
ADD COLUMN     "formaPago" TEXT NOT NULL DEFAULT 'CONTADO',
ADD COLUMN     "observacion" TEXT,
ADD COLUMN     "validacionSunat" JSONB,
ADD COLUMN     "validadoAt" TIMESTAMP(3);

