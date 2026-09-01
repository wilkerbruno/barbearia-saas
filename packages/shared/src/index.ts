// Tipos e enums compartilhados entre a API (NestJS), o app mobile (React Native)
// e o painel web do SaaS (Next.js). Mantenha isso em sincronia com
// apps/api/prisma/schema.prisma sempre que o modelo de dados mudar.

// ============================= PAPÉIS (RBAC) =============================

export enum Papel {
  CLIENTE = "CLIENTE",
  FUNCIONARIO = "FUNCIONARIO",
  BARBEARIA_ADMIN = "BARBEARIA_ADMIN", // dono/gestor da barbearia
  SAAS_ADMIN = "SAAS_ADMIN", // administrador da plataforma (dono do SaaS)
}

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
  criadoEm: string;
}

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

export interface Pacote {
  id: string;
  barbeariaId: string;
  nome: string;
  descricao?: string | null;
  precoCentavos: number;
  servicoIds: string[];
  ativo: boolean;
}

// Retorno público de GET /barbearias/:id/funcionarios (passo "escolher profissional").
export interface FuncionarioPublico {
  id: string;
  cargo: string;
  usuario: { id: string; nome: string };
}

// ============================= AGENDAMENTOS =============================

export enum StatusAgendamento {
  PENDENTE = "PENDENTE",
  CONFIRMADO = "CONFIRMADO",
  CONCLUIDO = "CONCLUIDO",
  CANCELADO = "CANCELADO",
}

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

export enum StatusAssinatura {
  TRIAL = "TRIAL",
  ATIVA = "ATIVA",
  INADIMPLENTE = "INADIMPLENTE",
  CANCELADA = "CANCELADA",
}

export interface Assinatura {
  id: string;
  barbeariaId: string;
  planoId: string;
  status: StatusAssinatura;
  inicioEm: string;
  proximaCobrancaEm: string | null;
}

export enum StatusFatura {
  PAGA = "PAGA",
  PENDENTE = "PENDENTE",
  ATRASADA = "ATRASADA",
}

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
