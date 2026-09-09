// Tipos e enums compartilhados entre a API (NestJS), o app mobile (React Native)
// e o painel web do SaaS (Next.js). Mantenha isso em sincronia com
// apps/api/prisma/schema.prisma sempre que o modelo de dados mudar.

// ============================= PAPÉIS (RBAC) =============================

// Não usamos `enum` (TypeScript) aqui de propósito: um `enum` é um tipo
// "nominal" — o TypeScript não aceita a string equivalente vinda de outro
// lugar (por exemplo, o enum que o Prisma gera a partir do schema.prisma)
// mesmo que o valor seja idêntico ("CLIENTE" === "CLIENTE"), o que quebra a
// build da API bem na hora do deploy. Esse padrão (objeto `as const` + tipo
// derivado) se comporta igual a um enum no dia a dia (`Papel.CLIENTE`,
// `Papel[]` etc.) mas é só uma união de strings por baixo, então é
// compatível com o tipo que o Prisma gera.
export const Papel = {
  CLIENTE: "CLIENTE",
  FUNCIONARIO: "FUNCIONARIO",
  BARBEARIA_ADMIN: "BARBEARIA_ADMIN", // dono/gestor da barbearia
  SAAS_ADMIN: "SAAS_ADMIN", // administrador da plataforma (dono do SaaS)
} as const;
export type Papel = (typeof Papel)[keyof typeof Papel];

// ============================= USUÁRIO =============================

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  papel: Papel;
  barbeariaId?: string | null; // null para CLIENTE (pode agendar em várias) e SAAS_ADMIN
  criadoEm: string;
}

// ============================= BARBEARIA (TENANT) =============================

export interface Barbearia {
  id: string;
  nome: string;
  slug: string;
  endereco?: string | null;
  telefone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // Data URL (base64) da logo, já redimensionada pela API — ver
  // BarbeariasService.atualizarLogo. null/undefined = sem logo enviada ainda.
  logoUrl?: string | null;
  notaMedia: number;
  totalAvaliacoes: number;
  criadoEm: string;
}

// Retorno de GET /barbearias/proximas — Barbearia + distância calculada a
// partir da localização atual do cliente (ver BarbeariasService.listarProximas).
export interface BarbeariaProxima extends Barbearia {
  distanciaKm: number;
  jaAgendou: boolean; // o cliente logado já teve algum agendamento nessa barbearia
}

// Retorno público de GET /barbearias/:id/publico (usado pela Home do cliente,
// que não tem permissão pra ler a barbearia inteira via GET /barbearias/:id).
export type BarbeariaPublica = Pick<
  Barbearia,
  "id" | "nome" | "endereco" | "telefone" | "logoUrl" | "notaMedia" | "totalAvaliacoes"
>;

// ============================= SERVIÇOS E PACOTES =============================

export interface Servico {
  id: string;
  barbeariaId: string;
  nome: string;
  descricao?: string | null;
  duracaoMinutos: number;
  precoCentavos: number;
  ativo: boolean;
}

// Um serviço incluído num pacote, com o serviço já populado — é assim que a
// API sempre devolve um Pacote (list/create/update), nunca como servicoIds
// soltos (esse formato flat é só o formato de ENTRADA do create/update, ver
// CreatePacoteDto na API).
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

// Retorno público de GET /barbearias/:id/funcionarios (passo "escolher profissional").
export interface FuncionarioPublico {
  id: string;
  cargo: string;
  usuario: { id: string; nome: string };
}

// ============================= EQUIPE (GESTÃO) =============================

// Retorno de GET /funcionarios (visão do BARBEARIA_ADMIN sobre a própria equipe).
export interface FuncionarioDetalhado {
  id: string;
  cargo: string;
  comissaoPercentual: number;
  ativo: boolean;
  disponivel: boolean;
  usuario: { id: string; nome: string; email: string };
}

// Horário de trabalho de um dia da semana (diaSemana: 0=domingo ... 6=sábado,
// igual ao Date.getDay() do JS). Sem uma linha pra um dia = não trabalha nesse dia.
export interface HorarioTrabalho {
  id: string;
  funcionarioId: string;
  diaSemana: number;
  horaInicio: string; // "HH:mm"
  horaFim: string; // "HH:mm"
  inicioAlmoco?: string | null;
  fimAlmoco?: string | null;
}

// Corpo de PUT /funcionarios/meus-horarios — substitui a semana inteira de uma vez.
export interface DefinirHorarioTrabalho {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  inicioAlmoco?: string;
  fimAlmoco?: string;
}

// Bloqueio pontual de agenda (folga, consulta, férias etc).
export interface Folga {
  id: string;
  funcionarioId: string;
  inicio: string; // ISO datetime
  fim: string; // ISO datetime
  motivo?: string | null;
}

// ============================= AVALIAÇÕES (ESTRELAS) =============================

export interface Avaliacao {
  id: string;
  barbeariaId: string;
  clienteId: string;
  nota: number; // 1 a 5
  comentario?: string | null;
  criadoEm: string;
}

