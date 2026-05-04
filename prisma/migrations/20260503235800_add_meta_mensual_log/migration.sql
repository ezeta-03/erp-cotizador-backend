-- CreateTable
CREATE TABLE "MetaMensualLog" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "montoAnterior" DOUBLE PRECISION,
    "montoNuevo" DOUBLE PRECISION NOT NULL,
    "cambiadoPorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaMensualLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaMensualLog_usuarioId_mes_anio_idx" ON "MetaMensualLog"("usuarioId", "mes", "anio");

-- AddForeignKey
ALTER TABLE "MetaMensualLog" ADD CONSTRAINT "MetaMensualLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMensualLog" ADD CONSTRAINT "MetaMensualLog_cambiadoPorId_fkey" FOREIGN KEY ("cambiadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
