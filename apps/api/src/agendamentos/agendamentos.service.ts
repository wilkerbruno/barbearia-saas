import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Funcionario, Folga, HorarioTrabalho } from "@prisma/client";
import {
  AVISO_NAO_COMPARECIMENTO,
  MetodoPagamento,
  OrigemAgendamento,
  Papel,
  StatusAgendamento,
  StatusAssinaturaPacote,
  StatusPagamento,
} from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { CreateAgendamentoDto } from "./dto/create-agendamento.dto";
import { CreateAgendamentoLoteDto } from "./dto/create-agendamento-lote.dto";
import { CreateAgendamentoManualDto } from "./dto/create-agendamento-manual.dto";
import { AuthUser } from "../auth/jwt.strategy";

// De quanto em quanto tempo um novo horário pode começar (ex: 09:00, 09:30,
// 10:00...). O expediente em si (dias, hora de início/fim, almoço) agora vem
// do HorarioTrabalho de cada funcionário, cadastrado por ele mesmo no app.
const INTERVALO_ENTRE_INICIOS_MINUTOS = 30;

// Um agendamento PENDENTE (pagamento ainda não confirmado) bloqueia o horário
// como se fosse CONFIRMADO — mas só por um tempo: se o cliente abandona o
// pagamento (fecha o app sem pagar o Pix, não conclui o checkout do cartão),
// o horário não pode ficar preso pra sempre. Depois desse prazo, o servidor
// simplesmente ignora esse PENDENTE ao calcular disponibilidade/conflito —
// não precisa de um job em background pra "limpar" nada.
const PENDENTE_EXPIRA_MINUTOS = 20;

// Fração retida como multa quando o cliente não comparece (ver
// marcarNaoCompareceu) — o resto é estornado. Mesmo valor usado no aviso
// exibido na hora de pagar (AVISO_NAO_COMPARECIMENTO, em @barbearia-saas/shared).
const FRACAO_MULTA_NAO_COMPARECIMENTO = 0.5;

type FuncionarioComAgenda = Funcionario & { horarios: HorarioTrabalho[]; folgas: Folga[] };

interface ItemResolvido {
  servicoId?: string;
  pacoteId?: string;
  duracaoMinutos: number;
  precoCentavos: number;
  barbeariaId: string;
}

@Injectable()
export class AgendamentosService {
  private readonly logger = new Logger(AgendamentosService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
  ) {}

  // Mantido por compatibilidade (agendamento de um serviço/pacote só) — por
  // baixo é a mesma coisa que criarLote com um item, mesmo fluxo de pagamento.
  criar(clienteId: string, dto: CreateAgendamentoDto) {
    return this.criarLote(clienteId, {
      funcionarioId: dto.funcionarioId,
      inicio: dto.inicio,
      itens: [{ servicoId: dto.servicoId, pacoteId: dto.pacoteId }],
      metodoPagamento: dto.metodoPagamento,
    });
  }

