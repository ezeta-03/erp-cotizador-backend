-- CreateTable
CREATE TABLE "AdjuntoPago" (
    "id" SERIAL NOT NULL,
    "ruta" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "pagoComprobanteId" INTEGER,
    "pagoCuentaPorPagarId" INTEGER,
    "usuarioId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjuntoPago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdjuntoPago_ruta_key" ON "AdjuntoPago"("ruta");
CREATE INDEX "AdjuntoPago_pagoComprobanteId_idx" ON "AdjuntoPago"("pagoComprobanteId");
CREATE INDEX "AdjuntoPago_pagoCuentaPorPagarId_idx" ON "AdjuntoPago"("pagoCuentaPorPagarId");

-- AddForeignKey
ALTER TABLE "AdjuntoPago" ADD CONSTRAINT "AdjuntoPago_pagoComprobanteId_fkey" FOREIGN KEY ("pagoComprobanteId") REFERENCES "PagoComprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdjuntoPago" ADD CONSTRAINT "AdjuntoPago_pagoCuentaPorPagarId_fkey" FOREIGN KEY ("pagoCuentaPorPagarId") REFERENCES "PagoCuentaPorPagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdjuntoPago" ADD CONSTRAINT "AdjuntoPago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
