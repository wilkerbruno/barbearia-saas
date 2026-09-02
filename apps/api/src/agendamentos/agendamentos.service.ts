import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Papel, StatusAgendamento } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAgendamentoDto } from "./dto/create-agendamento.dto";
import { CreateAgendamentoLoteDto } from "./dto/create-agendamento-lote.dto";
import { AuthUser } from "../auth/jwt.strategy";

// Horário de funcionamento fixo do MVP (todo dia, mesma janela). Um próximo
// passo natural é deixar isso configurável por barbearia (ver README/roadmap).
const HORARIO_ABERTURA = 9; // 09:00
const HORARIO_FECHAMENTO = 19; // 19:00
const INTERVALO_ENTRE_INICIOS_MINUTOS = 30; // de quanto em quanto tempo um novo horário pode começar

const STATUS_ATIVOS = [StatusAgendamento.PENDENTE, StatusAgendamento.CONFIRMADO];

interface ItemResolvido {
  servicoId?: string;
  pacoteId?: string;
  duracaoMinutos: number;
  precoCentavos: number;
  barbeariaId: string;
}

@Injectable()
export class AgendamentosService {
  constructor(private prisma: PrismaService) {}

  async criar(clienteId: string, dto: CreateAgendamentoDto) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { id: dto.funcionarioId } });
    if (!funcionario || !funcionario.ativo || !funcionario.disponivel) {
      throw new BadRequestException("Profissional indisponível para agendamento.");
    }

    const item = await this.resolverItem({ servicoId: dto.servicoId, pacoteId: dto.pacoteId });
    if (funcionario.barbeariaId !== item.barbeariaId) {
      throw new BadRequestException("Este profissional não atende essa barbearia.");
    }

    const inicio = new Date(dto.inicio);
    const fim = new Date(inicio.getTime() + item.duracaoMinutos * 60_000);
    await this.garantirFuncionarioLivre(dto.funcionarioId, inicio, fim);

    return this.prisma.agendamento.create({
      data: {
        barbeariaId: item.barbeariaId,
        clienteId,
        funcionarioId: dto.funcionarioId,
        servicoId: item.servicoId,
        pacoteId: item.pacoteId,
        inicio,
        fim,
        precoCentavos: item.precoCentavos,
        status: StatusAgendamento.CONFIRMADO,
      },
      include: { servico: true, pacote: true, funcionario: { include: { usuario: true } } },
    });
  }

  // O cliente marca vários serviços de uma vez (pode repetir o mesmo, ex: 2x
  // corte pra pai e filho) num único horário — cada item vira um Agendamento
  // próprio, encadeado em sequência a partir de "inicio" e com o mesmo
  // profissional, todos marcados com o mesmo grupoId pra serem exibidos e
  // cancelados juntos no app.
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
        status: StatusAgendamento.CONFIRMADO,
        grupoId,
      };
    });

    await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));

    return this.prisma.agendamento.findMany({
      where: { grupoId },
      include: { servico: true, pacote: true, funcionario: { include: { usuario: true } } },
      orderBy: { inicio: "asc" },
    });
  }

  // Dias (dentro do mês informado) que têm pelo menos um horário livre para a
  // duração total dos serviços escolhidos — alimenta o calendário do app.
  async listarDiasDisponiveis(barbeariaId: string, ano: number, mes: number, duracaoMinutos: number) {
    const inicioMes = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const inicioProximoMes = new Date(ano, mes, 1, 0, 0, 0, 0);

    const funcionarioIds = await this.funcionariosAtivos(barbeariaId);
    if (funcionarioIds.length === 0) return [];

    const agendamentos = await this.buscarAgendamentosNoIntervalo(funcionarioIds, inicioMes, inicioProximoMes);
    const agora = new Date();

    const dias: string[] = [];
    for (let dia = new Date(inicioMes); dia < inicioProximoMes; dia.setDate(dia.getDate() + 1)) {
      const slots = gerarSlotsDoDia(dia, duracaoMinutos);
      const temHorarioLivre = slots.some(
        (slot) => slot.inicio > agora && funcionarioIds.some((fid) => slotLivre(agendamentos, fid, slot.inicio, slot.fim)),
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

    const funcionarioIds = funcionarioId ? [funcionarioId] : await this.funcionariosAtivos(barbeariaId);
    if (funcionarioIds.length === 0) return [];

    const agendamentos = await this.buscarAgendamentosNoIntervalo(funcionarioIds, dia, proximoDia);
    const agora = new Date();

    return gerarSlotsDoDia(dia, duracaoMinutos)
      .filter((slot) => slot.inicio > agora)
      .filter((slot) => funcionarioIds.some((fid) => slotLivre(agendamentos, fid, slot.inicio, slot.fim)))
      .map((slot) => formatarHorario(slot.inicio));
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
      await this.prisma.agendamento.updateMany({
        where: { grupoId: agendamento.grupoId, status: { not: StatusAgendamento.CANCELADO } },
        data: { status: StatusAgendamento.CANCELADO },
      });
      return this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } });
    }

    return this.prisma.agendamento.update({ where: { id }, data: { status: StatusAgendamento.CANCELADO } });
  }

  // O funcionário marca o atendimento como concluído (entra no financeiro dele/da barbearia).
  async concluir(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeConcluir =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.BARBEARIA_ADMIN && agendamento.barbeariaId === user.barbeariaId);
    if (!podeConcluir) throw new ForbiddenException("Você não pode concluir este agendamento.");

    return this.prisma.agendamento.update({ where: { id }, data: { status: StatusAgendamento.CONCLUIDO } });
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

  private async garantirFuncionarioLivre(funcionarioId: string, inicio: Date, fim: Date, barbeariaId?: string) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { id: funcionarioId } });
    if (!funcionario || !funcionario.ativo || !funcionario.disponivel) {
      throw new BadRequestException("Profissional indisponível para agendamento.");
    }
    if (barbeariaId && funcionario.barbeariaId !== barbeariaId) {
      throw new BadRequestException("Este profissional não atende essa barbearia.");
    }
    const conflito = await this.prisma.agendamento.findFirst({
      where: { funcionarioId, status: { in: STATUS_ATIVOS }, inicio: { lt: fim }, fim: { gt: inicio } },
    });
    if (conflito) throw new BadRequestException("Esse horário acabou de ser reservado. Escolha outro.");
    return funcionarioId;
  }

  private async escolherFuncionarioDisponivel(barbeariaId: string, inicio: Date, fim: Date) {
    const funcionarios = await this.prisma.funcionario.findMany({ where: { barbeariaId, ativo: true, disponivel: true } });
    for (const funcionario of funcionarios) {
      const conflito = await this.prisma.agendamento.findFirst({
        where: { funcionarioId: funcionario.id, status: { in: STATUS_ATIVOS }, inicio: { lt: fim }, fim: { gt: inicio } },
      });
      if (!conflito) return funcionario.id;
    }
    throw new BadRequestException("Nenhum profissional disponível nesse horário. Escolha outro horário.");
  }

  private funcionariosAtivos(barbeariaId: string) {
    return this.prisma.funcionario
      .findMany({ where: { barbeariaId, ativo: true, disponivel: true }, select: { id: true } })
      .then((lista) => lista.map((f) => f.id));
  }

  private buscarAgendamentosNoIntervalo(funcionarioIds: string[], inicio: Date, fim: Date) {
    return this.prisma.agendamento.findMany({
      where: { funcionarioId: { in: funcionarioIds }, status: { in: STATUS_ATIVOS }, inicio: { lt: fim }, fim: { gt: inicio } },
      select: { funcionarioId: true, inicio: true, fim: true },
    });
  }
}

function gerarSlotsDoDia(dia: Date, duracaoMinutos: number): { inicio: Date; fim: Date }[] {
  const abertura = new Date(dia);
  abertura.setHours(HORARIO_ABERTURA, 0, 0, 0);
  const fechamento = new Date(dia);
  fechamento.setHours(HORARIO_FECHAMENTO, 0, 0, 0);

  const slots: { inicio: Date; fim: Date }[] = [];
  for (
    let inicio = new Date(abertura);
    new Date(inicio.getTime() + duracaoMinutos * 60_000) <= fechamento;
    inicio = new Date(inicio.getTime() + INTERVALO_ENTRE_INICIOS_MINUTOS * 60_000)
  ) {
    slots.push({ inicio: new Date(inicio), fim: new Date(inicio.getTime() + duracaoMinutos * 60_000) });
  }
  return slots;
}

function slotLivre(
  agendamentos: { funcionarioId: string; inicio: Date; fim: Date }[],
  funcionarioId: string,
  inicio: Date,
  fim: Date,
): boolean {
  return !agendamentos.some((a) => a.funcionarioId === funcionarioId && a.inicio < fim && a.fim > inicio);
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
