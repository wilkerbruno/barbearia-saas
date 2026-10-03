export declare const Papel: {
    readonly CLIENTE: "CLIENTE";
    readonly FUNCIONARIO: "FUNCIONARIO";
    readonly BARBEARIA_ADMIN: "BARBEARIA_ADMIN";
    readonly SAAS_ADMIN: "SAAS_ADMIN";
};
export type Papel = (typeof Papel)[keyof typeof Papel];
export interface Endereco {
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    uf: string;
}
export interface EnderecoCampos {
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    endereco?: string | null;
}
export interface Usuario extends EnderecoCampos {
    id: string;
    nome: string;
    email: string;
    telefone?: string | null;
    papel: Papel;
    barbeariaId?: string | null;
    criadoEm: string;
}
export interface Barbearia extends EnderecoCampos {
    id: string;
    nome: string;
    slug: string;
    telefone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    logoUrl?: string | null;
    notaMedia: number;
    totalAvaliacoes: number;
    mercadoPagoPublicKey?: string | null;
    criadoEm: string;
}
export interface BarbeariaProxima extends Barbearia {
    distanciaKm: number;
    jaAgendou: boolean;
}
export type BarbeariaPublica = Pick<Barbearia, "id" | "nome" | "endereco" | "telefone" | "latitude" | "longitude" | "logoUrl" | "notaMedia" | "totalAvaliacoes" | "mercadoPagoPublicKey">;
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
        telefone?: string | null;
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
export interface AvaliacaoPendente {
    barbeariaId: string;
    nome: string;
    atendidoEm: string;
}
export declare const StatusAgendamento: {
    readonly PENDENTE: "PENDENTE";
    readonly CONFIRMADO: "CONFIRMADO";
    readonly CONCLUIDO: "CONCLUIDO";
    readonly CANCELADO: "CANCELADO";
    readonly NAO_COMPARECEU: "NAO_COMPARECEU";
};
export type StatusAgendamento = (typeof StatusAgendamento)[keyof typeof StatusAgendamento];
export declare const OrigemAgendamento: {
    readonly CLIENTE_APP: "CLIENTE_APP";
    readonly BARBEARIA_MANUAL: "BARBEARIA_MANUAL";
};
export type OrigemAgendamento = (typeof OrigemAgendamento)[keyof typeof OrigemAgendamento];
export declare const AVISO_NAO_COMPARECIMENTO = "Pol\u00EDtica de cancelamento: em caso de n\u00E3o comparecimento ao hor\u00E1rio agendado sem cancelamento pr\u00E9vio, ser\u00E1 cobrada uma multa equivalente a 50% do valor do servi\u00E7o reservado.";
export interface Agendamento {
    id: string;
    barbeariaId: string;
    clienteId?: string | null;
    clienteAvulsoNome?: string | null;
    clienteAvulsoTelefone?: string | null;
    funcionarioId: string;
    servicoId?: string | null;
    pacoteId?: string | null;
    inicio: string;
    fim: string;
    precoCentavos: number;
    status: StatusAgendamento;
    origem: OrigemAgendamento;
    criadoEm: string;
    grupoId?: string | null;
    assinaturaPacoteId?: string | null;
    valorMultaCentavos?: number | null;
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
    } | null;
    barbearia?: {
        id: string;
        nome: string;
        endereco?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        telefone?: string | null;
    } | null;
    pagamento?: {
        metodo: MetodoPagamento;
        status: StatusPagamento;
    } | null;
}
export interface AgendamentoLoteCriado {
    agendamentos: Agendamento[];
    pagamento: Pagamento | null;
    aviso: string;
}
export interface ItemAgendamentoLote {
    servicoId?: string;
    pacoteId?: string;
}
export interface CriarAgendamentoLoteInput {
    funcionarioId?: string;
    inicio: string;
    itens: ItemAgendamentoLote[];
    metodoPagamento?: MetodoPagamento;
    usarAssinaturaPacoteId?: string;
    cartaoToken?: string;
    cartaoBin?: string;
    cartaoCpf?: string;
    cartaoDeviceId?: string;
}
export interface CriarAgendamentoManualInput {
    funcionarioId: string;
    inicio: string;
    itens: ItemAgendamentoLote[];
    clienteId?: string;
    clienteAvulsoNome?: string;
    clienteAvulsoTelefone?: string;
    metodoPagamento?: MetodoPagamento;
}
export declare const MetodoPagamento: {
    readonly PIX: "PIX";
    readonly CARTAO: "CARTAO";
    readonly DINHEIRO: "DINHEIRO";
};
export type MetodoPagamento = (typeof MetodoPagamento)[keyof typeof MetodoPagamento];
export declare const StatusPagamento: {
    readonly PENDENTE: "PENDENTE";
    readonly APROVADO: "APROVADO";
    readonly RECUSADO: "RECUSADO";
    readonly ESTORNADO: "ESTORNADO";
    readonly PARCIALMENTE_ESTORNADO: "PARCIALMENTE_ESTORNADO";
};
export type StatusPagamento = (typeof StatusPagamento)[keyof typeof StatusPagamento];
export interface Pagamento {
    id: string;
    grupoId?: string | null;
    clienteId: string;
    barbeariaId: string;
    metodo: MetodoPagamento;
    status: StatusPagamento;
    valorCentavos: number;
    valorEstornadoCentavos: number;
    pixQrCodeBase64?: string | null;
    pixCopiaECola?: string | null;
    checkoutUrl?: string | null;
    desafio3dsUrl?: string | null;
    criadoEm: string;
}
export interface StatusConexaoMercadoPago {
    conectado: boolean;
    conectadoEm?: string | null;
}
export declare const StatusAssinaturaPacote: {
    readonly PENDENTE: "PENDENTE";
    readonly ATIVA: "ATIVA";
    readonly INADIMPLENTE: "INADIMPLENTE";
    readonly CANCELADA: "CANCELADA";
};
export type StatusAssinaturaPacote = (typeof StatusAssinaturaPacote)[keyof typeof StatusAssinaturaPacote];
export interface PacoteMensal {
    id: string;
    barbeariaId: string;
    nome: string;
    descricao?: string | null;
    precoCentavos: number;
    vezesPorSemana: number;
    diasSemanaPermitidos: number[];
    servicos: PacoteServicoItem[];
    ativo: boolean;
}
export interface AssinaturaPacoteCliente {
    id: string;
    pacoteMensalId: string;
    clienteId: string;
    barbeariaId: string;
    status: StatusAssinaturaPacote;
    metodoPagamento: MetodoPagamento;
    renovacaoAutomatica: boolean;
    inicioEm: string;
    proximaCobrancaEm?: string | null;
    pacoteMensal?: PacoteMensal;
    usosNaSemana?: number;
    pagamentoPendente?: Pagamento | null;
}
export interface AssinarPacoteMensalInput {
    metodoPagamento: MetodoPagamento;
    automatico?: boolean;
    cartaoToken?: string;
    cartaoBin?: string;
    cartaoCpf?: string;
    cartaoDeviceId?: string;
}
export interface AssinarPacoteMensalResultado {
    assinaturaId: string;
    automatico: boolean;
    status: "ATIVA" | "PENDENTE" | null;
    pagamento: Pagamento | null;
}
export interface ResumoFinanceiro {
    faturamentoCentavos: number;
    comissaoCentavos: number;
    comissoesCentavos?: number;
    multasCentavos: number;
    lucroCentavos: number;
    atendimentos: number;
    periodo: "hoje" | "semana" | "mes";
    porFuncionario?: Array<{
        funcionarioId: string;
        nome: string;
        faturamentoCentavos: number;
        comissaoCentavos: number;
    }>;
    porServico?: Array<{
        nome: string;
        quantidade: number;
        faturamentoCentavos: number;
    }>;
}
export declare const TipoDesconto: {
    readonly PERCENTUAL: "PERCENTUAL";
    readonly VALOR_FIXO: "VALOR_FIXO";
};
export type TipoDesconto = (typeof TipoDesconto)[keyof typeof TipoDesconto];
export declare const PeriodicidadeAssinatura: {
    readonly MENSAL: "MENSAL";
    readonly ANUAL: "ANUAL";
};
export type PeriodicidadeAssinatura = (typeof PeriodicidadeAssinatura)[keyof typeof PeriodicidadeAssinatura];
export interface Plano {
    id: string;
    nome: string;
    precoCentavos: number;
    limiteFuncionarios: number | null;
    recursos: string[];
    ativo: boolean;
    descontoAnualTipo: TipoDesconto;
    descontoAnualValor: number;
    atendimentoPrioritario: boolean;
    whatsappSuporte?: string | null;
}
export declare function calcularPrecoAnualCentavos(precoMensalCentavos: number, tipo: TipoDesconto, valor: number): number;
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
    periodicidade: PeriodicidadeAssinatura;
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
export interface PagamentoAssinatura {
    id: string;
    assinaturaId: string;
    planoId: string;
    periodicidade: PeriodicidadeAssinatura;
    metodo: MetodoPagamento;
    status: StatusPagamento;
    valorCentavos: number;
    pixQrCodeBase64?: string | null;
    pixCopiaECola?: string | null;
    desafio3dsUrl?: string | null;
    criadoEm: string;
}
export interface CartaoSalvoAssinatura {
    id: string;
    bandeira: string;
    ultimosDigitos: string;
    nomeTitular: string;
    banco: string | null;
    bin: string;
    mercadoPagoCustomerId: string;
    mercadoPagoCardId: string;
    criadoEm: string;
}
export declare function centavosParaReais(centavos: number): string;
export interface CartaoSalvo {
    id: string;
    bandeira: string;
    ultimosDigitos: string;
    nomeTitular: string;
    banco: string | null;
    bin: string;
    mercadoPagoCustomerId: string;
    mercadoPagoCardId: string;
    criadoEm: string;
}
export interface BandeiraCartao {
    paymentMethodId: string;
    nome: string;
}
export declare function identificarBandeiraLocal(numeroCartao: string): BandeiraCartao | null;
