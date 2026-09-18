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
  // Chave PÚBLICA da conta Mercado Pago da barbearia (diferente do access
  // token — essa é segura de expor ao app do cliente) — usada para
  // tokenizar o cartão direto no aparelho antes de mandar pro servidor (ver
  // CartaoScreen no app e MercadoPagoService.criarPagamentoCartao na API).
  // null/undefined = barbearia ainda não conectou o Mercado Pago.
  mercadoPagoPublicKey?: string | null;
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
  "id" | "nome" | "endereco" | "telefone" | "logoUrl" | "notaMedia" | "totalAvaliacoes" | "mercadoPagoPublicKey"
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

// Devolvida por GET /barbearias/avaliacao-pendente (ver
// BarbeariasService.buscarAvaliacaoPendente) — a barbearia mais antiga onde o
// cliente já foi atendido (horário já passou, não cancelado) e ainda não
// avaliou. É o que alimenta o popup de avaliação pós-atendimento no app (ver
// PopupAvaliacaoPendente), que aparece sozinho ao abrir/voltar pro app em vez
// de depender do cliente lembrar de ir na tela da barbearia avaliar.
export interface AvaliacaoPendente {
  barbeariaId: string;
  nome: string;
  atendidoEm: string; // ISO — horário (fim) do atendimento que liberou a avaliação
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
  // cliente em vez de pago avulso — nesse caso não existe Pagamento pra esse grupoId.
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
}

