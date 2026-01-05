-- CreateTable
CREATE TABLE `Configuracion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `costo_indirecto` DOUBLE NOT NULL DEFAULT 0.10,
    `porcentaje_administrativo` DOUBLE NOT NULL DEFAULT 0.17,
    `rentabilidad` DOUBLE NOT NULL DEFAULT 0.30,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
