-- CreateTable
CREATE TABLE "PanelWidget" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PanelWidget_usuarioId_kind_key" ON "PanelWidget"("usuarioId", "kind");

-- AddForeignKey
ALTER TABLE "PanelWidget" ADD CONSTRAINT "PanelWidget_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
