import { Body, Controller, ForbiddenException, Get, Param, Patch } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { BarbeariasService } from "./barbearias.service";
import { UpdateBarbeariaDto } from "./dto/update-barbearia.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("barbearias")
export class BarbeariasController {
  constructor(private barbeariasService: BarbeariasService) {}

  // Painel SaaS: lista todas as barbearias assinantes da plataforma.
  @Roles(Papel.SAAS_ADMIN)
  @Get()
  listarTodas() {
    return this.barbeariasService.listarTodas();
  }

  @Get(":id")
  buscarPorId(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    this.garantirAcesso(id, user);
    return this.barbeariasService.buscarPorId(id);
  }

  // Público: usado pelo app do cliente no passo "Escolher profissional".
  @Public()
  @Get(":id/funcionarios")
  listarFuncionarios(@Param("id") id: string) {
    return this.barbeariasService.listarFuncionariosPublico(id);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: UpdateBarbeariaDto, @CurrentUser() user: AuthUser) {
    this.garantirAcesso(id, user);
    return this.barbeariasService.atualizar(id, dto);
  }

  // Um BARBEARIA_ADMIN só pode ler/editar a própria barbearia; SAAS_ADMIN pode ver qualquer uma.
  private garantirAcesso(barbeariaId: string, user: AuthUser) {
    if (user.papel === Papel.SAAS_ADMIN) return;
    if (user.barbeariaId !== barbeariaId) {
      throw new ForbiddenException("Você não tem acesso a esta barbearia.");
    }
  }
}
