import { Module } from "@nestjs/common";
import { BarbeariasController } from "./barbearias.controller";
import { BarbeariasService } from "./barbearias.service";
import { AgendamentosModule } from "../agendamentos/agendamentos.module";

@Module({
  // Precisa do AgendamentosService pra expor dias/horários disponíveis sob
  // /barbearias/:id/... (fica mais natural pro app do que sob /agendamentos/...).
  imports: [AgendamentosModule],
  controllers: [BarbeariasController],
  providers: [BarbeariasService],
})
export class BarbeariasModule {}
