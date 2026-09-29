import { Module } from "@nestjs/common";
import { BarbeariasController } from "./barbearias.controller";
import { BarbeariasService } from "./barbearias.service";
import { AgendamentosModule } from "../agendamentos/agendamentos.module";
import { PagamentosModule } from "../pagamentos/pagamentos.module";
import { ConfiguracoesModule } from "../configuracoes/configuracoes.module";
import { BarbeariasMercadoPagoController } from "./mercadopago/barbearias-mercadopago.controller";
import { BarbeariasMercadoPagoService } from "./mercadopago/barbearias-mercadopago.service";

@Module({
  // Precisa do AgendamentosService pra expor dias/horários disponíveis sob
  // /barbearias/:id/... (fica mais natural pro app do que sob /agendamentos/...).
  // PagamentosModule pelo MercadoPagoService, usado na conexão OAuth da conta
  // Mercado Pago de cada barbearia (ver ./mercadopago). ConfiguracoesModule
  // pra saber a carência configurada (listarProximas esconde barbearia
  // vencida há mais que isso — ver assinatura-status.util).
  imports: [AgendamentosModule, PagamentosModule, ConfiguracoesModule],
  controllers: [BarbeariasController, BarbeariasMercadoPagoController],
  providers: [BarbeariasService, BarbeariasMercadoPagoService],
})
export class BarbeariasModule {}
