import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StatusAgendamento, StatusAssinaturaPacote } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { CreatePacoteMensalDto } from "./dto/create-pacote-mensal.dto";
import { UpdatePacoteMensalDto } from "./dto/update-pacote-mensal.dto";

// Limites (segunda 00:00 até o próximo domingo 23:59:59) da semana em que
// "dataReferencia" cai — usado tanto pra checar quanto pra mostrar a cota
// (vezesPorSemana) já usada. Mesma definição de semana em
// AgendamentosService (não dá pra importar de lá sem criar um ciclo entre
// módulos, então é um helper pequeno duplicado de propósito).
function limitesDaSemana(dataReferencia: Date): { inicio: Date; fim: Date } {
  const diaSemana = dataReferencia.getDay(); // 0=domingo ... 6=sábado
  const diasDesdeSegunda = (diaSemana + 6) % 7; // segunda=0
  const inicio = new Date(dataReferencia);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - diasDesdeSegunda);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  return { inicio, fim };
}

@Injectable()
export class PacotesMensaisService {
  private readonly logger = new Logger(PacotesMensaisService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
  ) {}

  // ---------- Catálogo ----------

  // Público: o app do cliente lista os pacotes ativos de uma barbearia pra
  // decidir se quer assinar (ver BarbeariaDetailScreen).
  listarPublico(barbeariaId: string) {
    return this.prisma.pacoteMensal.findMany({
      where: { barbeariaId, ativo: true },
      include: { servicos: { include: { servico: true } } },
      orderBy: { nome: "asc" },
    });
  }

  // Visão do dono: todos os pacotes (inclusive desativados, pra poder reativar).
  listarDaBarbearia(barbeariaId: string) {
    return this.prisma.pacoteMensal.findMany({
      where: { barbeariaId },
      include: { servicos: { include: { servico: true } } },
      orderBy: { nome: "asc" },
    });
  }

  criar(barbeariaId: string, dto: CreatePacoteMensalDto) {
    const { servicoIds, ...dados } = dto;
    return this.prisma.pacoteMensal.create({
      data: {
        ...dados,
        diasSemanaPermitidos: dto.diasSemanaPermitidos,
        barbeariaId,
        servicos: { create: servicoIds.map((servicoId) => ({ servicoId })) },
      },
      include: { servicos: { include: { servico: true } } },
    });
  }

