import { Body, Controller, Get, Patch } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { ConfiguracoesService } from "./configuracoes.service";
import { UpdateConfiguracaoDto } from "./dto/update-configuracao.dto";
import { Roles } from "../common/decorators/roles.decorator";

// SAAS_ADMIN-only: parâmetros globais da plataforma (admin-web -> Configurações).
@Controller("configuracoes")
export class ConfiguracoesController {
  constructor(private configuracoesService: ConfiguracoesService) {}

  @Roles(Papel.SAAS_ADMIN)
  @Get()
  obter() {
    return this.configuracoesService.obter();
  }

  @Roles(Papel.SAAS_ADMIN)
  @Patch()
  atualizar(@Body() dto: UpdateConfiguracaoDto) {
    return this.configuracoesService.atualizar(dto);
  }
}