  // O cliente marca vários serviços de uma vez (pode repetir o mesmo, ex: 2x
  // corte pra pai e filho) num único horário — cada item vira um Agendamento
  // próprio (status PENDENTE até o pagamento confirmar), encadeado em
  // sequência a partir de "inicio" e com o mesmo profissional, todos com o
  // mesmo grupoId pra serem exibidos/cancelados/pagos juntos. Devolve os
  // agendamentos criados + a cobrança (Pix/Cartão) que o cliente precisa
  // pagar pra confirmar — ver AVISO_NAO_COMPARECIMENTO pro texto exibido
  // nessa hora (a barbearia retém 50% se o cliente não comparecer).
  async criarLote(clienteId: string, dto: CreateAgendamentoLoteDto) {
    const resolvidos = await Promise.all(dto.itens.map((item) => this.resolverItem(item)));

    const barbeariaId = resolvidos[0].barbeariaId;
    if (resolvidos.some((r) => r.barbeariaId !== barbeariaId)) {
      throw new BadRequestException("Todos os serviços do agendamento precisam ser da mesma barbearia.");
    }

    const duracaoTotalMinutos = resolvidos.reduce((total, r) => total + r.duracaoMinutos, 0);
    const inicio = new Date(dto.inicio);
    const fim = new Date(inicio.getTime() + duracaoTotalMinutos * 60_000);

    const funcionarioId = dto.funcionarioId
      ? await this.garantirFuncionarioLivre(dto.funcionarioId, inicio, fim, barbeariaId)
      : await this.escolherFuncionarioDisponivel(barbeariaId, inicio, fim);

    // Antes de exigir pagamento avulso, confere se uma assinatura de pacote
    // mensal ATIVA do cliente já cobre esse lote inteiro (mesmos serviços,
    // dia da semana permitido, cota da semana não esgotada) — nesse caso o
    // agendamento nasce CONFIRMADO direto, sem Pagamento nenhum (ver
    // encontrarAssinaturaPacoteElegivel).
    const assinaturaPacote = await this.encontrarAssinaturaPacoteElegivel(
      clienteId,
      barbeariaId,
      resolvidos,
      inicio,
      dto.usarAssinaturaPacoteId,
    );
    if (assinaturaPacote) {
      return this.criarComAssinaturaPacote(clienteId, barbeariaId, funcionarioId, resolvidos, inicio, assinaturaPacote.id);
    }

    // Confere ANTES de criar qualquer coisa que a barbearia tem como receber
    // — evita reservar o horário só pra descobrir depois que não dá pra cobrar.
    const tokenBarbearia = await this.mercadoPago.tokenDaBarbearia(barbeariaId);

    const [cliente, barbearia] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { id: clienteId } }),
      this.prisma.barbearia.findUnique({ where: { id: barbeariaId } }),
    ]);
    if (!cliente) throw new NotFoundException("Cliente não encontrado.");

    const metodoPagamento = dto.metodoPagamento ?? MetodoPagamento.PIX;
    const valorTotalCentavos = resolvidos.reduce((total, r) => total + r.precoCentavos, 0);

    const grupoId = randomUUID();
    let cursor = inicio;
    const dadosParaCriar = resolvidos.map((item) => {
      const inicioItem = cursor;
      const fimItem = new Date(inicioItem.getTime() + item.duracaoMinutos * 60_000);
      cursor = fimItem;
      return {
        barbeariaId,
        clienteId,
        funcionarioId,
        servicoId: item.servicoId,
        pacoteId: item.pacoteId,
        inicio: inicioItem,
        fim: fimItem,
        precoCentavos: item.precoCentavos,
        status: StatusAgendamento.PENDENTE,
        origem: OrigemAgendamento.CLIENTE_APP,
        grupoId,
      };
    });

    await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    const pagamento = await this.prisma.pagamento.create({
      data: { grupoId, clienteId, barbeariaId, metodo: metodoPagamento, valorCentavos: valorTotalCentavos },
    });

    let motivoRecusaCartao: string | null = null;
    try {
      if (metodoPagamento === MetodoPagamento.PIX) {
        const pix = await this.mercadoPago.criarPagamentoPix(
          {
            valorCentavos: valorTotalCentavos,
            descricao: `Agendamento - ${barbearia?.nome ?? "Barbearia"}`,
            // "_" (não ":") — a Orders API (usada pelo cartão, ver
            // MercadoPagoService.criarPagamentoCartao) valida external_reference
            // com um padrão mais restrito que a API clássica e rejeita ":"
            // ("does not match pattern", constatado em produção). Pix também
            // foi trocado pro mesmo formato só por consistência (não precisa,
            // mas evita ter dois padrões diferentes pro mesmo campo).
            externalReference: `agendamento_${pagamento.id}`,
            payerEmail: cliente.email,
          },
          tokenBarbearia,
        );
        const aprovadoNaHora = pix.status === "approved";
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: pix.id,
            pixQrCodeBase64: pix.qrCodeBase64,
            pixCopiaECola: pix.qrCode,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : StatusPagamento.PENDENTE,
          },
        });
        if (aprovadoNaHora) {
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CONFIRMADO } });
        }
      } else {
        // Cartão: formulário nativo no app tokenizou o cartão (dto.cartaoToken)
        // e o cliente nunca sai do app — cobra na hora, sem checkout hospedado.
        if (!dto.cartaoToken || !dto.cartaoBin || !dto.cartaoCpf) {
          throw new BadRequestException("Dados do cartão incompletos.");
        }
        const { paymentMethodId } = await this.mercadoPago.identificarBandeiraCartao(dto.cartaoBin);
        const cobranca = await this.mercadoPago.criarPagamentoCartao(
          {
            valorCentavos: valorTotalCentavos,
            descricao: `Agendamento - ${barbearia?.nome ?? "Barbearia"}`,
            // "_" (não ":") — a Orders API (usada pelo cartão, ver
            // MercadoPagoService.criarPagamentoCartao) valida external_reference
            // com um padrão mais restrito que a API clássica e rejeita ":"
            // ("does not match pattern", constatado em produção). Pix também
            // foi trocado pro mesmo formato só por consistência (não precisa,
            // mas evita ter dois padrões diferentes pro mesmo campo).
            externalReference: `agendamento_${pagamento.id}`,
            token: dto.cartaoToken,
            paymentMethodId,
            payerEmail: cliente.email,
            payerCpf: dto.cartaoCpf,
            payerNome: cliente.nome,
            deviceId: dto.cartaoDeviceId,
          },
          tokenBarbearia,
        );
        const aprovadoNaHora = cobranca.status === "approved";
        const recusado = cobranca.status === "rejected";
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: cobranca.id,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : recusado ? StatusPagamento.RECUSADO : StatusPagamento.PENDENTE,
            // Preenchido só quando o Mercado Pago exigiu desafio 3DS (ver
            // MercadoPagoService.criarPagamentoCartao) — o app usa isso pra
            // decidir se mostra a WebView de confirmação com o banco.
            desafio3dsUrl: cobranca.desafio3dsUrl,
          },
        });
        if (aprovadoNaHora) {
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CONFIRMADO } });
        } else if (recusado) {
          // Recusa da operadora não é uma falha técnica (não deve virar o
          // erro genérico do catch abaixo) — libera o horário e devolve pro
          // cliente um motivo específico pra ele tentar outro cartão.
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CANCELADO } });
          motivoRecusaCartao = traduzirMotivoRecusaCartao(cobranca.statusDetail);
        }
      }
    } catch (e) {
      // Não deixa a reserva/pagamento órfãos travando o horário pra sempre —
      // desfaz os dois e devolve um erro claro pro cliente tentar de novo.
      this.logger.error(`Falha ao gerar cobrança pro agendamento (grupo ${grupoId}): ${e}`);
      await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CANCELADO } });
      await this.prisma.pagamento.update({ where: { id: pagamento.id }, data: { status: StatusPagamento.RECUSADO } });
      // Erros com mensagem própria (ex: motivo específico do Mercado Pago, ou
      // "bandeira não identificada") já são claros o suficiente pro cliente —
      // só cai na mensagem genérica quando o erro é algo inesperado (ex: falha
      // de rede) sem nada útil pra mostrar.
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("Não foi possível gerar a cobrança agora. Tente novamente em instantes.");
    }

    if (motivoRecusaCartao) {
      throw new BadRequestException(motivoRecusaCartao);
    }

    const [agendamentos, pagamentoFinal] = await Promise.all([
      this.prisma.agendamento.findMany({
        where: { grupoId },
        include: { servico: true, pacote: true, funcionario: { include: { usuario: true } } },
        orderBy: { inicio: "asc" },
      }),
      this.prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } }),
    ]);

    return { agendamentos, pagamento: this.mapearPagamento(pagamentoFinal), aviso: AVISO_NAO_COMPARECIMENTO };
  }

  // Procura uma AssinaturaPacoteCliente ATIVA do cliente (nessa barbearia)
  // que cubra o lote inteiro: só serviços avulsos (nada de Pacote — combo já
  // tem preço/composição própria), todos incluídos no mesmo pacote mensal, no
  // dia da semana permitido e com cota sobrando pra todos os itens do lote.
  // Se `usarAssinaturaPacoteId` foi informado (o cliente escolheu usar o
  // pacote de propósito), qualquer motivo de não cobrir vira erro claro em
  // vez de cair silenciosamente pro pagamento avulso.
  private async encontrarAssinaturaPacoteElegivel(
    clienteId: string,
    barbeariaId: string,
    resolvidos: ItemResolvido[],
    inicio: Date,
    usarAssinaturaPacoteId?: string,
  ) {
    if (resolvidos.some((r) => !r.servicoId)) {
      if (usarAssinaturaPacoteId) {
        throw new BadRequestException("Pacotes de serviço avulso não podem ser pagos com a cota de um pacote mensal.");
      }
      return null;
    }

    const candidatas = await this.prisma.assinaturaPacoteCliente.findMany({
      where: {
        ...(usarAssinaturaPacoteId ? { id: usarAssinaturaPacoteId } : {}),
        clienteId,
        barbeariaId,
        status: StatusAssinaturaPacote.ATIVA,
      },
      include: { pacoteMensal: { include: { servicos: true } } },
    });
    if (usarAssinaturaPacoteId && candidatas.length === 0) {
      throw new BadRequestException("Assinatura de pacote mensal não encontrada ou não está ativa.");
    }

    const diaSemana = inicio.getDay();
    const servicoIds = resolvidos.map((r) => r.servicoId!);

    for (const candidata of candidatas) {
      const idsIncluidos = new Set(candidata.pacoteMensal.servicos.map((s) => s.servicoId));
      if (!servicoIds.every((id) => idsIncluidos.has(id))) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Essa assinatura não cobre um ou mais dos serviços escolhidos.");
        continue;
      }

      const diasPermitidos = (candidata.pacoteMensal.diasSemanaPermitidos as number[]) ?? [];
      if (!diasPermitidos.includes(diaSemana)) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Seu pacote mensal não permite agendar nesse dia da semana.");
        continue;
      }

      const usos = await this.usosDaAssinaturaNaSemana(candidata.id, inicio);
      if (usos + resolvidos.length > candidata.pacoteMensal.vezesPorSemana) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Cota semanal do seu pacote mensal esgotada.");
        continue;
      }

      return candidata;
    }
    return null;
  }

  // Mesma definição de semana (segunda 00:00 até o próximo domingo) usada em
  // PacotesMensaisService.usosNaSemana — duplicado de propósito pra não criar
  // um ciclo entre os dois módulos por causa de um helper de 6 linhas.
  private usosDaAssinaturaNaSemana(assinaturaId: string, dataReferencia: Date) {
    const diaSemana = dataReferencia.getDay();
    const diasDesdeSegunda = (diaSemana + 6) % 7;
    const inicioSemana = new Date(dataReferencia);
    inicioSemana.setHours(0, 0, 0, 0);
    inicioSemana.setDate(inicioSemana.getDate() - diasDesdeSegunda);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(fimSemana.getDate() + 7);

    return this.prisma.agendamento.count({
      where: {
        assinaturaPacoteId: assinaturaId,
        status: { in: [StatusAgendamento.CONFIRMADO, StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] },
        inicio: { gte: inicioSemana, lt: fimSemana },
      },
    });
  }

  // Cria o lote inteiro já CONFIRMADO, usando a cota da assinatura — sem
  // Pagamento nenhum (o cliente já paga a mensalidade à parte, ver
  // PacotesMensaisService.assinar).
  private async criarComAssinaturaPacote(
    clienteId: string,
    barbeariaId: string,
    funcionarioId: string,
    resolvidos: ItemResolvido[],
    inicio: Date,
    assinaturaPacoteId: string,
  ) {
    const grupoId = randomUUID();
    let cursor = inicio;
    const dadosParaCriar = resolvidos.map((item) => {
      const inicioItem = cursor;
      const fimItem = new Date(inicioItem.getTime() + item.duracaoMinutos * 60_000);
      cursor = fimItem;
      return {
        barbeariaId,
        clienteId,
        funcionarioId,
        servicoId: item.servicoId,
        inicio: inicioItem,
        fim: fimItem,
        precoCentavos: item.precoCentavos,
        status: StatusAgendamento.CONFIRMADO,
        origem: OrigemAgendamento.CLIENTE_APP,
        assinaturaPacoteId,
        grupoId,
      };
    });

    await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    const agendamentos = await this.prisma.agendamento.findMany({
      where: { grupoId },
      include: { servico: true, pacote: true, funcionario: { include: { usuario: true } } },
      orderBy: { inicio: "asc" },
    });

    return { agendamentos, pagamento: null, aviso: AVISO_NAO_COMPARECIMENTO };
  }

  // A própria barbearia lança um agendamento na agenda — cliente avulso (sem
  // conta, só nome/telefone) ou um cliente já cadastrado no app. Cai direto
  // como CONFIRMADO, sem PENDENTE/pagamento pelo app (quem cobra, se cobrar,
  // é a própria barbearia por fora — ex: dinheiro/maquininha na hora).
  // Funcionário só pode lançar na PRÓPRIA agenda; o dono da barbearia pode
  // lançar na de qualquer funcionário da casa.
  async criarManual(user: AuthUser, dto: CreateAgendamentoManualDto) {
    if (!dto.clienteId && !dto.clienteAvulsoNome) {
      throw new BadRequestException("Informe o cliente cadastrado ou ao menos o nome do cliente avulso.");
    }

    let barbeariaId: string;
    if (user.papel === Papel.BARBEARIA_ADMIN) {
      if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
      barbeariaId = user.barbeariaId;
    } else if (user.papel === Papel.FUNCIONARIO) {
      const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId: user.id } });
      if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");
      if (funcionario.id !== dto.funcionarioId) {
        throw new ForbiddenException("Você só pode lançar agendamentos na sua própria agenda.");
      }
      barbeariaId = funcionario.barbeariaId;
    } else {
      throw new ForbiddenException("Sem permissão para lançar agendamentos manualmente.");
    }

    const resolvidos = await Promise.all(dto.itens.map((item) => this.resolverItem(item)));
    if (resolvidos.some((r) => r.barbeariaId !== barbeariaId)) {
      throw new BadRequestException("Todos os serviços do agendamento precisam ser da mesma barbearia.");
    }

    const duracaoTotalMinutos = resolvidos.reduce((total, r) => total + r.duracaoMinutos, 0);
    const inicio = new Date(dto.inicio);
    const fim = new Date(inicio.getTime() + duracaoTotalMinutos * 60_000);
    await this.garantirFuncionarioLivre(dto.funcionarioId, inicio, fim, barbeariaId);

    if (dto.clienteId) {
      const cliente = await this.prisma.usuario.findUnique({ where: { id: dto.clienteId } });
      if (!cliente) throw new NotFoundException("Cliente não encontrado.");
    }

    // Só usa grupoId quando há mais de um serviço (agrupa pra
    // cancelar/concluir juntos) — um item só nem precisa.
    const grupoId = resolvidos.length > 1 ? randomUUID() : undefined;
    let cursor = inicio;
    const dadosParaCriar = resolvidos.map((item) => {
      const inicioItem = cursor;
      const fimItem = new Date(inicioItem.getTime() + item.duracaoMinutos * 60_000);
      cursor = fimItem;
      return {
        barbeariaId,
        funcionarioId: dto.funcionarioId,
        clienteId: dto.clienteId,
        clienteAvulsoNome: dto.clienteId ? undefined : dto.clienteAvulsoNome,
        clienteAvulsoTelefone: dto.clienteId ? undefined : dto.clienteAvulsoTelefone,
        servicoId: item.servicoId,
        pacoteId: item.pacoteId,
        inicio: inicioItem,
        fim: fimItem,
        precoCentavos: item.precoCentavos,
        status: StatusAgendamento.CONFIRMADO,
        origem: OrigemAgendamento.BARBEARIA_MANUAL,
        grupoId,
      };
    });

    const criados = await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    return this.prisma.agendamento.findMany({
      where: { id: { in: criados.map((c) => c.id) } },
      include: { servico: true, pacote: true, funcionario: { include: { usuario: true } }, cliente: true },
      orderBy: { inicio: "asc" },
    });
  }

  // O app chama isso pra saber se o Pix/checkout já foi pago — enquanto
  // PENDENTE, também confere ao vivo com o Mercado Pago (não depende só do
  // webhook, que pode demorar ou estar mal configurado num ambiente novo).
  async buscarPagamento(pagamentoId: string, clienteId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento || pagamento.clienteId !== clienteId) throw new NotFoundException("Pagamento não encontrado.");

    if (pagamento.status === StatusPagamento.PENDENTE && pagamento.gatewayPagamentoId) {
      try {
        const token = await this.mercadoPago.tokenDaBarbearia(pagamento.barbeariaId);
        const atualizado = await this.sincronizarPagamentoComGateway(pagamento.id, pagamento.gatewayPagamentoId, token);
        return this.mapearPagamento(atualizado);
      } catch (e) {
        this.logger.warn(`Falha ao sincronizar pagamento ${pagamentoId} ao vivo, devolvendo estado salvo: ${e}`);
      }
    }
    return this.mapearPagamento(pagamento);
  }

  // Cliente desistiu de pagar (ex: voltou da tela de pagamento sem concluir)
  // — libera o horário e o grupo inteiro na hora, em vez de deixar preso até
  // PENDENTE_EXPIRA_MINUTOS vencer sozinho (ver filtroStatusAtivo). Só mexe
  // em algo se AINDA estiver PENDENTE: se o pagamento já aprovou (ex: o
  // webhook chegou um instante antes de o cliente tocar "cancelar") ou já foi
  // recusado, não desfaz nada — evita cancelar um agendamento que na verdade
  // já foi pago.
  async cancelarPagamentoPendente(pagamentoId: string, clienteId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento || pagamento.clienteId !== clienteId) throw new NotFoundException("Pagamento não encontrado.");

    if (pagamento.status === StatusPagamento.PENDENTE && pagamento.grupoId) {
      await this.prisma.$transaction([
        this.prisma.agendamento.updateMany({
          where: { grupoId: pagamento.grupoId, status: StatusAgendamento.PENDENTE },
          data: { status: StatusAgendamento.CANCELADO },
        }),
        this.prisma.pagamento.update({ where: { id: pagamentoId }, data: { status: StatusPagamento.RECUSADO } }),
      ]);
    }

    return this.mapearPagamento(await this.prisma.pagamento.findUniqueOrThrow({ where: { id: pagamentoId } }));
  }

  // Usado tanto pelo poll acima quanto pelo webhook (ver WebhooksService) —
  // busca o status atual no Mercado Pago e atualiza Pagamento/Agendamentos.
  private async sincronizarPagamentoComGateway(pagamentoId: string, gatewayPagamentoId: string, token: string) {
    const pagamentoMp = await this.mercadoPago.buscarPayment(gatewayPagamentoId, token);
    const novoStatus =
      pagamentoMp.status === "approved"
        ? StatusPagamento.APROVADO
        : pagamentoMp.status === "pending" || pagamentoMp.status === "in_process" || pagamentoMp.status === "authorized"
          ? StatusPagamento.PENDENTE
          : StatusPagamento.RECUSADO;

    const atualizado = await this.prisma.pagamento.update({
      where: { id: pagamentoId },
      // `?? null`: PaymentDetalhe.desafio3dsUrl vem undefined pro Pix (não
      // existe conceito de 3DS lá) — sem isso o Prisma reclamaria do tipo.
      data: { status: novoStatus, desafio3dsUrl: pagamentoMp.desafio3dsUrl ?? null },
    });
    if (novoStatus === StatusPagamento.APROVADO && atualizado.grupoId) {
      await this.prisma.agendamento.updateMany({
        where: { grupoId: atualizado.grupoId, status: StatusAgendamento.PENDENTE },
        data: { status: StatusAgendamento.CONFIRMADO },
      });
    }
    return atualizado;
  }

  private mapearPagamento(pagamento: {
    id: string;
    grupoId: string | null;
    clienteId: string;
    barbeariaId: string;
    metodo: string;
    status: string;
    valorCentavos: number;
    valorEstornadoCentavos: number;
    pixQrCodeBase64: string | null;
    pixCopiaECola: string | null;
    desafio3dsUrl: string | null;
    criadoEm: Date;
  }, checkoutUrl?: string | null) {
    return {
      id: pagamento.id,
      grupoId: pagamento.grupoId,
      clienteId: pagamento.clienteId,
      barbeariaId: pagamento.barbeariaId,
      metodo: pagamento.metodo,
      status: pagamento.status,
      valorCentavos: pagamento.valorCentavos,
      valorEstornadoCentavos: pagamento.valorEstornadoCentavos,
      pixQrCodeBase64: pagamento.pixQrCodeBase64,
      pixCopiaECola: pagamento.pixCopiaECola,
      desafio3dsUrl: pagamento.desafio3dsUrl,
      checkoutUrl: checkoutUrl ?? null,
      criadoEm: pagamento.criadoEm.toISOString(),
    };
  }

  // Dias (dentro do mês informado) que têm pelo menos um horário livre para a
  // duração total dos serviços escolhidos — alimenta o calendário do app.
  async listarDiasDisponiveis(barbeariaId: string, ano: number, mes: number, duracaoMinutos: number) {
    const inicioMes = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const inicioProximoMes = new Date(ano, mes, 1, 0, 0, 0, 0);

    const funcionarios = await this.funcionariosComAgenda(barbeariaId, inicioMes, inicioProximoMes);
    if (funcionarios.length === 0) return [];

    const agendamentos = await this.buscarAgendamentosNoIntervalo(
      funcionarios.map((f) => f.id),
      inicioMes,
      inicioProximoMes,
    );
    const agora = new Date();

    const dias: string[] = [];
    for (let dia = new Date(inicioMes); dia < inicioProximoMes; dia.setDate(dia.getDate() + 1)) {
      const temHorarioLivre = funcionarios.some((funcionario) =>
        slotsDoFuncionarioNoDia(funcionario, dia, duracaoMinutos).some(
          (slot) =>
            slot.inicio > agora &&
            slotLivre(agendamentos, funcionario.id, slot.inicio, slot.fim) &&
            folgaLivre(funcionario.folgas, slot.inicio, slot.fim),
        ),
      );
      if (temHorarioLivre) dias.push(formatarData(dia));
    }
    return dias;
  }

  // Horários livres (formato "HH:mm") num dia específico, para a duração total
  // dos serviços escolhidos — alimenta a lista de horários do app depois que o
  // cliente escolhe o dia no calendário.
  async listarHorariosDisponiveis(barbeariaId: string, data: string, duracaoMinutos: number, funcionarioId?: string) {
    const dia = new Date(`${data}T00:00:00`);
    const proximoDia = new Date(dia);
    proximoDia.setDate(proximoDia.getDate() + 1);

    const todosFuncionarios = await this.funcionariosComAgenda(barbeariaId, dia, proximoDia);
    const funcionarios = funcionarioId ? todosFuncionarios.filter((f) => f.id === funcionarioId) : todosFuncionarios;
    if (funcionarios.length === 0) return [];

    const agendamentos = await this.buscarAgendamentosNoIntervalo(
      funcionarios.map((f) => f.id),
      dia,
      proximoDia,
    );
    const agora = new Date();

    const horariosUnicos = new Set<string>();
    for (const funcionario of funcionarios) {
      for (const slot of slotsDoFuncionarioNoDia(funcionario, dia, duracaoMinutos)) {
        if (slot.inicio <= agora) continue;
        if (!slotLivre(agendamentos, funcionario.id, slot.inicio, slot.fim)) continue;
        if (!folgaLivre(funcionario.folgas, slot.inicio, slot.fim)) continue;
        horariosUnicos.add(formatarHorario(slot.inicio));
      }
    }
    return Array.from(horariosUnicos).sort();
  }

  listarMeusComoCliente(clienteId: string) {
    return this.prisma.agendamento.findMany({
      where: { clienteId },
      include: { servico: true, pacote: true, funcionario: { include: { usuario: true } } },
      orderBy: { inicio: "desc" },
    });
  }

  // Agenda de um funcionário específico, a partir do id do USUÁRIO logado
  // (usada pelo próprio app do funcionário — o token só carrega o id de Usuario).
  async listarAgendaFuncionario(usuarioId: string, dataInicio?: Date, dataFim?: Date) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");

    return this.prisma.agendamento.findMany({
      where: {
        funcionarioId: funcionario.id,
        status: { not: StatusAgendamento.CANCELADO },
        ...(dataInicio && dataFim ? { inicio: { gte: dataInicio, lt: dataFim } } : {}),
      },
      include: { servico: true, pacote: true, cliente: true },
      orderBy: { inicio: "asc" },
    });
  }

  // Agenda de toda a barbearia (usada pelo app do dono), com filtro opcional por funcionário.
  listarAgendaBarbearia(barbeariaId: string, dataInicio?: Date, dataFim?: Date, funcionarioId?: string) {
    return this.prisma.agendamento.findMany({
      where: {
        barbeariaId,
        status: { not: StatusAgendamento.CANCELADO },
        ...(funcionarioId ? { funcionarioId } : {}),
        ...(dataInicio && dataFim ? { inicio: { gte: dataInicio, lt: dataFim } } : {}),
      },
      include: { servico: true, pacote: true, cliente: true, funcionario: { include: { usuario: true } } },
      orderBy: { inicio: "asc" },
    });
  }

  async cancelar(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeCancelar =
      (user.papel === Papel.CLIENTE && agendamento.clienteId === user.id) ||
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.BARBEARIA_ADMIN && agendamento.barbeariaId === user.barbeariaId);
    if (!podeCancelar) throw new ForbiddenException("Você não pode cancelar este agendamento.");

    // Se faz parte de um lote (vários serviços marcados juntos), cancela o
    // grupo inteiro — pro cliente, é "um" agendamento só.
    if (agendamento.grupoId) {
      await this.prisma.$transaction([
        this.prisma.agendamento.updateMany({
          where: { grupoId: agendamento.grupoId, status: { not: StatusAgendamento.CANCELADO } },
          data: { status: StatusAgendamento.CANCELADO },
        }),
        // Nunca chegou a ser pago (cliente cancelou antes de pagar) — não tem
        // o que estornar, só marca a cobrança como não vai mais acontecer.
        // Se JÁ estava aprovado, não mexe aqui: hoje não há estorno automático
        // por cancelamento (só por não comparecimento — ver marcarNaoCompareceu).
        this.prisma.pagamento.updateMany({
          where: { grupoId: agendamento.grupoId, status: StatusPagamento.PENDENTE },
          data: { status: StatusPagamento.RECUSADO },
        }),
      ]);
      return this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } });
    }

    return this.prisma.agendamento.update({ where: { id }, data: { status: StatusAgendamento.CANCELADO } });
  }

  // O funcionário marca o atendimento como concluído (entra no financeiro
  // dele/da barbearia). Se veio do app do cliente, exige que o pagamento já
  // esteja aprovado — evita marcar como concluído (e contar no faturamento)
  // um horário que na verdade não foi pago ainda.
  async concluir(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeConcluir =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.BARBEARIA_ADMIN && agendamento.barbeariaId === user.barbeariaId);
    if (!podeConcluir) throw new ForbiddenException("Você não pode concluir este agendamento.");

    if (agendamento.origem === OrigemAgendamento.CLIENTE_APP && agendamento.grupoId) {
      const pagamento = await this.prisma.pagamento.findFirst({ where: { grupoId: agendamento.grupoId } });
      if (pagamento && pagamento.status !== StatusPagamento.APROVADO) {
        throw new BadRequestException("O pagamento desse agendamento ainda não foi confirmado.");
      }
    }

    return this.prisma.agendamento.update({ where: { id }, data: { status: StatusAgendamento.CONCLUIDO } });
  }

  // Funcionário/barbearia marca que o cliente não apareceu no horário — retém
  // 50% do valor pago como multa (estornando o resto) e libera o profissional
  // pro resto da agenda. Aplica ao GRUPO inteiro (todos os serviços marcados
  // juntos nesse horário), já que "não comparecimento" é sobre o horário, não
  // sobre um serviço específico dentro dele.
  async marcarNaoCompareceu(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeMarcar =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.BARBEARIA_ADMIN && agendamento.barbeariaId === user.barbeariaId);
    if (!podeMarcar) throw new ForbiddenException("Você não pode marcar isso nesse agendamento.");
    if (agendamento.status !== StatusAgendamento.CONFIRMADO) {
      throw new BadRequestException("Só é possível marcar não comparecimento em um agendamento confirmado.");
    }

    const grupoId = agendamento.grupoId ?? agendamento.id;
    const grupo = agendamento.grupoId
      ? await this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } })
      : [agendamento];

    const pagamento = await this.prisma.pagamento.findFirst({ where: { grupoId } });

    await this.prisma.$transaction(
      grupo.map((a) =>
        this.prisma.agendamento.update({
          where: { id: a.id },
          data: {
            status: StatusAgendamento.NAO_COMPARECEU,
            // Sem multa em dinheiro quando o horário veio da cota de um
            // pacote mensal — não existe Pagamento avulso pra reter/estornar
            // aqui, o cliente já paga a mensalidade à parte. A vaga da
            // semana ainda é contada como usada (ver usosDaAssinaturaNaSemana).
            valorMultaCentavos: a.assinaturaPacoteId ? null : Math.round(a.precoCentavos * FRACAO_MULTA_NAO_COMPARECIMENTO),
          },
        }),
      ),
    );

    // Estorna 50% ao cliente (o resto fica retido com a barbearia como
    // multa) — só se realmente foi pago pelo app. Agendamento lançado
    // manualmente pela barbearia (sem Pagamento) não tem o que estornar.
    if (pagamento && pagamento.status === StatusPagamento.APROVADO && pagamento.gatewayPagamentoId) {
      const valorEstornoCentavos = pagamento.valorCentavos - Math.round(pagamento.valorCentavos * FRACAO_MULTA_NAO_COMPARECIMENTO);
      try {
        const token = await this.mercadoPago.tokenDaBarbearia(agendamento.barbeariaId);
        await this.mercadoPago.estornarPagamento(pagamento.gatewayPagamentoId, token, valorEstornoCentavos);
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: { status: StatusPagamento.PARCIALMENTE_ESTORNADO, valorEstornadoCentavos: valorEstornoCentavos },
        });
      } catch (e) {
        // O agendamento já foi marcado como não comparecido de qualquer
        // forma (a barbearia não deve ficar travada esperando o Mercado
        // Pago) — mas registra bem alto, porque isso precisa de atenção
        // manual: o cliente não foi estornado.
        this.logger.error(
          `FALHA AO ESTORNAR multa de não comparecimento — pagamento ${pagamento.id}, agendamento ${id}: ${e}. Requer estorno manual.`,
        );
      }
    }

    return this.prisma.agendamento.findMany({ where: { grupoId } });
  }

  // ---------- helpers privados ----------

  private async resolverItem(item: { servicoId?: string; pacoteId?: string }): Promise<ItemResolvido> {
    if (item.servicoId) {
      const servico = await this.prisma.servico.findUnique({ where: { id: item.servicoId } });
      if (!servico || !servico.ativo) throw new BadRequestException("Serviço inválido.");
      return {
        servicoId: servico.id,
        duracaoMinutos: servico.duracaoMinutos,
        precoCentavos: servico.precoCentavos,
        barbeariaId: servico.barbeariaId,
      };
    }
    if (item.pacoteId) {
      const pacote = await this.prisma.pacote.findUnique({
        where: { id: item.pacoteId },
        include: { servicos: { include: { servico: true } } },
      });
      if (!pacote || !pacote.ativo) throw new BadRequestException("Pacote inválido.");
      const duracaoMinutos = pacote.servicos.reduce((total, ps) => total + ps.servico.duracaoMinutos, 0) || 30;
      return {
        pacoteId: pacote.id,
        duracaoMinutos,
        precoCentavos: pacote.precoCentavos,
        barbeariaId: pacote.barbeariaId,
      };
    }
    throw new BadRequestException("Informe um serviço ou um pacote para cada item do agendamento.");
  }

  // Busca os funcionários ativos/disponíveis da barbearia junto com o
  // expediente semanal e as folgas que caem dentro do intervalo pedido —
  // tudo que é preciso pra calcular disponibilidade sem novas queries por dia.
  private funcionariosComAgenda(barbeariaId: string, inicioIntervalo: Date, fimIntervalo: Date) {
    return this.prisma.funcionario.findMany({
      where: { barbeariaId, ativo: true, disponivel: true },
      include: {
        horarios: true,
        folgas: { where: { inicio: { lt: fimIntervalo }, fim: { gt: inicioIntervalo } } },
      },
    });
  }

  private async garantirFuncionarioLivre(funcionarioId: string, inicio: Date, fim: Date, barbeariaId?: string) {
    const funcionario = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      include: {
        horarios: true,
        folgas: { where: { inicio: { lt: fim }, fim: { gt: inicio } } },
      },
    });
    if (!funcionario || !funcionario.ativo || !funcionario.disponivel) {
      throw new BadRequestException("Profissional indisponível para agendamento.");
    }
    if (barbeariaId && funcionario.barbeariaId !== barbeariaId) {
      throw new BadRequestException("Este profissional não atende essa barbearia.");
    }

    if (funcionario.folgas.some((f) => f.inicio < fim && f.fim > inicio)) {
      throw new BadRequestException("Profissional de folga nesse horário. Escolha outro horário ou profissional.");
    }
    if (!dentroDoExpediente(funcionario, inicio, fim)) {
      throw new BadRequestException(
        "Horário fora do expediente do profissional (ou durante o horário de almoço). Escolha outro horário.",
      );
    }

    const conflito = await this.prisma.agendamento.findFirst({
      where: { funcionarioId, ...filtroStatusAtivo(), inicio: { lt: fim }, fim: { gt: inicio } },
    });
    if (conflito) throw new BadRequestException("Esse horário acabou de ser reservado. Escolha outro.");
    return funcionarioId;
  }

  private async escolherFuncionarioDisponivel(barbeariaId: string, inicio: Date, fim: Date) {
    const funcionarios = await this.prisma.funcionario.findMany({
      where: { barbeariaId, ativo: true, disponivel: true },
      include: {
        horarios: true,
        folgas: { where: { inicio: { lt: fim }, fim: { gt: inicio } } },
      },
    });

    for (const funcionario of funcionarios) {
      if (funcionario.folgas.some((f) => f.inicio < fim && f.fim > inicio)) continue;
      if (!dentroDoExpediente(funcionario, inicio, fim)) continue;

      const conflito = await this.prisma.agendamento.findFirst({
        where: { funcionarioId: funcionario.id, ...filtroStatusAtivo(), inicio: { lt: fim }, fim: { gt: inicio } },
      });
      if (!conflito) return funcionario.id;
    }
    throw new BadRequestException(
      "Nenhum profissional trabalha nesse horário. Escolha outro dia/horário — ou verifique se algum funcionário já cadastrou sua agenda.",
    );
  }

  private buscarAgendamentosNoIntervalo(funcionarioIds: string[], inicio: Date, fim: Date) {
    return this.prisma.agendamento.findMany({
      where: { funcionarioId: { in: funcionarioIds }, ...filtroStatusAtivo(), inicio: { lt: fim }, fim: { gt: inicio } },
      select: { funcionarioId: true, inicio: true, fim: true },
    });
  }
}

