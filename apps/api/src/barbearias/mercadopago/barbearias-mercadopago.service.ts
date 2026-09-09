import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { StatusConexaoMercadoPago } from "@barbearia-saas/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MercadoPagoService } from "../../pagamentos/mercadopago.service";

// Conexão da CONTA MERCADO PAGO DE CADA BARBEARIA (modelo marketplace — ver
// o comentário grande em MercadoPagoService). O dono autoriza uma vez (OAuth)
// e a partir daí os pagamentos dos clientes dessa barbearia caem direto na
// conta dela.
@Injectable()
export class BarbeariasMercadoPagoService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
  ) {}

  // "state" do OAuth: barbeariaId + assinatura HMAC (não é JWT de usuário de
  // propósito — é só pra impedir que alguém monte a URL de callback chamando
  // outra barbeariaId na mão). Formato: "<barbeariaId>.<hmac hex>".
  private assinarState(barbeariaId: string): string {
    const segredo = this.config.get<string>("JWT_SECRET") ?? "dev-secret";
    const hmac = crypto.createHmac("sha256", segredo).update(barbeariaId).digest("hex");
    return `${barbeariaId}.${hmac}`;
  }

  private validarEExtrairBarbeariaId(state: string | undefined): string {
    if (!state || !state.includes(".")) throw new BadRequestException("Link de conexão inválido ou expirado.");
    const [barbeariaId, hmacRecebido] = state.split(".");
    const segredo = this.config.get<string>("JWT_SECRET") ?? "dev-secret";
    const hmacEsperado = crypto.createHmac("sha256", segredo).update(barbeariaId).digest("hex");
    if (hmacRecebido !== hmacEsperado) throw new BadRequestException("Link de conexão inválido ou expirado.");
    return barbeariaId;
  }

  gerarUrlConexao(barbeariaId: string): { url: string } {
    return { url: this.mercadoPago.gerarUrlAutorizacao(this.assinarState(barbeariaId)) };
  }

  async status(barbeariaId: string): Promise<StatusConexaoMercadoPago> {
    const barbearia = await this.prisma.barbearia.findUnique({
      where: { id: barbeariaId },
      select: { mercadoPagoAccessToken: true, mercadoPagoConectadoEm: true },
    });
    return {
      conectado: !!barbearia?.mercadoPagoAccessToken,
      conectadoEm: barbearia?.mercadoPagoConectadoEm?.toISOString() ?? null,
    };
  }

  // Dono desconecta (ex: quer trocar de conta Mercado Pago). Não cancela
  // cobranças em andamento — só impede novas cobranças até reconectar.
  async desconectar(barbeariaId: string): Promise<void> {
    await this.prisma.barbearia.update({
      where: { id: barbeariaId },
      data: {
        mercadoPagoAccessToken: null,
        mercadoPagoRefreshToken: null,
        mercadoPagoUserId: null,
        mercadoPagoPublicKey: null,
        mercadoPagoTokenExpiraEm: null,
        mercadoPagoConectadoEm: null,
      },
    });
  }

  // Chamado pelo callback público (o navegador do dono é redirecionado pra
  // cá pelo próprio Mercado Pago depois de autorizar).
  async processarCallback(code: string | undefined, state: string | undefined): Promise<{ sucesso: boolean; mensagem: string }> {
    const barbeariaId = this.validarEExtrairBarbeariaId(state);
    if (!code) return { sucesso: false, mensagem: "Autorização cancelada ou incompleta." };

    const barbearia = await this.prisma.barbearia.findUnique({ where: { id: barbeariaId } });
    if (!barbearia) throw new ForbiddenException("Barbearia não encontrada.");

    const tokens = await this.mercadoPago.trocarCodigoPorToken(code);
    await this.prisma.barbearia.update({
      where: { id: barbeariaId },
      data: {
        mercadoPagoAccessToken: tokens.accessToken,
        mercadoPagoRefreshToken: tokens.refreshToken,
        mercadoPagoUserId: tokens.userId,
        mercadoPagoPublicKey: tokens.publicKey,
        mercadoPagoTokenExpiraEm: tokens.expiraEm,
        mercadoPagoConectadoEm: new Date(),
      },
    });
    return { sucesso: true, mensagem: "Conta Mercado Pago conectada com sucesso!" };
  }
}
