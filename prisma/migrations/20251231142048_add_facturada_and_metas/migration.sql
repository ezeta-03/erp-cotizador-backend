-- AlterTable
ALTER TABLE `cotizacion` MODIFY `estado` ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA', 'FACTURADA') NOT NULL DEFAULT 'PENDIENTE';

-- CreateTable
CREATE TABLE `MetaMensual` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuarioId` INTEGER NOT NULL,
    `monto` DOUBLE NOT NULL,
    `mes` INTEGER NOT NULL,
    `anio` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MetaMensual_mes_anio_idx`(`mes`, `anio`),
    UNIQUE INDEX `MetaMensual_usuarioId_mes_anio_key`(`usuarioId`, `mes`, `anio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MetaMensual` ADD CONSTRAINT `MetaMensual_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
