-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "condicionPago" TEXT NOT NULL DEFAULT 'CONTADO',
ADD COLUMN     "diasCredito" INTEGER;

-- AlterTable
ALTER TABLE "Comprobante" ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'ERP',
ADD COLUMN     "recordatorioEnviadoAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Cotizacion" ADD COLUMN     "condicionPago" TEXT NOT NULL DEFAULT 'CONTADO',
ADD COLUMN     "diasCredito" INTEGER;

-- AlterTable
ALTER TABLE "ProveedorCuota" ADD COLUMN     "fechaPago" TIMESTAMP(3),
ADD COLUMN     "medioPago" TEXT,
ADD COLUMN     "numeroOperacion" TEXT;

-- CreateTable
CREATE TABLE "ProveedorCompra" (
    "id" SERIAL NOT NULL,
    "ruc" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreComercial" TEXT,
    "direccion" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "banco" TEXT,
    "numeroCuenta" TEXT,
    "cci" TEXT,
    "condicionPago" TEXT NOT NULL DEFAULT 'CONTADO',
    "diasCredito" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProveedorCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaPorPagar" (
    "id" SERIAL NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "tipoDocumento" TEXT NOT NULL DEFAULT 'FACTURA',
    "serie" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "tipoCambio" DOUBLE PRECISION,
    "valorVenta" DOUBLE PRECISION NOT NULL,
    "igv" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "detraccionMonto" DOUBLE PRECISION,
    "retencionMonto" DOUBLE PRECISION,
    "categoria" TEXT NOT NULL DEFAULT 'COMPRA',
    "descripcion" TEXT,
    "formaPago" TEXT NOT NULL DEFAULT 'CONTADO',
    "cuotas" JSONB,
    "proyectoId" INTEGER,
    "ordenAlmacenId" INTEGER,
    "movimientoAlmacenId" INTEGER,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "usuarioId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaPorPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoCuentaPorPagar" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'PAGO',
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "medio" TEXT NOT NULL,
    "numeroOperacion" TEXT,
    "nota" TEXT,
    "usuarioId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoCuentaPorPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProveedorCompra_ruc_key" ON "ProveedorCompra"("ruc");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_proyectoId_idx" ON "CuentaPorPagar"("proyectoId");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_fechaEmision_idx" ON "CuentaPorPagar"("fechaEmision");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorPagar_proveedorId_tipoDocumento_serie_numero_key" ON "CuentaPorPagar"("proveedorId", "tipoDocumento", "serie", "numero");

-- CreateIndex
CREATE INDEX "PagoCuentaPorPagar_cuentaId_idx" ON "PagoCuentaPorPagar"("cuentaId");

-- CreateIndex
CREATE INDEX "Comprobante_clienteId_idx" ON "Comprobante"("clienteId");

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "ProveedorCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_ordenAlmacenId_fkey" FOREIGN KEY ("ordenAlmacenId") REFERENCES "OrdenAlmacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_movimientoAlmacenId_fkey" FOREIGN KEY ("movimientoAlmacenId") REFERENCES "MovimientoAlmacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoCuentaPorPagar" ADD CONSTRAINT "PagoCuentaPorPagar_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaPorPagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoCuentaPorPagar" ADD CONSTRAINT "PagoCuentaPorPagar_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

