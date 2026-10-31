-- CreateTable
CREATE TABLE "PagoComprobante" (
    "id" SERIAL NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'COBRO',
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "medio" TEXT NOT NULL,
    "numeroOperacion" TEXT,
    "nota" TEXT,
    "usuarioId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoComprobante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoComprobante_comprobanteId_idx" ON "PagoComprobante"("comprobanteId");

-- AddForeignKey
ALTER TABLE "PagoComprobante" ADD CONSTRAINT "PagoComprobante_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoComprobante" ADD CONSTRAINT "PagoComprobante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

