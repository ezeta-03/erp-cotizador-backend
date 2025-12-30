/*
  Warnings:

  - You are about to drop the column `estado` on the `cotizacion` table. All the data in the column will be lost.
  - You are about to drop the column `rol` on the `usuario` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[numero]` on the table `Cotizacion` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `role` to the `Usuario` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `cotizacion` DROP COLUMN `estado`;

-- AlterTable
ALTER TABLE `producto` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `usuario` DROP COLUMN `rol`,
    ADD COLUMN `activo` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `clienteId` INTEGER NULL,
    ADD COLUMN `role` ENUM('ADMIN', 'VENTAS', 'CLIENTE') NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Cotizacion_numero_key` ON `Cotizacion`(`numero`);
