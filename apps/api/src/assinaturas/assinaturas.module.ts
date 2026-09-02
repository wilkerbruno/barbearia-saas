import { Module } from "@nestjs/common";
import { AssinaturasController } from "./assinaturas.controller";
import { AssinaturasService } from "./assinaturas.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";

@Module({
  imports: [PagamentosModule],
  controllers: [AssinaturasController],
  providers: [AssinaturasService],
})
export class AssinaturasModule {}
