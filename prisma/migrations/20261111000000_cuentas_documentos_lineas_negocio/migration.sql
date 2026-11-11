-- Cuentas de la empresa impresas en cotizaciones y comprobantes (copia al guardar)
ALTER TABLE "Cotizacion" ADD COLUMN "cuentasBancarias" JSONB;
ALTER TABLE "Comprobante" ADD COLUMN "cuentasBancarias" JSONB;

-- Correlativo interno de las notas de venta de proveedores (NV-000001…)
ALTER TABLE "CuentaPorPagar" ADD COLUMN "numeroInterno" TEXT;
CREATE UNIQUE INDEX "CuentaPorPagar_numeroInterno_key" ON "CuentaPorPagar"("numeroInterno");
UPDATE "CuentaPorPagar" c SET "numeroInterno" = 'NV-' || LPAD(n.fila::text, 6, '0')
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS fila FROM "CuentaPorPagar" WHERE "tipoDocumento" = 'NOTA_VENTA') n
WHERE c.id = n.id;

-- Líneas de negocio y reparto de cada proveedor de compras
CREATE TABLE "LineaNegocio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineaNegocio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LineaNegocio_nombre_key" ON "LineaNegocio"("nombre");

CREATE TABLE "ProveedorLineaNegocio" (
    "proveedorId" INTEGER NOT NULL,
    "lineaNegocioId" INTEGER NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProveedorLineaNegocio_pkey" PRIMARY KEY ("proveedorId","lineaNegocioId")
);
CREATE INDEX "ProveedorLineaNegocio_lineaNegocioId_idx" ON "ProveedorLineaNegocio"("lineaNegocioId");
ALTER TABLE "ProveedorLineaNegocio" ADD CONSTRAINT "ProveedorLineaNegocio_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "ProveedorCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProveedorLineaNegocio" ADD CONSTRAINT "ProveedorLineaNegocio_lineaNegocioId_fkey" FOREIGN KEY ("lineaNegocioId") REFERENCES "LineaNegocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
