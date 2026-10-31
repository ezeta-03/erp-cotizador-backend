-- AlterEnum
ALTER TYPE "TipoComprobante" ADD VALUE 'NOTA_DEBITO';

-- AlterTable
ALTER TABLE "Comprobante" ADD COLUMN     "agenteRetencion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "correoEnviadoA" TEXT,
ADD COLUMN     "correoEnviadoAt" TIMESTAMP(3),
ADD COLUMN     "tipoCambio" DOUBLE PRECISION;