// Retorno de POST /agendamentos/lote (e POST /agendamentos, que por baixo faz
// a mesma coisa com um item só): os agendamentos criados (PENDENTE até o
// pagamento confirmar) e a cobrança gerada — a tela de pagamento usa
// `pagamento` pra mostrar o QR do Pix ou abrir o checkout do cartão.
export interface AgendamentoLoteCriado {
  agendamentos: Agendamento[];
  // null quando o lote inteiro foi coberto pela cota de uma assinatura de
  // pacote mensal (ver usarAssinaturaPacoteId/CriarAgendamentoLoteInput) — aí
  // o agendamento já nasce CONFIRMADO, sem cobrança avulsa nenhuma.
  pagamento: Pagamento | null;
  // Texto de aviso sobre a multa de não comparecimento — mesmo valor de
  // AVISO_NAO_COMPARECIMENTO, devolvido pronto pra exibir na tela de pagamento.
  aviso: string;
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
  // Só quando metodoPagamento = CARTAO: dados do cartão já tokenizado no
  // próprio app (nunca o número do cartão em si) — ver CartaoScreen e
  // MercadoPagoService.criarPagamentoCartao. O pagamento é cobrado na hora,
  // sem sair do app nem abrir navegador.
  cartaoToken?: string; // token de uso único gerado pelo SDK/API do Mercado Pago no aparelho
  cartaoBin?: string; // 6 primeiros dígitos do cartão, usados pra identificar a bandeira
  cartaoCpf?: string; // CPF do titular, exigido pelo Mercado Pago em pagamentos com cartão
  // Identificador do aparelho gerado pelo script antifraude do Mercado Pago
  // (window.MP_DEVICE_SESSION_ID via https://www.mercadopago.com/v2/security.js,
  // capturado numa WebView oculta em CartaoScreen — ver X-Meli-Session-Id em
  // MercadoPagoService.criarPagamentoCartao). Ajuda o antifraude do MP a
  // avaliar o risco da transação (histórico de rejeições "high_risk"); opcional
  // porque a coleta pode falhar/expirar sem impedir o pagamento.
  cartaoDeviceId?: string;
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
  // Cobre todos os agendamentos desse grupo (ver comentário no schema.prisma).
  grupoId?: string | null;
  clienteId: string;
  barbeariaId: string;
  metodo: MetodoPagamento;
  status: StatusPagamento;
  valorCentavos: number;
  valorEstornadoCentavos: number;
  // Pix: dados pra exibir o QR/copia-e-cola (só quando metodo=PIX e ainda PENDENTE).
  pixQrCodeBase64?: string | null;
  pixCopiaECola?: string | null;
  // Legado: link do Checkout Pro do Mercado Pago. O pagamento com cartão
  // agora é feito direto no app (formulário nativo + tokenização — ver
  // CartaoScreen/MercadoPagoService.criarPagamentoCartao), então isso fica
  // sempre null em pagamentos novos; mantido só por compatibilidade de tipo.
  checkoutUrl?: string | null;
  // Preenchida só quando metodo=CARTAO, status=PENDENTE e o Mercado Pago
  // exigiu autenticação 3DS do titular (ver MercadoPagoService, histórico de
  // set/2026 sobre pagamentos recusados como "high_risk" de cara) — o app
  // (PagamentoScreen) abre essa URL numa WebView pro cliente confirmar com o
  // próprio banco; o poll de status normal (já existente) detecta sozinho
  // quando o desafio termina (aprovado/recusado) ou expira (40 min).
  desafio3dsUrl?: string | null;
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

// Retorno de POST /pacotes-mensais/:id/assinar — o cliente precisa abrir
// `initPoint` e autorizar a cobrança recorrente com o cartão dele; a
// assinatura só vira ATIVA de verdade quando o webhook confirmar (ver
// WebhooksService/PacotesMensaisService).
export interface AssinarPacoteMensalResultado {
  initPoint: string;
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

// ============================= BANDEIRA DO CARTÃO (detecção local) =============================

// Identifica a bandeira do cartão (no mesmo vocabulário de `payment_method_id`
// que o Mercado Pago usa: "visa", "master", "elo" etc.) a partir dos
// primeiros dígitos do número — SEM depender de nenhuma chamada de rede.
//
// Por que local e não via API do Mercado Pago: até set/2026 o backend usava
// GET /v1/payment_methods/search?bin=... (ver MercadoPagoService), mas o
// próprio Mercado Pago descontinuou o filtro por BIN nesse endpoint
// ("Changes to the Payment Methods API search", anunciado 26/07/2024, com
// rollout escalonado por país até nov/2024 —
// https://www.mercadopago.com.br/developers/pt/news/2024/07/26/Changes-to-the-Payment-Methods-API-search--effective-09-09-2024).
// Confirmamos isso na prática, testando o endpoint em sandbox com 3 BINs
// diferentes (incluindo um BIN de cartão de teste OFICIAL do próprio
// Mercado Pago, 423564 = Visa): a chamada sempre devolveu a MESMA lista com
// os ~80 meios de pagamento habilitados na conta inteira, ignorando
// completamente o `bin` enviado. Era exatamente isso que causava o bug de
// produção "bandeira sempre aparece como master": o código pegava o
// primeiro resultado de crédito dessa lista genérica (que por coincidência
// é sempre um Mastercard), não o cartão que o cliente realmente digitou.
//
// A tabela abaixo é o método padrão da indústria pra esse tipo de detecção
// (o mesmo princípio de "começa com 4 = Visa" usado por qualquer gateway de
// pagamento) — funciona 100% offline e na hora, então serve tanto pro
// backend confirmar o payment_method_id antes de cobrar (ver
// MercadoPagoService.identificarBandeiraCartao) quanto pro app mostrar a
// bandeira ao cliente assim que ele digita o número, sem precisar de log
// nenhum (ver CartaoScreen).
export interface BandeiraCartao {
  paymentMethodId: string; // vocabulário do Mercado Pago: "visa", "master", "elo", "amex", "hipercard", "diners"
  nome: string; // nome de exibição
}

// BINs conhecidos da Elo — ao contrário de Visa/Master/Amex, a Elo não usa
// uma faixa simples de primeiros dígitos; essa é a lista pública de
// prefixos/faixas usada por integrações de pagamento brasileiras em geral.
const ELO_PREFIXOS_EXATOS = [
  "401178", "401179", "431274", "438935", "451416", "457393", "457631", "457632",
  "504175", "627780", "636297", "636368",
];
const ELO_FAIXAS_SEIS_DIGITOS: Array<[number, number]> = [
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

function seisDigitosNaFaixa(digitos: string, faixas: Array<[number, number]>): boolean {
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
const BINS_TESTE_MERCADOPAGO: Record<string, BandeiraCartao> = {
  "503143": { paymentMethodId: "master", nome: "Mastercard" },
  "423564": { paymentMethodId: "visa", nome: "Visa" },
};

// `numeroCartao` pode vir com espaços/máscara — só os dígitos importam, e
// bastam os 6 primeiros (BIN) pra identificar a bandeira. Devolve `null`
// enquanto não houver dígitos suficientes (ex: cliente ainda digitando) ou
// se nenhuma bandeira suportada bater — quem chamar decide o que fazer
// (no app, simplesmente não mostra nada ainda; no backend, isso vira erro
// pro cliente confirmar o número).
export function identificarBandeiraLocal(numeroCartao: string): BandeiraCartao | null {
  const digitos = numeroCartao.replace(/\D/g, "");
  if (digitos.length < 6) return null;

  const seisDigitos = digitos.slice(0, 6);
  if (BINS_TESTE_MERCADOPAGO[seisDigitos]) return BINS_TESTE_MERCADOPAGO[seisDigitos];

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
