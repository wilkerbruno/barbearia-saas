import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { AssinaturasService } from "./assinaturas.service";
import { CriarCheckoutDto } from "./dto/criar-checkout.dto";
import { MudarPlanoDto } from "./dto/mudar-plano.dto";
import { DefinirStatusAssinaturaDto } from "./dto/definir-status-assinatura.dto";
import { Roles } from "../common/decorators/roles.decorator";
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

  // Gera o link de checkout do Mercado Pago pro dono autorizar a cobrança
  // recorrente do plano escolhido — a troca de plano só é efetivada quando o
  // pagamento é confirmado (ver o webhook em AssinaturasService).
  @Roles(Papel.BARBEARIA_ADMIN)
  @Post("assinaturas/minha/checkout")
  criarCheckout(@Body() dto: CriarCheckoutDto, @CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.assinaturasService.criarCheckout(user.barbeariaId, user.id, dto.planoId);
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

  // Ajuste manual do SAAS_ADMIN (cortesia, migração, downgrade sem passar
  // pelo checkout de pagamento).
  @Roles(Papel.SAAS_ADMIN)
  @Patch("assinaturas/:barbeariaId/plano")
  mudarPlanoAdmin(@Param("barbeariaId") barbeariaId: string, @Body() dto: MudarPlanoDto) {
    return this.assinaturasService.mudarPlanoAdmin(barbeariaId, dto.planoId);
  }

  // Suspender/reativar manualmente a assinatura de uma barbearia específica
  // (painel administrativo — ver apps/admin-web).
  @Roles(Papel.SAAS_ADMIN)
  @Patch("assinaturas/:barbeariaId/status")
  definirStatus(@Param("barbeariaId") barbeariaId: string, @Body() dto: DefinirStatusAssinaturaDto) {
    return this.assinaturasService.definirStatusAdmin(barbeariaId, dto.status);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Get("faturas")
  listarFaturas() {
    return this.assinaturasService.listarFaturas();
  }
}
