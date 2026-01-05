/*
  Warnings:

  - Added the required column `categoria` to the `Producto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `costo_material` to the `Producto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `costo_parcial_1` to the `Producto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `costo_parcial_2` to the `Producto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `margen` to the `Producto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `precio_final` to the `Producto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `servicio` to the `Producto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Producto` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `producto` ADD COLUMN `activo` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `capacidad_productiva` VARCHAR(191) NULL,
    ADD COLUMN `categoria` VARCHAR(191) NOT NULL,
    ADD COLUMN `costo_material` DOUBLE NOT NULL,
    ADD COLUMN `costo_parcial_1` DOUBLE NOT NULL,
    ADD COLUMN `costo_parcial_2` DOUBLE NOT NULL,
    ADD COLUMN `margen` DOUBLE NOT NULL,
    ADD COLUMN `precio_final` DOUBLE NOT NULL,
    ADD COLUMN `servicio` VARCHAR(191) NOT NULL,
    ADD COLUMN `unidad` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `nombre` VARCHAR(191) NULL,
    MODIFY `precio_material` DOUBLE NOT NULL DEFAULT 0,
    MODIFY `precio_mano_obra` DOUBLE NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Producto_categoria_idx` ON `Producto`(`categoria`);

-- CreateIndex
CREATE INDEX `Producto_servicio_idx` ON `Producto`(`servicio`);
