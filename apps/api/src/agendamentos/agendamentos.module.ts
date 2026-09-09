import { Module } from "@nestjs/common";
import { AgendamentosController } from "./agendamentos.controller";
import { AgendamentosService } from "./agendamentos.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";

@Module({
  // PagamentosModule pelo MercadoPagoService, usado pra cobrar o cliente na
  // conta da barbearia (Pix/Cartão) e pra estornar a multa de não comparecimento.
  imports: [PagamentosModule],
  controllers: [AgendamentosController],
  providers: [AgendamentosService],
  // BarbeariasModule usa isso para expor os endpoints de disponibilidade
  // (dias/horários livres) sob /barbearias/:id/... .
  exports: [AgendamentosService],
})
export class AgendamentosModule {}
