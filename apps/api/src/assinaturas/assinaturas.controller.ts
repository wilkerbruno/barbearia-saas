import { Body, Controller, ForbiddenException, Get, Patch, Post } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { AssinaturasService } from "./assinaturas.service";
import { MudarPlanoDto } from "./dto/mudar-plano.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller()
export class AssinaturasController {
  constructor(private assinaturasService: AssinaturasService) {}

  @Roles(Papel.BARBEARIA_ADMIN)
  @Get("assinaturas/minha")
  minha(@CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.assinaturasService.minhaAssinatura(user.barbeariaId);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Patch("assinaturas/minha/plano")
  mudarPlano(@Body() dto: MudarPlanoDto, @CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.assinaturasService.mudarPlano(user.barbeariaId, dto.planoId);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Patch("assinaturas/minha/cancelar")
  cancelar(@CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.assinaturasService.cancelar(user.barbeariaId);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Get("assinaturas")
  listarTodas() {
    return this.assinaturasService.listarTodas();
  }

  @Roles(Papel.SAAS_ADMIN)
  @Get("faturas")
  listarFaturas() {
    return this.assinaturasService.listarFaturas();
  }

  // Endpoint que o gateway de pagamento vai chamar (configurar a URL lá no painel dele).
  // Público porque a autenticação real é a assinatura HMAC do provedor, verificada no service.
  @Public()
  @Post("webhooks/pagamento")
  webhook(@Body() payload: unknown) {
    return this.assinaturasService.processarEventoPagamento(payload);
  }
}
