import { Module } from "@nestjs/common";
import { AssinaturasController } from "./assinaturas.controller";
import { AssinaturasService } from "./assinaturas.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";

@Module({
  imports: [PagamentosModule],
  controllers: [AssinaturasController],
  providers: [AssinaturasService],
  // Exportado pro WebhooksModule poder delegar os eventos que não são de
  // nenhuma barbearia conectada (ver WebhooksService).
  exports: [AssinaturasService],
})
export class AssinaturasModule {}
