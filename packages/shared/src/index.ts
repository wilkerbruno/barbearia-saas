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
} as const;
export type StatusAgendamento = (typeof StatusAgendamento)[keyof typeof StatusAgendamento];

export interface Agendamento {
  id: string;
  barbeariaId: string;
  clienteId: string;
  funcionarioId: string;
  servicoId?: string | null;
  pacoteId?: string | null;
  inicio: string; // ISO datetime
  fim: string; // ISO datetime
  precoCentavos: number;
  status: StatusAgendamento;
  criadoEm: string;
  // Agrupa vários serviços marcados juntos no mesmo horário (ver schema.prisma).
  // Agendamentos antigos (de antes dessa funcionalidade) têm isso null.
  grupoId?: string | null;
  // A API sempre devolve esses relacionamentos populados via `include` (ver
  // AgendamentosService) — opcionais aqui só porque nem toda rota inclui todos
  // (ex: listarAgendaFuncionario não inclui `funcionario`, já que é o próprio).
  servico?: Pick<Servico, "id" | "nome" | "duracaoMinutos" | "precoCentavos"> | null;
  pacote?: Pick<Pacote, "id" | "nome" | "precoCentavos"> | null;
  funcionario?: { id: string; cargo: string; usuario: { id: string; nome: string } };
  cliente?: { id: string; nome: string; telefone?: string | null };
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
}

// ============================= FINANCEIRO =============================

// Percentual de comissão do funcionário sobre cada atendimento concluído.
// Guardado na relação Funcionario (ver Prisma) — aqui só o resumo agregado.
export interface ResumoFinanceiro {
  faturamentoCentavos: number;
  comissaoCentavos: number;
  lucroCentavos: number; // só relevante no resumo da barbearia (faturamento - comissões)
  atendimentos: number;
  periodo: "hoje" | "semana" | "mes";
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
