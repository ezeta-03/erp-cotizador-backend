/*
  Warnings:

  - You are about to drop the column `precio_mano_obra` on the `producto` table. All the data in the column will be lost.
  - You are about to drop the column `precio_material` on the `producto` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `producto` DROP COLUMN `precio_mano_obra`,
    DROP COLUMN `precio_material`;
