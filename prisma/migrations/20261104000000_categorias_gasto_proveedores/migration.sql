-- Categorías de gasto (catálogo editable con subcategorías)
CREATE TABLE "CategoriaGasto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "grupo" TEXT NOT NULL DEFAULT 'GASTO_OPERATIVO',
    "padreId" INTEGER,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaGasto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CategoriaGasto_padreId_idx" ON "CategoriaGasto"("padreId");
ALTER TABLE "CategoriaGasto" ADD CONSTRAINT "CategoriaGasto_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "CategoriaGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Proveedores: RUC opcional (vendedores informales), tipo y si afecta la comercialización
ALTER TABLE "ProveedorCompra" ALTER COLUMN "ruc" DROP NOT NULL;
ALTER TABLE "ProveedorCompra" ADD COLUMN "tipoDocIdentidad" TEXT NOT NULL DEFAULT 'RUC';
UPDATE "ProveedorCompra" SET "tipoDocIdentidad" = 'DNI' WHERE length("ruc") = 8;
ALTER TABLE "ProveedorCompra" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'PRODUCTO';
ALTER TABLE "ProveedorCompra" ADD COLUMN "afectaComercializacion" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProveedorCompra" ADD COLUMN "categoriaGastoId" INTEGER;
ALTER TABLE "ProveedorCompra" ADD CONSTRAINT "ProveedorCompra_categoriaGastoId_fkey" FOREIGN KEY ("categoriaGastoId") REFERENCES "CategoriaGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Documentos por pagar: categoría del catálogo, deducible y si pasa por almacén
ALTER TABLE "CuentaPorPagar" ADD COLUMN "categoriaGastoId" INTEGER;
ALTER TABLE "CuentaPorPagar" ADD COLUMN "deducible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CuentaPorPagar" ADD COLUMN "pasaPorAlmacen" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_categoriaGastoId_fkey" FOREIGN KEY ("categoriaGastoId") REFERENCES "CategoriaGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foto del documento (nota de venta) en la misma tabla de adjuntos
ALTER TABLE "AdjuntoPago" ADD COLUMN "cuentaPorPagarId" INTEGER;
CREATE INDEX "AdjuntoPago_cuentaPorPagarId_idx" ON "AdjuntoPago"("cuentaPorPagarId");
ALTER TABLE "AdjuntoPago" ADD CONSTRAINT "AdjuntoPago_cuentaPorPagarId_fkey" FOREIGN KEY ("cuentaPorPagarId") REFERENCES "CuentaPorPagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catálogo inicial
INSERT INTO "CategoriaGasto" ("nombre", "grupo", "orden") VALUES
  ('Materiales e insumos', 'COSTO_VENTA', 1),
  ('Impresión', 'COSTO_VENTA', 2),
  ('Producción e instalación', 'COSTO_VENTA', 3),
  ('Transporte de mercadería', 'COSTO_VENTA', 4),
  ('Alquiler de paneles', 'COSTO_VENTA', 5),
  ('Mano de obra de proyectos', 'COSTO_VENTA', 6),
  ('Servicios básicos', 'GASTO_OPERATIVO', 10),
  ('Alquiler de local', 'GASTO_OPERATIVO', 11),
  ('Honorarios', 'GASTO_OPERATIVO', 12),
  ('Movilidad y viáticos', 'GASTO_OPERATIVO', 13),
  ('Útiles de oficina', 'GASTO_OPERATIVO', 14),
  ('Mantenimiento', 'GASTO_OPERATIVO', 15),
  ('Publicidad', 'GASTO_OPERATIVO', 16),
  ('Software y suscripciones', 'GASTO_OPERATIVO', 17),
  ('Gastos bancarios', 'GASTO_OPERATIVO', 18),
  ('Impuestos y tasas', 'GASTO_OPERATIVO', 19),
  ('Otros', 'GASTO_OPERATIVO', 20);

INSERT INTO "CategoriaGasto" ("nombre", "grupo", "padreId", "orden")
SELECT h.nombre, p."grupo", p."id", h.orden
FROM (VALUES
  ('Servicios básicos', 'Luz', 1),
  ('Servicios básicos', 'Agua', 2),
  ('Servicios básicos', 'Internet y telefonía', 3),
  ('Honorarios', 'Contador', 1),
  ('Honorarios', 'Legal', 2)
) AS h(padre, nombre, orden)
JOIN "CategoriaGasto" p ON p."nombre" = h.padre AND p."padreId" IS NULL;

-- Documentos existentes: COMPRA → Materiales e insumos; el resto → Otros
-- (la categoría antigua queda guardada en la columna "categoria").
UPDATE "CuentaPorPagar" c SET "categoriaGastoId" = g."id"
FROM "CategoriaGasto" g
WHERE g."padreId" IS NULL
  AND g."nombre" = CASE WHEN c."categoria" = 'COMPRA' THEN 'Materiales e insumos' ELSE 'Otros' END;
