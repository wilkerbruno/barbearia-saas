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
  // Inclui, além dos atendimentos concluídos, a multa retida (50%) de
  // agendamentos em que o cliente não compareceu — ver AgendamentosService.
  // marcarNaoCompareceu. A comissão do funcionário incide só sobre o que foi
  // de fato atendido (CONCLUIDO), não sobre a multa.
  async resumoFuncionario(usuarioId: string, periodo: Periodo) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");

    const { inicio, fim } = intervaloPara(periodo);
    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        funcionarioId: funcionario.id,
        status: { in: [StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] },
        inicio: { gte: inicio, lte: fim },
      },
    });
    const concluidos = agendamentos.filter((a) => a.status === StatusAgendamento.CONCLUIDO);
    const naoCompareceram = agendamentos.filter((a) => a.status === StatusAgendamento.NAO_COMPARECEU);

    const faturamentoConcluidosCentavos = concluidos.reduce((soma, a) => soma + a.precoCentavos, 0);
    const multasCentavos = naoCompareceram.reduce((soma, a) => soma + (a.valorMultaCentavos ?? 0), 0);
    const comissaoCentavos = Math.round((faturamentoConcluidosCentavos * funcionario.comissaoPercentual) / 100);

    return {
      periodo,
      atendimentos: concluidos.length,
      faturamentoCentavos: faturamentoConcluidosCentavos + multasCentavos,
      multasCentavos,
      comissaoCentavos,
    };
  }

  // Resumo consolidado da barbearia inteira (app do dono), com detalhamento por
  // funcionário e por serviço/pacote (pra saber o que realmente traz receita).
  // porFuncionario/porServico contam só atendimentos concluídos de verdade;
  // a multa de não comparecimento entra separada, no total (ver multasCentavos).
  async resumoBarbearia(barbeariaId: string, periodo: Periodo) {
    const { inicio, fim } = intervaloPara(periodo);

    const [todos, funcionarios] = await Promise.all([
      this.prisma.agendamento.findMany({
        where: { barbeariaId, status: { in: [StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] }, inicio: { gte: inicio, lte: fim } },
        include: { servico: true, pacote: true },
      }),
      this.prisma.funcionario.findMany({ where: { barbeariaId }, include: { usuario: true } }),
    ]);
    const agendamentos = todos.filter((a) => a.status === StatusAgendamento.CONCLUIDO);
    const multasCentavos = todos
      .filter((a) => a.status === StatusAgendamento.NAO_COMPARECEU)
      .reduce((soma, a) => soma + (a.valorMultaCentavos ?? 0), 0);

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

    const porServicoMap = new Map<string, { nome: string; atendimentos: number; faturamentoCentavos: number }>();
    for (const a of agendamentos) {
      const nome = a.servico?.nome ?? a.pacote?.nome ?? "Outro";
      const atual = porServicoMap.get(nome) ?? { nome, atendimentos: 0, faturamentoCentavos: 0 };
      atual.atendimentos += 1;
      atual.faturamentoCentavos += a.precoCentavos;
      porServicoMap.set(nome, atual);
    }
    const porServico = Array.from(porServicoMap.values()).sort((a, b) => b.faturamentoCentavos - a.faturamentoCentavos);

    const faturamentoConcluidosCentavos = porFuncionario.reduce((soma, f) => soma + f.faturamentoCentavos, 0);
    const comissoesCentavos = porFuncionario.reduce((soma, f) => soma + f.comissaoCentavos, 0);
    const faturamentoCentavos = faturamentoConcluidosCentavos + multasCentavos;

    return {
      periodo,
      atendimentos: agendamentos.length,
      faturamentoCentavos,
      multasCentavos,
      comissoesCentavos,
      lucroCentavos: faturamentoCentavos - comissoesCentavos,
      porFuncionario,
      porServico,
    };
  }
}
