import { Module } from "@nestjs/common";
import { AgendamentosController } from "./agendamentos.controller";
import { AgendamentosService } from "./agendamentos.service";

@Module({
  controllers: [AgendamentosController],
  providers: [AgendamentosService],
  // BarbeariasModule usa isso para expor os endpoints de disponibilidade
  // (dias/horários livres) sob /barbearias/:id/... .
  exports: [AgendamentosService],
})
export class AgendamentosModule {}
