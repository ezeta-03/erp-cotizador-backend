/*
  Warnings:

  - You are about to drop the column `nombre` on the `cliente` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[documento]` on the table `Cliente` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nombreComercial` to the `Cliente` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nombreContacto` to the `Cliente` table without a default value. This is not possible if the table is not empty.
  - Made the column `documento` on table `cliente` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `cliente` DROP COLUMN `nombre`,
    ADD COLUMN `nombreComercial` VARCHAR(191) NOT NULL,
    ADD COLUMN `nombreContacto` VARCHAR(191) NOT NULL,
    MODIFY `documento` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Cliente_documento_key` ON `Cliente`(`documento`);
