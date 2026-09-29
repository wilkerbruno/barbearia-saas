import { Module } from "@nestjs/common";
import { AssinaturasController } from "./assinaturas.controller";
import { AssinaturasService } from "./assinaturas.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";
import { ConfiguracoesModule } from "../configuracoes/configuracoes.module";
import { PushModule } from "../push/push.module";

@Module({
  imports: [PagamentosModule, ConfiguracoesModule, PushModule],
  controllers: [AssinaturasController],
  providers: [AssinaturasService],
  // Exportado pro WebhooksModule poder delegar os eventos que não são de
  // nenhuma barbearia conectada (ver WebhooksService).
  exports: [AssinaturasService],
})
export class AssinaturasModule {}
