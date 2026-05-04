-- CreateEnum
CREATE TYPE "EventoUsuario" AS ENUM ('INVITADO', 'REINVITADO', 'ACTIVADO', 'DESACTIVADO', 'ACTIVADO_ADMIN');

-- CreateTable
CREATE TABLE "UsuarioLog" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "evento" "EventoUsuario" NOT NULL,
    "realizadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsuarioLog_usuarioId_idx" ON "UsuarioLog"("usuarioId");

-- AddForeignKey
ALTER TABLE "UsuarioLog" ADD CONSTRAINT "UsuarioLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioLog" ADD CONSTRAINT "UsuarioLog_realizadoPorId_fkey" FOREIGN KEY ("realizadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
