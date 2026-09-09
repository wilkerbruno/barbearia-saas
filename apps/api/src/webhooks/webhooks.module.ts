import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";
import { AssinaturasModule } from "../assinaturas/assinaturas.module";

@Module({
  imports: [PagamentosModule, AssinaturasModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