// ============================= AGENDAMENTOS =============================

// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
export const StatusAgendamento = {
  PENDENTE: "PENDENTE",
  CONFIRMADO: "CONFIRMADO",
  CONCLUIDO: "CONCLUIDO",
  CANCELADO: "CANCELADO",
  // Cliente não apareceu no horário marcado — gera multa de 50% (ver
  // valorMultaCentavos) e entra no faturamento junto com CONCLUIDO.
  NAO_COMPARECEU: "NAO_COMPARECEU",
} as const;
export type StatusAgendamento = (typeof StatusAgendamento)[keyof typeof StatusAgendamento];

// De onde veio o agendamento: pelo cliente no app (com pagamento) ou lançado
// manualmente pela própria barbearia (atendimento presencial, sem cobrança
// pelo app).
export const OrigemAgendamento = {
  CLIENTE_APP: "CLIENTE_APP",
  BARBEARIA_MANUAL: "BARBEARIA_MANUAL",
} as const;
export type OrigemAgendamento = (typeof OrigemAgendamento)[keyof typeof OrigemAgendamento];

// Texto padrão exibido no momento de confirmar/pagar um agendamento pelo
// app — ver AgendamentosService/telas de pagamento. Centralizado aqui pra
// não ficar cada tela com uma redação diferente.
export const AVISO_NAO_COMPARECIMENTO =
  "Política de cancelamento: em caso de não comparecimento ao horário agendado sem cancelamento prévio, será cobrada uma multa equivalente a 50% do valor do serviço reservado.";

export interface Agendamento {
  id: string;
  barbeariaId: string;
  // null quando é um cliente avulso lançado manualmente pela barbearia (ver
  // clienteAvulsoNome/clienteAvulsoTelefone e origem).
  clienteId?: string | null;
  clienteAvulsoNome?: string | null;
  clienteAvulsoTelefone?: string | null;
  funcionarioId: string;
  servicoId?: string | null;
  pacoteId?: string | null;
  inicio: string; // ISO datetime
  fim: string; // ISO datetime
  precoCentavos: number;
  status: StatusAgendamento;
  origem: OrigemAgendamento;
  criadoEm: string;
  // Agrupa vários serviços marcados juntos no mesmo horário (ver schema.prisma).
  // Agendamentos antigos (de antes dessa funcionalidade) têm isso null.
  grupoId?: string | null;
  // Preenchido quando o horário foi usado pela cota do pacote mensal do
  // cliente em vez de pago avulso — nesse caso `pagamento` fica null.
  assinaturaPacoteId?: string | null;
  // Só quando status = NAO_COMPARECEU: os 50% retidos como multa.
  valorMultaCentavos?: number | null;
  // A API sempre devolve esses relacionamentos populados via `include` (ver
  // AgendamentosService) — opcionais aqui só porque nem toda rota inclui todos
  // (ex: listarAgendaFuncionario não inclui `funcionario`, já que é o próprio).
  servico?: Pick<Servico, "id" | "nome" | "duracaoMinutos" | "precoCentavos"> | null;
  pacote?: Pick<Pacote, "id" | "nome" | "precoCentavos"> | null;
  funcionario?: { id: string; cargo: string; usuario: { id: string; nome: string } };
  cliente?: { id: string; nome: string; telefone?: string | null } | null;
  pagamento?: Pagamento | null;
}

// Corpo de POST /agendamentos/lote — o cliente pode marcar vários serviços
// (inclusive repetidos, ex: 2x corte pra pai e filho) num único horário,
// feitos em sequência pelo mesmo profissional a partir de "inicio".
export interface ItemAgendamentoLote {
  servicoId?: string;
  pacoteId?: string;
}

export interface CriarAgendamentoLoteInput {
  funcionarioId?: string; // se omitido, o servidor escolhe qualquer profissional livre
  inicio: string; // ISO datetime
  itens: ItemAgendamentoLote[];
  // Como pagar por esse lote: PIX/CARTAO gera uma cobrança avulsa (ver
  // Pagamento); se omitido e o cliente tiver uma assinatura de pacote mensal
  // ativa que cubra os itens (mesmos serviços, dia da semana permitido, cota
  // não esgotada), o servidor usa a cota do pacote em vez de cobrar — ver
  // usarAssinaturaPacoteId pra forçar/escolher qual assinatura usar.
  metodoPagamento?: MetodoPagamento;
  usarAssinaturaPacoteId?: string;
}

// Corpo de POST /agendamentos/manual (lançado pela própria barbearia — ver
// OrigemAgendamento.BARBEARIA_MANUAL). Não passa por pagamento pelo app.
export interface CriarAgendamentoManualInput {
  funcionarioId: string;
  inicio: string;
  itens: ItemAgendamentoLote[];
  clienteId?: string; // cliente já cadastrado no app
  clienteAvulsoNome?: string; // OU nome/telefone de alguém sem conta
  clienteAvulsoTelefone?: string;
}

// ============================= PAGAMENTOS DO CLIENTE =============================