// CONFIRMADO sempre bloqueia o horário; PENDENTE (pagamento em andamento) só
// bloqueia enquanto ainda está "fresco" — depois de PENDENTE_EXPIRA_MINUTOS,
// trata como se o cliente tivesse desistido do pagamento (ver comentário na
// constante). Evita precisar de um job em background só pra liberar slots
// de pagamentos abandonados.
function filtroStatusAtivo() {
  return {
    OR: [
      { status: StatusAgendamento.CONFIRMADO },
      { status: StatusAgendamento.PENDENTE, criadoEm: { gte: new Date(Date.now() - PENDENTE_EXPIRA_MINUTOS * 60_000) } },
    ],
  };
}

// Quebra o expediente de um dia em uma ou duas janelas (antes/depois do
// almoço, se houver). Sem almoço cadastrado, é uma janela só.
function gerarJanelasDoDia(horario: HorarioTrabalho, dia: Date): { inicio: Date; fim: Date }[] {
  const inicio = combinarDataHora(dia, horario.horaInicio);
  const fim = combinarDataHora(dia, horario.horaFim);

  if (horario.inicioAlmoco && horario.fimAlmoco) {
    const inicioAlmoco = combinarDataHora(dia, horario.inicioAlmoco);
    const fimAlmoco = combinarDataHora(dia, horario.fimAlmoco);
    return [
      { inicio, fim: inicioAlmoco },
      { inicio: fimAlmoco, fim },
    ];
  }
  return [{ inicio, fim }];
}

