-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'VENTAS', 'CLIENTE');

-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'FACTURADA');

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" SERIAL NOT NULL,
    "costo_indirecto" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "porcentaje_administrativo" DOUBLE PRECISION NOT NULL DEFAULT 0.17,
    "rentabilidad" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreComercial" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "activationToken" TEXT,
    "activationExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nombreComercial" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "nombreContacto" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "usuarioId" INTEGER,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "categoria" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "material" TEXT,
    "unidad" TEXT,
    "costo_material" DOUBLE PRECISION NOT NULL,
    "costo_parcial_1" DOUBLE PRECISION NOT NULL,
    "costo_parcial_2" DOUBLE PRECISION NOT NULL,
    "precio_final" DOUBLE PRECISION NOT NULL,
    "margen" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "nombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoAdicional" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "productoId" INTEGER NOT NULL,

    CONSTRAINT "ProductoAdicional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidaAt" TIMESTAMP(3),
    "respuestaComentario" TEXT,
    "facturadaAt" TIMESTAMP(3),
    "clienteId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionItem" (
    "id" SERIAL NOT NULL,
    "cotizacionId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "CotizacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionAdicional" (
    "id" SERIAL NOT NULL,
    "cotizacionItemId" INTEGER NOT NULL,
    "adicionalId" INTEGER NOT NULL,
    "seleccionado" BOOLEAN NOT NULL DEFAULT false,
    "precio" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CotizacionAdicional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaMensual" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "mes" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaMensual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_activationToken_key" ON "Usuario"("activationToken");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_documento_key" ON "Cliente"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_usuarioId_key" ON "Cliente"("usuarioId");

-- CreateIndex
CREATE INDEX "Producto_categoria_idx" ON "Producto"("categoria");

-- CreateIndex
CREATE INDEX "Producto_servicio_idx" ON "Producto"("servicio");

-- CreateIndex
CREATE UNIQUE INDEX "Cotizacion_numero_key" ON "Cotizacion"("numero");

-- CreateIndex
CREATE INDEX "MetaMensual_mes_anio_idx" ON "MetaMensual"("mes", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "MetaMensual_usuarioId_mes_anio_key" ON "MetaMensual"("usuarioId", "mes", "anio");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoAdicional" ADD CONSTRAINT "ProductoAdicional_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionAdicional" ADD CONSTRAINT "CotizacionAdicional_adicionalId_fkey" FOREIGN KEY ("adicionalId") REFERENCES "ProductoAdicional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionAdicional" ADD CONSTRAINT "CotizacionAdicional_cotizacionItemId_fkey" FOREIGN KEY ("cotizacionItemId") REFERENCES "CotizacionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMensual" ADD CONSTRAINT "MetaMensual_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
