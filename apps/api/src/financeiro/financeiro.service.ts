import { Injectable, NotFoundException } from "@nestjs/common";
import { StatusAgendamento } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";

type Periodo = "hoje" | "semana" | "mes";

function intervaloPara(periodo: Periodo): { inicio: Date; fim: Date } {
  const agora = new Date();
  const fim = new Date(agora);
  const inicio = new Date(agora);

  if (periodo === "hoje") {
    inicio.setHours(0, 0, 0, 0);
  } else if (periodo === "semana") {
    inicio.setDate(inicio.getDate() - 7);
  } else {
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
  }
  return { inicio, fim };
}

@Injectable()
export class FinanceiroService {
  constructor(private prisma: PrismaService) {}

  // Resumo financeiro de UM funcionário (o próprio app dele), a partir do id do Usuario.
  async resumoFuncionario(usuarioId: string, periodo: Periodo) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");

    const { inicio, fim } = intervaloPara(periodo);
    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        funcionarioId: funcionario.id,
        status: StatusAgendamento.CONCLUIDO,
        inicio: { gte: inicio, lte: fim },
      },
    });

    const faturamentoCentavos = agendamentos.reduce((soma, a) => soma + a.precoCentavos, 0);
    const comissaoCentavos = Math.round((faturamentoCentavos * funcionario.comissaoPercentual) / 100);

    return {
      periodo,
      atendimentos: agendamentos.length,
      faturamentoCentavos,
      comissaoCentavos,
    };
  }

  // Resumo consolidado da barbearia inteira (app do dono), com detalhamento por funcionário.
  async resumoBarbearia(barbeariaId: string, periodo: Periodo) {
    const { inicio, fim } = intervaloPara(periodo);

    const [agendamentos, funcionarios] = await Promise.all([
      this.prisma.agendamento.findMany({
        where: { barbeariaId, status: StatusAgendamento.CONCLUIDO, inicio: { gte: inicio, lte: fim } },
      }),
      this.prisma.funcionario.findMany({ where: { barbeariaId }, include: { usuario: true } }),
    ]);

    const porFuncionario = funcionarios.map((f) => {
      const doFuncionario = agendamentos.filter((a) => a.funcionarioId === f.id);
      const faturamentoCentavos = doFuncionario.reduce((soma, a) => soma + a.precoCentavos, 0);
      const comissaoCentavos = Math.round((faturamentoCentavos * f.comissaoPercentual) / 100);
      return {
        funcionarioId: f.id,
        nome: f.usuario.nome,
        atendimentos: doFuncionario.length,
        faturamentoCentavos,
        comissaoCentavos,
      };
    });

    const faturamentoCentavos = porFuncionario.reduce((soma, f) => soma + f.faturamentoCentavos, 0);
    const comissoesCentavos = porFuncionario.reduce((soma, f) => soma + f.comissaoCentavos, 0);

    return {
      periodo,
      atendimentos: agendamentos.length,
      faturamentoCentavos,
      comissoesCentavos,
      lucroCentavos: faturamentoCentavos - comissoesCentavos,
      porFuncionario,
    };
  }
}