// Gera os horários de início possíveis (de INTERVALO_ENTRE_INICIOS_MINUTOS em
// INTERVALO_ENTRE_INICIOS_MINUTOS) pro funcionário num dia, considerando seu
// expediente cadastrado (HorarioTrabalho) — se ele não trabalha nesse dia da
// semana, retorna lista vazia.
function slotsDoFuncionarioNoDia(
  funcionario: FuncionarioComAgenda,
  dia: Date,
  duracaoMinutos: number,
): { inicio: Date; fim: Date }[] {
  const diaSemana = dia.getDay();
  const horario = funcionario.horarios.find((h) => h.diaSemana === diaSemana);
  if (!horario) return [];

  const slots: { inicio: Date; fim: Date }[] = [];
  for (const janela of gerarJanelasDoDia(horario, dia)) {
    for (
      let inicio = new Date(janela.inicio);
      addMinutos(inicio, duracaoMinutos) <= janela.fim;
      inicio = addMinutos(inicio, INTERVALO_ENTRE_INICIOS_MINUTOS)
    ) {
      slots.push({ inicio: new Date(inicio), fim: addMinutos(inicio, duracaoMinutos) });
    }
  }
  return slots;
}

// Confere se [inicio, fim) cabe inteiro dentro de alguma janela do expediente
// do funicionário no dia de "inicio" — usado na hora de CRIAR o agendamento
// (fora do fluxo de "listar slots"), pra bloquear tentativas de marcar direto
// na API fora do horário de trabalho ou durante o almoço.
function dentroDoExpediente(funcionario: FuncionarioComAgenda, inicio: Date, fim: Date): boolean {
  const diaSemana = inicio.getDay();
  const horario = funcionario.horarios.find((h) => h.diaSemana === diaSemana);
  if (!horario) return false;
  return gerarJanelasDoDia(horario, inicio).some((janela) => inicio >= janela.inicio && fim <= janela.fim);
}

