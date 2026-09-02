import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StatusAssinatura, StatusFatura } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";

// Casa o status devolvido pelo Mercado Pago (pagamento aprovado/pendente/
// recusado) com o enum interno de Fatura.
function mapearStatusFatura(statusPagamento: string | null | undefined): StatusFatura {
  if (statusPagamento === "approved") return StatusFatura.PAGA;
  if (statusPagamento === "pending" || statusPagamento === "in_process" || statusPagamento === "authorized") {
    return StatusFatura.PENDENTE;
  }
  return StatusFatura.ATRASADA; // rejected, cancelled, refunded, charged_back, etc.
}

@Injectable()
export class AssinaturasService {
  private readonly logger = new Logger(AssinaturasService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
  ) {}

  async minhaAssinatura(barbeariaId: string) {
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { barbeariaId },
      include: { plano: true, faturas: { orderBy: { vencimentoEm: "desc" }, take: 12 } },
    });
    if (!assinatura) throw new NotFoundException("Barbearia sem assinatura ativa.");
    return assinatura;
  }

  // Cria a cobrança recorrente no Mercado Pago pro plano escolhido — o dono
  // precisa abrir o link (`initPoint`) devolvido e autorizar com o cartão
  // dele. A troca de plano só é efetivada de verdade quando o webhook
  // confirma a autorização (ver processarEventoPagamento), não aqui — assim
  // ninguém consegue "trocar de plano de graça" chamando esse endpoint.
  async criarCheckout(barbeariaId: string, usuarioId: string, planoId: string) {
    if (!this.mercadoPago.configurado) {
      throw new BadRequestException(
        "Pagamentos ainda não configurados nesta instalação (falta MERCADOPAGO_ACCESS_TOKEN). Fale com o suporte.",
      );
    }

    const [plano, assinatura, usuario] = await Promise.all([
      this.prisma.plano.findUnique({ where: { id: planoId } }),
      this.minhaAssinatura(barbeariaId),
      this.prisma.usuario.findUnique({ where: { id: usuarioId } }),
    ]);
    if (!plano || !plano.ativo) throw new NotFoundException("Plano não encontrado.");
    if (!usuario) throw new NotFoundException("Usuário não encontrado.");

    const backUrl = this.config.get<string>("MERCADOPAGO_BACK_URL") ?? "https://www.mercadopago.com.br";

    const preapproval = await this.mercadoPago.criarPreapproval({
      reason: `Assinatura BarberOS — Plano ${plano.nome}`,
      // "assinaturaId::planoId": é assim que o webhook (que só recebe o id da
      // preapproval no Mercado Pago) sabe qual Assinatura/Plano atualizar.
      externalReference: `${assinatura.id}::${plano.id}`,
      payerEmail: usuario.email,
      precoCentavos: plano.precoCentavos,
      backUrl,
    });

    return { initPoint: preapproval.initPoint };
  }

  // Cancela a mensalidade (dono ou SAAS_ADMIN). Cancela também no Mercado
  // Pago pra garantir que a cobrança recorrente pare de verdade — se a
  // assinatura ainda nem tinha um gatewayAssinaturaId (nunca chegou a
  // autorizar um pagamento), só atualiza o status local.
  async cancelar(barbeariaId: string) {
    const assinatura = await this.minhaAssinatura(barbeariaId);
    if (assinatura.gatewayAssinaturaId && this.mercadoPago.configurado) {
      await this.mercadoPago.cancelarPreapproval(assinatura.gatewayAssinaturaId).catch((e) => {
        this.logger.error(`Falha ao cancelar preapproval ${assinatura.gatewayAssinaturaId} no Mercado Pago: ${e}`);
      });
    }
    return this.prisma.assinatura.update({
      where: { barbeariaId },
      data: { status: StatusAssinatura.CANCELADA },
    });
  }

  // Troca de plano feita diretamente (sem passar pelo checkout) — uso
  // administrativo: cortesia, ajuste manual, downgrade pra um plano grátis
  // etc. O fluxo normal do dono da barbearia é via criarCheckout.
  async mudarPlanoAdmin(barbeariaId: string, planoId: string) {
    await this.minhaAssinatura(barbeariaId);
    return this.prisma.assinatura.update({
      where: { barbeariaId },
      data: { planoId, status: StatusAssinatura.ATIVA },
      include: { plano: true },
    });
  }

  // SAAS_ADMIN suspende/reativa manualmente a assinatura de uma barbearia
  // (ex: inadimplência tratada fora do gateway, suporte, etc).
  async definirStatusAdmin(barbeariaId: string, status: StatusAssinatura) {
    await this.minhaAssinatura(barbeariaId);
    return this.prisma.assinatura.update({ where: { barbeariaId }, data: { status }, include: { plano: true } });
  }

  // Painel SaaS: visão geral de todas as assinaturas + faturamento recorrente.
  listarTodas() {
    return this.prisma.assinatura.findMany({
      include: { plano: true, barbearia: true, faturas: { orderBy: { vencimentoEm: "desc" }, take: 1 } },
      orderBy: { inicioEm: "desc" },
    });
  }

  listarFaturas() {
    return this.prisma.fatura.findMany({
      include: { assinatura: { include: { barbearia: true, plano: true } } },
      orderBy: { vencimentoEm: "desc" },
      take: 200,
    });
  }

  // Webhook do Mercado Pago (notificações de assinatura/cobrança). Sempre
  // responde rápido e nunca deixa uma exceção estourar pra fora — o Mercado
  // Pago reenvia (com backoff) se não receber 2xx, e um formato de payload
  // inesperado não pode derrubar o endpoint público.
  async processarEventoPagamento(payload: any, query: Record<string, any>, headers: Record<string, any>) {
    const tipo = payload?.type ?? payload?.topic ?? query?.type ?? query?.topic;
    const dataId = payload?.data?.id ?? query?.["data.id"] ?? query?.id;
    if (!tipo || !dataId) return { recebido: true };

    const assinaturaValida = this.mercadoPago.validarAssinaturaWebhook({
      xSignature: headers["x-signature"],
      xRequestId: headers["x-request-id"],
      dataId: String(dataId),
    });
    if (!assinaturaValida) {
      this.logger.warn(`Webhook do Mercado Pago com assinatura inválida (tipo=${tipo}, id=${dataId}) — ignorado.`);
      return { recebido: true };
    }

    try {
      if (tipo === "subscription_preapproval" || tipo === "preapproval") {
        await this.tratarWebhookPreapproval(String(dataId));
      } else if (tipo === "subscription_authorized_payment") {
        await this.tratarWebhookPagamentoAutorizado(String(dataId));
      } else if (tipo === "payment") {
        await this.tratarWebhookPagamentoAvulso(String(dataId));
      }
    } catch (e) {
      // Registra e segue — não queremos que o Mercado Pago fique reenviando
      // pra sempre por causa de um formato de payload que ainda não previmos.
      this.logger.error(`Erro ao processar webhook do Mercado Pago (tipo=${tipo}, id=${dataId}): ${e}`);
    }

    return { recebido: true };
  }

  private async tratarWebhookPreapproval(preapprovalId: string) {
    const preapproval = await this.mercadoPago.buscarPreapproval(preapprovalId);
    const { assinaturaId, planoId } = this.parseExternalReference(preapproval.externalReference);
    if (!assinaturaId) return;

    const dados: { gatewayAssinaturaId: string; status?: StatusAssinatura; planoId?: string; proximaCobrancaEm?: Date } = {
      gatewayAssinaturaId: preapprovalId,
    };
    if (preapproval.status === "authorized") {
      dados.status = StatusAssinatura.ATIVA;
      if (planoId) dados.planoId = planoId;
      if (preapproval.nextPaymentDate) dados.proximaCobrancaEm = new Date(preapproval.nextPaymentDate);
    } else if (preapproval.status === "cancelled") {
      dados.status = StatusAssinatura.CANCELADA;
    } else if (preapproval.status === "paused") {
      dados.status = StatusAssinatura.INADIMPLENTE;
    }

    await this.prisma.assinatura.update({ where: { id: assinaturaId }, data: dados }).catch((e) => {
      this.logger.error(`Assinatura ${assinaturaId} (do external_reference da preapproval) não encontrada: ${e}`);
    });
  }

  private async tratarWebhookPagamentoAutorizado(authorizedPaymentId: string) {
    const autorizado = await this.mercadoPago.buscarAuthorizedPayment(authorizedPaymentId);
    await this.registrarFaturaDoPagamento({
      externalReference: autorizado.externalReference,
      preapprovalId: autorizado.preapprovalId,
      paymentId: autorizado.paymentId,
      idFallbackParaFatura: authorizedPaymentId,
    });
  }

  // Alguns pagamentos avulsos (não vinculados a uma preapproval) também
  // chegam nesse mesmo webhook — só processamos se conseguirmos casar com uma
  // assinatura via external_reference (ver MercadoPagoService).
  private async tratarWebhookPagamentoAvulso(paymentId: string) {
    const pagamento = await this.mercadoPago.buscarPayment(paymentId);
    await this.registrarFaturaDoPagamento({
      externalReference: pagamento.externalReference,
      preapprovalId: null,
      paymentId,
      idFallbackParaFatura: paymentId,
    });
  }

  private async registrarFaturaDoPagamento(params: {
    externalReference: string | null;
    preapprovalId: string | null;
    paymentId: string | null;
    idFallbackParaFatura: string;
  }) {
    const { assinaturaId } = this.parseExternalReference(params.externalReference);
    let assinatura = assinaturaId ? await this.prisma.assinatura.findUnique({ where: { id: assinaturaId }, include: { plano: true } }) : null;
    if (!assinatura && params.preapprovalId) {
      assinatura = await this.prisma.assinatura.findFirst({
        where: { gatewayAssinaturaId: params.preapprovalId },
        include: { plano: true },
      });
    }
    if (!assinatura) {
      this.logger.warn(`Pagamento do Mercado Pago sem assinatura correspondente (paymentId=${params.paymentId}).`);
      return;
    }

    let valorCentavos = assinatura.plano.precoCentavos; // fallback: preço do plano atual
    let metodoPagamento: string | null = null;
    let vencimentoEm = new Date();
    let statusFatura: StatusFatura = StatusFatura.PENDENTE;

    if (params.paymentId) {
      const pagamento = await this.mercadoPago.buscarPayment(params.paymentId).catch(() => null);
      if (pagamento) {
        if (pagamento.transactionAmountCentavos > 0) valorCentavos = pagamento.transactionAmountCentavos;
        metodoPagamento = pagamento.metodoPagamento;
        vencimentoEm = new Date(pagamento.dataAprovacao ?? pagamento.dataCriacao);
        statusFatura = mapearStatusFatura(pagamento.status);
      }
    }

    const gatewayFaturaId = params.paymentId ?? params.idFallbackParaFatura;
    const faturaExistente = await this.prisma.fatura.findFirst({ where: { gatewayFaturaId } });
    if (faturaExistente) {
      await this.prisma.fatura.update({
        where: { id: faturaExistente.id },
        data: { status: statusFatura, valorCentavos, metodoPagamento },
      });
    } else {
      await this.prisma.fatura.create({
        data: {
          assinaturaId: assinatura.id,
          valorCentavos,
          vencimentoEm,
          status: statusFatura,
          metodoPagamento,
          gatewayFaturaId,
        },
      });
    }

    // Uma cobrança aprovada é a melhor confirmação de que a assinatura está
    // em dia — mesmo que o webhook de preapproval (que normalmente já cuida
    // disso) tenha se perdido por algum motivo.
    if (statusFatura === StatusFatura.PAGA && assinatura.status !== StatusAssinatura.ATIVA) {
      await this.prisma.assinatura.update({ where: { id: assinatura.id }, data: { status: StatusAssinatura.ATIVA } });
    }
  }

  // "assinaturaId::planoId" — ver o comentário em criarCheckout.
  private parseExternalReference(ref: string | null): { assinaturaId: string | null; planoId: string | null } {
    if (!ref) return { assinaturaId: null, planoId: null };
    const [assinaturaId, planoId] = ref.split("::");
    return { assinaturaId: assinaturaId || null, planoId: planoId || null };
  }
}
