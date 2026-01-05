/*
  Warnings:

  - You are about to drop the column `capacidad_productiva` on the `producto` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `producto` DROP COLUMN `capacidad_productiva`,
    ADD COLUMN `material` VARCHAR(191) NULL;
