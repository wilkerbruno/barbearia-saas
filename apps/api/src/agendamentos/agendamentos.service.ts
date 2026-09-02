import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Funcionario, Folga, HorarioTrabalho } from "@prisma/client";
import { Papel, StatusAgendamento } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAgendamentoDto } from "./dto/create-agendamento.dto";
import { CreateAgendamentoLoteDto } from "./dto/create-agendamento-lote.dto";
import { AuthUser } from "../auth/jwt.strategy";

// De quanto em quanto tempo um novo horário pode começar (ex: 09:00, 09:30,
// 10:00...). O expediente em si (dias, hora de início/fim, almoço) agora vem
// do HorarioTrabalho de cada funcionário, cadastrado por ele mesmo no app.
const INTERVALO_ENTRE_INICIOS_MINUTOS = 30;

const STATUS_ATIVOS = [StatusAgendamento.PENDENTE, StatusAgendamento.CONFIRMADO];

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
  constructor(private prisma: PrismaService) {}

  async criar(clienteId: string, dto: CreateAgendamentoDto) {
    const item = await this.resolverItem({ servicoId: dto.servicoId, pacoteId: dto.pacoteId });

    const inicio = new Date(dto.inicio);
    const fim = new Date(inicio.getTime() + item.duracaoMinutos * 60_000);
    await this.garantirFuncionarioLivre(dto.funcionarioId, inicio, fim, item.barbeariaId);

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
      where: { funcionarioId, status: { in: STATUS_ATIVOS }, inicio: { lt: fim }, fim: { gt: inicio } },
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
        where: { funcionarioId: funcionario.id, status: { in: STATUS_ATIVOS }, inicio: { lt: fim }, fim: { gt: inicio } },
      });
      if (!conflito) return funcionario.id;
    }
    throw new BadRequestException(
      "Nenhum profissional trabalha nesse horário. Escolha outro dia/horário — ou verifique se algum funcionário já cadastrou sua agenda.",
    );
  }

  private buscarAgendamentosNoIntervalo(funcionarioIds: string[], inicio: Date, fim: Date) {
    return this.prisma.agendamento.findMany({
      where: { funcionarioId: { in: funcionarioIds }, status: { in: STATUS_ATIVOS }, inicio: { lt: fim }, fim: { gt: inicio } },
      select: { funcionarioId: true, inicio: true, fim: true },
    });
  }
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
