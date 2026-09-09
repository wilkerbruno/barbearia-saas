"use strict";
// Tipos e enums compartilhados entre a API (NestJS), o app mobile (React Native)
// e o painel web do SaaS (Next.js). Mantenha isso em sincronia com
// apps/api/prisma/schema.prisma sempre que o modelo de dados mudar.
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusFatura = exports.StatusAssinatura = exports.StatusAgendamento = exports.Papel = void 0;
exports.centavosParaReais = centavosParaReais;
// ============================= PAPÉIS (RBAC) =============================
// Não usamos `enum` (TypeScript) aqui de propósito: um `enum` é um tipo
// "nominal" — o TypeScript não aceita a string equivalente vinda de outro
// lugar (por exemplo, o enum que o Prisma gera a partir do schema.prisma)
// mesmo que o valor seja idêntico ("CLIENTE" === "CLIENTE"), o que quebra a
// build da API bem na hora do deploy. Esse padrão (objeto `as const` + tipo
// derivado) se comporta igual a um enum no dia a dia (`Papel.CLIENTE`,
// `Papel[]` etc.) mas é só uma união de strings por baixo, então é
// compatível com o tipo que o Prisma gera.
exports.Papel = {
    CLIENTE: "CLIENTE",
    FUNCIONARIO: "FUNCIONARIO",
    BARBEARIA_ADMIN: "BARBEARIA_ADMIN", // dono/gestor da barbearia
    SAAS_ADMIN: "SAAS_ADMIN", // administrador da plataforma (dono do SaaS)
};
// ============================= AGENDAMENTOS =============================
// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
exports.StatusAgendamento = {
    PENDENTE: "PENDENTE",
    CONFIRMADO: "CONFIRMADO",
    CONCLUIDO: "CONCLUIDO",
    CANCELADO: "CANCELADO",
};
// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
exports.StatusAssinatura = {
    TRIAL: "TRIAL",
    ATIVA: "ATIVA",
    INADIMPLENTE: "INADIMPLENTE",
    CANCELADA: "CANCELADA",
};
// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
exports.StatusFatura = {
    PAGA: "PAGA",
    PENDENTE: "PENDENTE",
    ATRASADA: "ATRASADA",
};
// ============================= HELPERS =============================
function centavosParaReais(centavos) {
    return (centavos / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
}