  async atualizar(id: string, barbeariaId: string, dto: UpdatePacoteMensalDto) {
    await this.garantirDaBarbearia(id, barbeariaId);
    const { servicoIds, ...dados } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (servicoIds) {
        await tx.pacoteMensalServico.deleteMany({ where: { pacoteMensalId: id } });
        await tx.pacoteMensalServico.createMany({
          data: servicoIds.map((servicoId) => ({ pacoteMensalId: id, servicoId })),
        });
      }
      return tx.pacoteMensal.update({
        where: { id },
        data: dados,
        include: { servicos: { include: { servico: true } } },
      });
    });
  }

  // ---------- Assinatura do cliente ----------

  // Inicia (ou reinicia, se cancelada antes) a assinatura recorrente do
  // cliente — ele precisa abrir o `initPoint` devolvido e autorizar com o
  // próprio cartão. Só vira ATIVA de verdade quando o Mercado Pago confirmar
  // via webhook (ver WebhooksService.processarEventoMarketplace).
  async assinar(clienteId: string, pacoteMensalId: string) {
    const pacote = await this.prisma.pacoteMensal.findUnique({ where: { id: pacoteMensalId } });
    if (!pacote || !pacote.ativo) throw new NotFoundException("Pacote mensal não encontrado.");

    const existente = await this.prisma.assinaturaPacoteCliente.findUnique({
      where: { pacoteMensalId_clienteId: { pacoteMensalId, clienteId } },
    });
    if (existente?.status === StatusAssinaturaPacote.ATIVA) {
      throw new BadRequestException("Você já tem uma assinatura ativa desse pacote.");
    }

    const [cliente, tokenBarbearia] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { id: clienteId } }),
      this.mercadoPago.tokenDaBarbearia(pacote.barbeariaId),
    ]);
    if (!cliente) throw new NotFoundException("Cliente não encontrado.");

    // Reaproveita a linha (ex: assinatura CANCELADA antes) em vez de criar
    // outra — o índice único (pacoteMensalId, clienteId) não deixaria duas
    // ao mesmo tempo de qualquer forma.
    const assinatura = existente
      ? await this.prisma.assinaturaPacoteCliente.update({
          where: { id: existente.id },
          data: { status: StatusAssinaturaPacote.PENDENTE },
        })
      : await this.prisma.assinaturaPacoteCliente.create({
          data: { pacoteMensalId, clienteId, barbeariaId: pacote.barbeariaId, status: StatusAssinaturaPacote.PENDENTE },
        });

    const backUrl = this.config.get<string>("MERCADOPAGO_BACK_URL") ?? "https://www.mercadopago.com.br";
    const preapproval = await this.mercadoPago.criarPreapproval(
      {
        reason: `Pacote mensal - ${pacote.nome}`,
        // "assinaturaPacote:<id>": é assim que o webhook (que só recebe o id
        // da preapproval no Mercado Pago) sabe qual AssinaturaPacoteCliente
        // ativar — ver WebhooksService.
        externalReference: `assinaturaPacote:${assinatura.id}`,
        payerEmail: cliente.email,
        precoCentavos: pacote.precoCentavos,
        backUrl,
      },
      tokenBarbearia,
    );

    return { initPoint: preapproval.initPoint };
  }

  async minhasAssinaturas(clienteId: string) {
    const assinaturas = await this.prisma.assinaturaPacoteCliente.findMany({
      where: { clienteId },
      include: { pacoteMensal: { include: { servicos: { include: { servico: true } } } } },
      orderBy: { criadoEm: "desc" },
    });

    return Promise.all(
      assinaturas.map(async (a) => ({
        ...a,
        usosNaSemana: a.status === StatusAssinaturaPacote.ATIVA ? await this.usosNaSemana(a.id) : 0,
      })),
    );
  }

  // Quantos agendamentos essa assinatura já "gastou" da cota semanal — conta
  // também NAO_COMPARECEU (o cliente reservou a vaga, então ela foi usada,
  // mesmo sem cobrança avulsa pra reter — ver AgendamentosService.marcarNaoCompareceu).
  usosNaSemana(assinaturaId: string, dataReferencia: Date = new Date()) {
    const { inicio, fim } = limitesDaSemana(dataReferencia);
    return this.prisma.agendamento.count({
      where: {
        assinaturaPacoteId: assinaturaId,
        status: { in: [StatusAgendamento.CONFIRMADO, StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] },
        inicio: { gte: inicio, lt: fim },
      },
    });
  }

  async cancelarAssinatura(clienteId: string, id: string) {
    const assinatura = await this.prisma.assinaturaPacoteCliente.findUnique({ where: { id } });
    if (!assinatura || assinatura.clienteId !== clienteId) throw new NotFoundException("Assinatura não encontrada.");

    if (assinatura.gatewayAssinaturaId) {
      const token = await this.mercadoPago.tokenDaBarbearia(assinatura.barbeariaId).catch(() => null);
      if (token) {
        await this.mercadoPago.cancelarPreapproval(assinatura.gatewayAssinaturaId, token).catch((e) => {
          this.logger.error(`Falha ao cancelar preapproval de pacote mensal ${assinatura.gatewayAssinaturaId}: ${e}`);
        });
      }
    }
    return this.prisma.assinaturaPacoteCliente.update({ where: { id }, data: { status: StatusAssinaturaPacote.CANCELADA } });
  }

  private async garantirDaBarbearia(id: string, barbeariaId: string) {
    const pacote = await this.prisma.pacoteMensal.findUnique({ where: { id } });
    if (!pacote) throw new NotFoundException("Pacote mensal não encontrado.");
    if (pacote.barbeariaId !== barbeariaId) throw new ForbiddenException("Pacote mensal não pertence à sua barbearia.");
  }
}
