-- Compras: proveedores propuestos por ítem (con precio) y órdenes de compra con validación de Finanzas
-- AlterTable
ALTER TABLE "CuentaPorPagar" ADD COLUMN     "ordenCompraId" INTEGER;

-- AlterTable
ALTER TABLE "OrdenAlmacen" ADD COLUMN     "ordenCompraId" INTEGER;

-- CreateTable
CREATE TABLE "ItemProveedor" (
    "id" SERIAL NOT NULL,
    "itemAlmacenId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "fechaPrecio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompra" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "tipoCambio" DOUBLE PRECISION,
    "condicionPago" TEXT NOT NULL DEFAULT 'CONTADO',
    "diasCredito" INTEGER,
    "fechaEntrega" TIMESTAMP(3),
    "proyectoId" INTEGER,
    "notas" TEXT,
    "valorVenta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creadoPorId" INTEGER NOT NULL,
    "enviadaAt" TIMESTAMP(3),
    "aprobadoPorId" INTEGER,
    "aprobadoAt" TIMESTAMP(3),
    "comentarioFinanzas" TEXT,
    "motivoRechazo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompraItem" (
    "id" SERIAL NOT NULL,
    "ordenCompraId" INTEGER NOT NULL,
    "itemAlmacenId" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "cantidadRecibida" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "solicitudAlmacenId" INTEGER,

    CONSTRAINT "OrdenCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemProveedor_proveedorId_idx" ON "ItemProveedor"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemProveedor_itemAlmacenId_proveedorId_key" ON "ItemProveedor"("itemAlmacenId", "proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompra_numero_key" ON "OrdenCompra"("numero");

-- CreateIndex
CREATE INDEX "OrdenCompra_estado_idx" ON "OrdenCompra"("estado");

-- CreateIndex
CREATE INDEX "OrdenCompra_proveedorId_idx" ON "OrdenCompra"("proveedorId");

-- CreateIndex
CREATE INDEX "OrdenCompraItem_ordenCompraId_idx" ON "OrdenCompraItem"("ordenCompraId");

-- CreateIndex
CREATE INDEX "OrdenCompraItem_itemAlmacenId_idx" ON "OrdenCompraItem"("itemAlmacenId");

-- CreateIndex
CREATE INDEX "OrdenCompraItem_solicitudAlmacenId_idx" ON "OrdenCompraItem"("solicitudAlmacenId");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_ordenCompraId_idx" ON "CuentaPorPagar"("ordenCompraId");

-- CreateIndex
CREATE INDEX "OrdenAlmacen_ordenCompraId_idx" ON "OrdenAlmacen"("ordenCompraId");

-- AddForeignKey
ALTER TABLE "OrdenAlmacen" ADD CONSTRAINT "OrdenAlmacen_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProveedor" ADD CONSTRAINT "ItemProveedor_itemAlmacenId_fkey" FOREIGN KEY ("itemAlmacenId") REFERENCES "ItemAlmacen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProveedor" ADD CONSTRAINT "ItemProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "ProveedorCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "ProveedorCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraItem" ADD CONSTRAINT "OrdenCompraItem_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraItem" ADD CONSTRAINT "OrdenCompraItem_itemAlmacenId_fkey" FOREIGN KEY ("itemAlmacenId") REFERENCES "ItemAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraItem" ADD CONSTRAINT "OrdenCompraItem_solicitudAlmacenId_fkey" FOREIGN KEY ("solicitudAlmacenId") REFERENCES "SolicitudAlmacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

