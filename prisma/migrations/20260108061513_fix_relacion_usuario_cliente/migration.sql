/*
  Warnings:

  - You are about to drop the column `clienteId` on the `usuario` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `usuario` DROP COLUMN `clienteId`;

-- CreateTable
CREATE TABLE `ProductoAdicional` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `precio` DOUBLE NOT NULL,
    `productoId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CotizacionAdicional` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cotizacionItemId` INTEGER NOT NULL,
    `adicionalId` INTEGER NOT NULL,
    `seleccionado` BOOLEAN NOT NULL DEFAULT false,
    `precio` DOUBLE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProductoAdicional` ADD CONSTRAINT `ProductoAdicional_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CotizacionAdicional` ADD CONSTRAINT `CotizacionAdicional_cotizacionItemId_fkey` FOREIGN KEY (`cotizacionItemId`) REFERENCES `CotizacionItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CotizacionAdicional` ADD CONSTRAINT `CotizacionAdicional_adicionalId_fkey` FOREIGN KEY (`adicionalId`) REFERENCES `ProductoAdicional`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
