import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { AssinaturasService } from "./assinaturas.service";
import { AssinaturasPagamentoService } from "./assinaturas-pagamento.service";
import { CriarCheckoutDto } from "./dto/criar-checkout.dto";
import { MudarPlanoDto } from "./dto/mudar-plano.dto";
import { DefinirStatusAssinaturaDto } from "./dto/definir-status-assinatura.dto";
import { PagarAssinaturaDto } from "./dto/pagar-assinatura.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { PermitirAssinaturaBloqueada } from "../common/decorators/permitir-assinatura-bloqueada.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller()
export class AssinaturasController {
  constructor(
    private assinaturasService: AssinaturasService,
    private pagamentoNativo: AssinaturasPagamentoService,
  ) {}

  // @PermitirAssinaturaBloqueada nas três rotas "minha/*": é exatamente o que
  // o dono precisa acessar quando a barbearia está bloqueada (ver a tela de
  // Assinatura no mobile) — sem isso o AssinaturaGuard barraria o próprio
  // acesso à tela que resolve o bloqueio.
  @Roles(Papel.BARBEARIA_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Get("assinaturas/minha")
  minha(@CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.assinaturasService.minhaAssinatura(user.barbeariaId);
  }

  // Gera o link de checkout do Mercado Pago pro dono autorizar a cobrança
  // recorrente do plano escolhido — a troca de plano só é efetivada quando o
  // pagamento é confirmado (ver o webhook em AssinaturasService).
  @Roles(Papel.BARBEARIA_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Post("assinaturas/minha/checkout")
  criarCheckout(@Body() dto: CriarCheckoutDto, @CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.assinaturasService.criarCheckout(user.barbeariaId, user.id, dto.planoId);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Patch("assinaturas/minha/cancelar")
  cancelar(@CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.assinaturasService.cancelar(user.barbeariaId);
  }

  // ==================== Pagamento nativo (Pix/cartão, sem sair do app) ====================
  // Substitui, pra quem está pagando agora, o checkout externo acima — ver
  // AssinaturasPagamentoService. Mesmas rotas "minha/*", mesmo motivo de
  // @PermitirAssinaturaBloqueada.

  @Roles(Papel.BARBEARIA_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Get("assinaturas/minha/mercadopago-public-key")
  mercadoPagoPublicKey() {
    return { publicKey: this.pagamentoNativo.publicKeyPlataforma };
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Post("assinaturas/minha/pagar")
  pagar(@Body() dto: PagarAssinaturaDto, @CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.pagamentoNativo.pagar(user.barbeariaId, user.id, dto);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Get("assinaturas/minha/pagamentos/:id")
  buscarPagamento(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.pagamentoNativo.buscarPagamento(id, user.barbeariaId);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Patch("assinaturas/minha/pagamentos/:id/cancelar")
  cancelarPagamentoPendente(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.pagamentoNativo.cancelarPendente(id, user.barbeariaId);
  }

  // Versão enxuta pro pop-up de "assinatura vencendo" no app — acessível
  // também pro FUNCIONARIO (que não pode ver /assinaturas/minha inteira:
  // faturas, preço do plano etc). Isento do AssinaturaGuard pelo mesmo motivo
  // das rotas acima: mesmo bloqueado, ainda faz sentido saber o status.
  @Roles(Papel.BARBEARIA_ADMIN, Papel.FUNCIONARIO)
  @PermitirAssinaturaBloqueada()
  @Get("assinaturas/minha/resumo")
  resumoVencimento(@CurrentUser() user: AuthUser) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.assinaturasService.resumoVencimento(user.barbeariaId);
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