export const MetodoPagamento = {
  PIX: "PIX",
  CARTAO: "CARTAO",
} as const;
export type MetodoPagamento = (typeof MetodoPagamento)[keyof typeof MetodoPagamento];

export const StatusPagamento = {
  PENDENTE: "PENDENTE",
  APROVADO: "APROVADO",
  RECUSADO: "RECUSADO",
  ESTORNADO: "ESTORNADO",
  PARCIALMENTE_ESTORNADO: "PARCIALMENTE_ESTORNADO",
} as const;
export type StatusPagamento = (typeof StatusPagamento)[keyof typeof StatusPagamento];

export interface Pagamento {
  id: string;
  agendamentoId?: string | null;
  clienteId: string;
  barbeariaId: string;
  metodo: MetodoPagamento;
  status: StatusPagamento;
  valorCentavos: number;
  valorEstornadoCentavos: number;
  // Pix: dados pra exibir o QR/copia-e-cola (só quando metodo=PIX e ainda PENDENTE).
  pixQrCodeBase64?: string | null;
  pixCopiaECola?: string | null;
  // Cartão via Checkout Pro: link pra abrir o checkout hospedado do Mercado
  // Pago (só quando metodo=CARTAO e ainda PENDENTE).
  checkoutUrl?: string | null;
  criadoEm: string;
}

// Status da conexão da barbearia com sua própria conta Mercado Pago (modelo
// marketplace — ver Barbearia.mercadoPagoAccessToken no schema). O cliente só
// consegue pagar um agendamento se a barbearia estiver conectada.
export interface StatusConexaoMercadoPago {
  conectado: boolean;
  conectadoEm?: string | null;
}

// ============================= PACOTES MENSAIS =============================

export const StatusAssinaturaPacote = {
  PENDENTE: "PENDENTE",
  ATIVA: "ATIVA",
  INADIMPLENTE: "INADIMPLENTE",
  CANCELADA: "CANCELADA",
} as const;
export type StatusAssinaturaPacote = (typeof StatusAssinaturaPacote)[keyof typeof StatusAssinaturaPacote];

export interface PacoteMensal {
  id: string;
  barbeariaId: string;
  nome: string;
  descricao?: string | null;
  precoCentavos: number;
  vezesPorSemana: number;
  diasSemanaPermitidos: number[]; // 0=domingo ... 6=sábado
  servicos: PacoteServicoItem[];
  ativo: boolean;
}

export interface AssinaturaPacoteCliente {
  id: string;
  pacoteMensalId: string;
  clienteId: string;
  barbeariaId: string;
  status: StatusAssinaturaPacote;
  inicioEm: string;
  proximaCobrancaEm?: string | null;
  pacoteMensal?: PacoteMensal;
  // Quantas vezes já usou o pacote na semana corrente (ver
  // PacotesMensaisService) — usado pra mostrar "2 de 3 usos essa semana".
  usosNaSemana?: number;
}

// ============================= FINANCEIRO =============================

// Percentual de comissão do funcionário sobre cada atendimento concluído.
// Guardado na relação Funcionario (ver Prisma) — aqui só o resumo agregado.
// atendimentos conta só CONCLUIDO; faturamentoCentavos inclui também a multa
// retida (50%) de agendamentos NAO_COMPARECEU — ver multasCentavos.
export interface ResumoFinanceiro {
  faturamentoCentavos: number;
  comissaoCentavos: number;
  comissoesCentavos?: number; // alguns endpoints (resumo da barbearia) usam o plural — ver FinanceiroService
  multasCentavos: number; // parte do faturamentoCentavos vinda de não comparecimentos
  lucroCentavos: number; // só relevante no resumo da barbearia (faturamento - comissões)
  atendimentos: number;
  periodo: "hoje" | "semana" | "mes";
  porFuncionario?: Array<{ funcionarioId: string; nome: string; faturamentoCentavos: number; comissaoCentavos: number }>;
  porServico?: Array<{ nome: string; quantidade: number; faturamentoCentavos: number }>;
}

// ============================= PLANOS E ASSINATURA DO SAAS =============================

export interface Plano {
  id: string;
  nome: string;
  precoCentavos: number;
  limiteFuncionarios: number | null; // null = ilimitado
  recursos: string[];
  ativo: boolean;
}

// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
export const StatusAssinatura = {
  TRIAL: "TRIAL",
  ATIVA: "ATIVA",
  INADIMPLENTE: "INADIMPLENTE",
  CANCELADA: "CANCELADA",
} as const;
export type StatusAssinatura = (typeof StatusAssinatura)[keyof typeof StatusAssinatura];

export interface Assinatura {
  id: string;
  barbeariaId: string;
  planoId: string;
  status: StatusAssinatura;
  inicioEm: string;
  proximaCobrancaEm: string | null;
}

// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
export const StatusFatura = {
  PAGA: "PAGA",
  PENDENTE: "PENDENTE",
  ATRASADA: "ATRASADA",
} as const;
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

// ============================= HELPERS =============================

export function centavosParaReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