function slotLivre(
  agendamentos: { funcionarioId: string; inicio: Date; fim: Date }[],
  funcionarioId: string,
  inicio: Date,
  fim: Date,
): boolean {
  return !agendamentos.some((a) => a.funcionarioId === funcionarioId && a.inicio < fim && a.fim > inicio);
}

function folgaLivre(folgas: { inicio: Date; fim: Date }[], inicio: Date, fim: Date): boolean {
  return !folgas.some((f) => f.inicio < fim && f.fim > inicio);
}

function combinarDataHora(dia: Date, horaMinuto: string): Date {
  const [horas, minutos] = horaMinuto.split(":").map(Number);
  const data = new Date(dia);
  data.setHours(horas, minutos, 0, 0);
  return data;
}

function addMinutos(data: Date, minutos: number): Date {
  return new Date(data.getTime() + minutos * 60_000);
}

function formatarData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarHorario(data: Date): string {
  const horas = String(data.getHours()).padStart(2, "0");
  const minutos = String(data.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

// Traduz os motivos de recusa mais comuns que o Mercado Pago devolve em
// status_detail pra uma mensagem que faça sentido pro cliente final — o
// código cru (ex: "cc_rejected_insufficient_amount") não diz nada pra quem
// não é integrador. Lista não exaustiva de propósito: cobre os motivos mais
// frequentes, com uma mensagem genérica de fallback pros demais.
function traduzirMotivoRecusaCartao(statusDetail: string | null): string {
  const mensagens: Record<string, string> = {
    cc_rejected_insufficient_amount: "Cartão sem limite suficiente para esse valor.",
    cc_rejected_bad_filled_security_code: "Código de segurança (CVV) incorreto.",
    cc_rejected_bad_filled_date: "Data de validade incorreta.",
    cc_rejected_bad_filled_card_number: "Número do cartão incorreto.",
    cc_rejected_bad_filled_other: "Dados do cartão incorretos.",
    cc_rejected_call_for_authorize: "O banco exige autorização — ligue para o emissor do cartão ou tente outro.",
    cc_rejected_card_disabled: "Cartão desabilitado. Entre em contato com o banco ou tente outro cartão.",
    cc_rejected_duplicated_payment: "Já existe um pagamento igual recente — aguarde alguns minutos ou tente outro cartão.",
    cc_rejected_high_risk: "O pagamento foi recusado por segurança. Tente outro cartão.",
    cc_rejected_max_attempts: "Número máximo de tentativas excedido. Tente outro cartão.",
    cc_rejected_invalid_installments: "Parcelamento inválido para esse cartão.",
    cc_rejected_other_reason: "O cartão recusou o pagamento.",
  };
  const mensagem = (statusDetail && mensagens[statusDetail]) || "O cartão recusou o pagamento.";
  return `Pagamento não aprovado: ${mensagem} Tente outro cartão ou pague com Pix.`;
}
