import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Papel, StatusAgendamento } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAgendamentoDto } from "./dto/create-agendamento.dto";
import { AuthUser } from "../auth/jwt.strategy";

@Injectable()
export class AgendamentosService {
  constructor(private prisma: PrismaService) {}

  async criar(clienteId: string, dto: CreateAgendamentoDto) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { id: dto.funcionarioId } });
    if (!funcionario || !funcionario.ativo || !funcionario.disponivel) {
      throw new BadRequestException("Profissional indisponível para agendamento.");
    }

    // Resolve duração e preço a partir do serviço avulso ou do pacote escolhido.
    let duracaoMinutos: number;
    let precoCentavos: number;
    let barbeariaId: string;

    if (dto.servicoId) {
      const servico = await this.prisma.servico.findUnique({ where: { id: dto.servicoId } });
      if (!servico || !servico.ativo) throw new BadRequestException("Serviço inválido.");
      duracaoMinutos = servico.duracaoMinutos;
      precoCentavos = servico.precoCentavos;
      barbeariaId = servico.barbeariaId;
    } else if (dto.pacoteId) {
      const pacote = await this.prisma.pacote.findUnique({
        where: { id: dto.pacoteId },
        include: { servicos: { include: { servico: true } } },
      });
      if (!pacote || !pacote.ativo) throw new BadRequestException("Pacote inválido.");
      duracaoMinutos = pacote.servicos.reduce((total, ps) => total + ps.servico.duracaoMinutos, 0) || 30;
      precoCentavos = pacote.precoCentavos;
      barbeariaId = pacote.barbeariaId;
    } else {
      throw new BadRequestException("Informe um serviço ou um pacote.");
    }

    if (funcionario.barbeariaId !== barbeariaId) {
      throw new BadRequestException("Este profissional não atende essa barbearia.");
    }

    const inicio = new Date(dto.inicio);
    const fim = new Date(inicio.getTime() + duracaoMinutos * 60_000);

    // Trava de conflito: nenhum outro agendamento ativo do mesmo funcionário pode
    // se sobrepor ao intervalo [inicio, fim).
    const conflito = await this.prisma.agendamento.findFirst({
      where: {
        funcionarioId: dto.funcionarioId,
        status: { in: [StatusAgendamento.PENDENTE, StatusAgendamento.CONFIRMADO] },
        inicio: { lt: fim },
        fim: { gt: inicio },
      },
    });
    if (conflito) throw new BadRequestException("Esse horário acabou de ser reservado. Escolha outro.");

    return this.prisma.agendamento.create({
      data: {
        barbeariaId,
        clienteId,
        funcionarioId: dto.funcionarioId,
        servicoId: dto.servicoId,
        pacoteId: dto.pacoteId,
        inicio,
        fim,
        precoCentavos,
        status: StatusAgendamento.CONFIRMADO,
      },
      include: { servico: true, pacote: true, funcionario: { include: { usuario: true } } },
    });
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
}
