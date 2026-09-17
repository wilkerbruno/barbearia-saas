"use strict";
// Tipos e enums compartilhados entre a API (NestJS), o app mobile (React Native)
// e o painel web do SaaS (Next.js). Mantenha isso em sincronia com
// apps/api/prisma/schema.prisma sempre que o modelo de dados mudar.
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusFatura = exports.StatusAssinatura = exports.StatusAssinaturaPacote = exports.StatusPagamento = exports.MetodoPagamento = exports.AVISO_NAO_COMPARECIMENTO = exports.OrigemAgendamento = exports.StatusAgendamento = exports.Papel = void 0;
exports.centavosParaReais = centavosParaReais;
exports.identificarBandeiraLocal = identificarBandeiraLocal;
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
    // Cliente não apareceu no horário marcado — gera multa de 50% (ver
    // valorMultaCentavos) e entra no faturamento junto com CONCLUIDO.
    NAO_COMPARECEU: "NAO_COMPARECEU",
};
// De onde veio o agendamento: pelo cliente no app (com pagamento) ou lançado
// manualmente pela própria barbearia (atendimento presencial, sem cobrança
// pelo app).
exports.OrigemAgendamento = {
    CLIENTE_APP: "CLIENTE_APP",
    BARBEARIA_MANUAL: "BARBEARIA_MANUAL",
};
// Texto padrão exibido no momento de confirmar/pagar um agendamento pelo
// app — ver AgendamentosService/telas de pagamento. Centralizado aqui pra
// não ficar cada tela com uma redação diferente.
exports.AVISO_NAO_COMPARECIMENTO = "Política de cancelamento: em caso de não comparecimento ao horário agendado sem cancelamento prévio, será cobrada uma multa equivalente a 50% do valor do serviço reservado.";
// ============================= PAGAMENTOS DO CLIENTE =============================
exports.MetodoPagamento = {
    PIX: "PIX",
    CARTAO: "CARTAO",
};
exports.StatusPagamento = {
    PENDENTE: "PENDENTE",
    APROVADO: "APROVADO",
    RECUSADO: "RECUSADO",
    ESTORNADO: "ESTORNADO",
    PARCIALMENTE_ESTORNADO: "PARCIALMENTE_ESTORNADO",
};
// ============================= PACOTES MENSAIS =============================
exports.StatusAssinaturaPacote = {
    PENDENTE: "PENDENTE",
    ATIVA: "ATIVA",
    INADIMPLENTE: "INADIMPLENTE",
    CANCELADA: "CANCELADA",
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
// BINs conhecidos da Elo — ao contrário de Visa/Master/Amex, a Elo não usa
// uma faixa simples de primeiros dígitos; essa é a lista pública de
// prefixos/faixas usada por integrações de pagamento brasileiras em geral.
const ELO_PREFIXOS_EXATOS = [
    "401178", "401179", "431274", "438935", "451416", "457393", "457631", "457632",
    "504175", "627780", "636297", "636368",
];
const ELO_FAIXAS_SEIS_DIGITOS = [
    [506699, 506778],
    [509000, 509999],
    [650031, 650033],
    [650035, 650051],
    [650405, 650439],
    [650485, 650538],
    [650541, 650598],
    [650700, 650718],
    [650720, 650727],
    [650901, 650920],
    [651652, 651679],
    [655000, 655019],
    [655021, 655058],
];
function seisDigitosNaFaixa(digitos, faixas) {
    const seis = Number(digitos.slice(0, 6));
    return faixas.some(([inicio, fim]) => seis >= inicio && seis <= fim);
}
// Os cartões de TESTE oficiais que o próprio Mercado Pago publica pro
// sandbox (ex: "5031 4332 1540 6351" pra Mastercard) usam BINs fictícios que
// não seguem as faixas reais das bandeiras (503... nunca foi emitido como
// Mastercard de verdade) — só servem pra simular uma cobrança, nunca tocam
// numa rede de cartão real. Sem esse caso especial, a tabela de faixas reais
// abaixo (correta pra qualquer cartão real de cliente, que é o que importa
// em produção) devolveria "não reconhecida" pra esses cartões de teste,
// dando a impressão de bug ao testar em sandbox.
const BINS_TESTE_MERCADOPAGO = {
    "503143": { paymentMethodId: "master", nome: "Mastercard" },
    "423564": { paymentMethodId: "visa", nome: "Visa" },
};
// `numeroCartao` pode vir com espaços/máscara — só os dígitos importam, e
// bastam os 6 primeiros (BIN) pra identificar a bandeira. Devolve `null`
// enquanto não houver dígitos suficientes (ex: cliente ainda digitando) ou
// se nenhuma bandeira suportada bater — quem chamar decide o que fazer
// (no app, simplesmente não mostra nada ainda; no backend, isso vira erro
// pro cliente confirmar o número).
function identificarBandeiraLocal(numeroCartao) {
    const digitos = numeroCartao.replace(/\D/g, "");
    if (digitos.length < 6)
        return null;
    const seisDigitos = digitos.slice(0, 6);
    if (BINS_TESTE_MERCADOPAGO[seisDigitos])
        return BINS_TESTE_MERCADOPAGO[seisDigitos];
    const doisDigitos = digitos.slice(0, 2);
    const tresDigitos = Number(digitos.slice(0, 3));
    const quatroDigitos = digitos.slice(0, 4);
    const quatroNum = Number(quatroDigitos);
    const doisNum = Number(doisDigitos);
    // Elo primeiro: alguns prefixos dela (ex: 627780) começam com dígitos que
    // também aparecem em faixas de outras bandeiras, então precisa ser checado
    // antes das demais.
    if (ELO_PREFIXOS_EXATOS.some((p) => digitos.startsWith(p)) || seisDigitosNaFaixa(digitos, ELO_FAIXAS_SEIS_DIGITOS)) {
        return { paymentMethodId: "elo", nome: "Elo" };
    }
    // Hipercard antes de Diners/Amex porque "3841" cairia na faixa genérica de
    // Diners (38) se checado depois.
    if (digitos.slice(0, 6) === "606282" || quatroDigitos === "3841") {
        return { paymentMethodId: "hipercard", nome: "Hipercard" };
    }
    if (doisDigitos === "34" || doisDigitos === "37") {
        return { paymentMethodId: "amex", nome: "American Express" };
    }
    if (doisDigitos === "36" || doisDigitos === "38" || doisDigitos === "39" || (tresDigitos >= 300 && tresDigitos <= 305)) {
        return { paymentMethodId: "diners", nome: "Diners Club" };
    }
    if ((doisNum >= 51 && doisNum <= 55) || (quatroNum >= 2221 && quatroNum <= 2720)) {
        return { paymentMethodId: "master", nome: "Mastercard" };
    }
    if (digitos.startsWith("4")) {
        return { paymentMethodId: "visa", nome: "Visa" };
    }
    return null;
}
