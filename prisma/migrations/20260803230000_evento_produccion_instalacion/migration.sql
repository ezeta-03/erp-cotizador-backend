-- Registro de eventos de producción/instalación (inicial y renovaciones de banner)
-- durante un contrato, para saber cuántas veces se renueva y cuánto se generó.
CREATE TABLE "EventoProduccionInstalacion" (
    "id" SERIAL NOT NULL,
    "reservaId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "montoCobrado" DOUBLE PRECISION NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventoProduccionInstalacion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EventoProduccionInstalacion" ADD CONSTRAINT "EventoProduccionInstalacion_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
