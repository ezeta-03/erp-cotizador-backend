-- Marca de interfaz por usuario (Zaazmago / Netwise): solo cambia la apariencia
-- CreateEnum
CREATE TYPE "Marca" AS ENUM ('ZAAZMAGO', 'NETWISE');

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "marca" "Marca" NOT NULL DEFAULT 'ZAAZMAGO';
