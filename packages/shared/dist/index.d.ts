export declare const Papel: {
    readonly CLIENTE: "CLIENTE";
    readonly FUNCIONARIO: "FUNCIONARIO";
    readonly BARBEARIA_ADMIN: "BARBEARIA_ADMIN";
    readonly SAAS_ADMIN: "SAAS_ADMIN";
};
export type Papel = (typeof Papel)[keyof typeof Papel];
export interface Usuario {
    id: string;
    nome: string;
    email: string;
    telefone?: string | null;
    papel: Papel;
    barbeariaId?: string | null;
    criadoEm: string;
}
export interface Barbearia {
    id: string;
    nome: string;
    slug: string;
    endereco?: string | null;
    telefone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    logoUrl?: string | null;
    notaMedia: number;
    totalAvaliacoes: number;
    criadoEm: string;
}
export interface BarbeariaProxima extends Barbearia {
    distanciaKm: number;
}
export type BarbeariaPublica = Pick<Barbearia, "id" | "nome" | "endereco" | "telefone" | "logoUrl" | "notaMedia" | "totalAvaliacoes">;
export interface Servico {
    id: string;
    barbeariaId: string;
    nome: string;
    descricao?: string | null;
    duracaoMinutos: number;
    precoCentavos: number;
    ativo: boolean;
}
export interface PacoteServicoItem {
    servicoId: string;
    servico: Servico;
}
export interface Pacote {
    id: string;
    barbeariaId: string;
    nome: string;
    descricao?: string | null;
    precoCentavos: number;
    servicos: PacoteServicoItem[];
    ativo: boolean;
}
export interface FuncionarioPublico {
    id: string;
    cargo: string;
    usuario: {
        id: string;
        nome: string;
    };
}
export interface FuncionarioDetalhado {
    id: string;
    cargo: string;
    comissaoPercentual: number;
    ativo: boolean;
    disponivel: boolean;
    usuario: {
        id: string;
        nome: string;
        email: string;
    };
}
export interface HorarioTrabalho {
    id: string;
    funcionarioId: string;
    diaSemana: number;
    horaInicio: string;
    horaFim: string;
    inicioAlmoco?: string | null;
    fimAlmoco?: string | null;
}
export interface DefinirHorarioTrabalho {
    diaSemana: number;
    horaInicio: string;
    horaFim: string;
    inicioAlmoco?: string;
    fimAlmoco?: string;
}
export interface Folga {
    id: string;
    funcionarioId: string;
    inicio: string;
    fim: string;
    motivo?: string | null;
}
export interface Avaliacao {
    id: string;
    barbeariaId: string;
    clienteId: string;
    nota: number;
    comentario?: string | null;
    criadoEm: string;
}
export declare const StatusAgendamento: {
    readonly PENDENTE: "PENDENTE";
    readonly CONFIRMADO: "CONFIRMADO";
    readonly CONCLUIDO: "CONCLUIDO";
    readonly CANCELADO: "CANCELADO";
};
export type StatusAgendamento = (typeof StatusAgendamento)[keyof typeof StatusAgendamento];
export interface Agendamento {
    id: string;
    barbeariaId: string;
    clienteId: string;
    funcionarioId: string;
    servicoId?: string | null;
    pacoteId?: string | null;
    inicio: string;
    fim: string;
    precoCentavos: number;
    status: StatusAgendamento;
    criadoEm: string;
    grupoId?: string | null;
    servico?: Pick<Servico, "id" | "nome" | "duracaoMinutos" | "precoCentavos"> | null;
    pacote?: Pick<Pacote, "id" | "nome" | "precoCentavos"> | null;
    funcionario?: {
        id: string;
        cargo: string;
        usuario: {
            id: string;
            nome: string;
        };
    };
    cliente?: {
        id: string;
        nome: string;
        telefone?: string | null;
    };
}
export interface ItemAgendamentoLote {
    servicoId?: string;
    pacoteId?: string;
}
export interface CriarAgendamentoLoteInput {
    funcionarioId?: string;
    inicio: string;
    itens: ItemAgendamentoLote[];
}
export interface ResumoFinanceiro {
    faturamentoCentavos: number;
    comissaoCentavos: number;
    lucroCentavos: number;
    atendimentos: number;
    periodo: "hoje" | "semana" | "mes";
}
export interface Plano {
    id: string;
    nome: string;
    precoCentavos: number;
    limiteFuncionarios: number | null;
    recursos: string[];
    ativo: boolean;
}
export declare const StatusAssinatura: {
    readonly TRIAL: "TRIAL";
    readonly ATIVA: "ATIVA";
    readonly INADIMPLENTE: "INADIMPLENTE";
    readonly CANCELADA: "CANCELADA";
};
export type StatusAssinatura = (typeof StatusAssinatura)[keyof typeof StatusAssinatura];
export interface Assinatura {
    id: string;
    barbeariaId: string;
    planoId: string;
    status: StatusAssinatura;
    inicioEm: string;
    proximaCobrancaEm: string | null;
}
export declare const StatusFatura: {
    readonly PAGA: "PAGA";
    readonly PENDENTE: "PENDENTE";
    readonly ATRASADA: "ATRASADA";
};
export type StatusFatura = (typeof StatusFatura)[keyof typeof StatusFatura];
export interface Fatura {
    id: string;
    assinaturaId: string;
    barbeariaId: string;
    valorCentavos: number;
    vencimentoEm: string;
    status: StatusFatura;
    metodoPagamento?: string | null;
}
export declare function centavosParaReais(centavos: number): string;
