import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";

const MP_API_URL = "https://api.mercadopago.com";
const MP_AUTH_URL = "https://auth.mercadopago.com";

export interface PreapprovalCriado {
  id: string;
  initPoint: string;
  status: string;
}

export interface PreapprovalDetalhe {
  id: string;
  status: string;
  externalReference: string | null;
  nextPaymentDate: string | null;
}

export interface AuthorizedPaymentDetalhe {
  id: string;
  preapprovalId: string | null;
  externalReference: string | null;
  paymentId: string | null;
}

export interface PaymentDetalhe {
  id: string;
  status: string;
  externalReference: string | null;
  transactionAmountCentavos: number;
  metodoPagamento: string | null;
  dataAprovacao: string | null;
  dataCriacao: string;
}

export interface PixCriado {
  id: string;
  status: string;
  qrCodeBase64: string | null;
  qrCode: string | null;
}

export interface CheckoutPreferenceCriada {
  id: string;
  initPoint: string;
}

export interface CartaoPagamentoCriado {
  id: string;
  status: string;
  // Motivo detalhado quando recusado (ex: "cc_rejected_insufficient_amount")
  // — ver traduzirMotivoRecusaCartao em AgendamentosService.
  statusDetail: string | null;
}

export interface TokensOAuth {
  accessToken: string;
  refreshToken: string | null;
  publicKey: string | null;
  userId: string;
  expiraEm: Date;
}

// Integração com o Mercado Pago. Serve DOIS fluxos de dinheiro bem diferentes
// — não confundir:
//
// 1) Cobrar a MENSALIDADE DO SAAS das barbearias assinantes, pra conta da
//    própria Divisions Tech (ver AssinaturasService) — usa o access token
//    "de plataforma" (MERCADOPAGO_ACCESS_TOKEN), API de Preapproval.
//
// 2) Cobrar o CLIENTE FINAL em nome da barbearia (modelo marketplace/Connect
//    — ver AgendamentosService, PacotesMensaisService, BarbeariasMercadoPagoService):
//    cada barbearia autoriza a própria conta via OAuth (gerarUrlAutorizacao/
//    trocarCodigoPorToken), e as chamadas de pagamento usam o access token
//    DAQUELA barbearia (accessTokenOverride) — o dinheiro cai direto lá, não
//    passa pela conta da Divisions Tech.
//
// Documentação oficial: https://www.mercadopago.com.br/developers/pt/docs/subscriptions
// e https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview
// e https://www.mercadopago.com.br/developers/pt/docs/security/oauth/introduction
@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  get configurado(): boolean {
    return !!this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN");
  }

  get oauthConfigurado(): boolean {
    return !!this.config.get<string>("MERCADOPAGO_CLIENT_ID") && !!this.config.get<string>("MERCADOPAGO_CLIENT_SECRET");
  }

  // Chave pública usada pra TOKENIZAR o cartão no aparelho do cliente (ver
  // CartaoScreen) — é a chave da própria APLICAÇÃO (marketplace), não da
  // conta conectada de cada barbearia. Tokenização não é específica de quem
  // vai receber o dinheiro (isso só é decidido depois, na hora de criar o
  // pagamento com o access token DAQUELA barbearia — ver criarPagamentoCartao)
  // — e, na prática, o Mercado Pago nem sempre devolve um public_key no OAuth
  // de contas conectadas novas/sem credenciais geradas (ver trocarCodigoPorToken),
  // então usar a chave da aplicação evita depender disso.
  get publicKeyPlataforma(): string | null {
    return this.config.get<string>("MERCADOPAGO_PUBLIC_KEY") ?? null;
  }

  private get accessToken(): string {
    const token = this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN");
    if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
    return token;
  }

  private async chamar<T>(path: string, init?: RequestInit, accessTokenOverride?: string): Promise<T> {
    const resposta = await fetch(`${MP_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessTokenOverride ?? this.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const corpo: any = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      this.logger.error(`Mercado Pago ${init?.method ?? "GET"} ${path} -> ${resposta.status}: ${JSON.stringify(corpo)}`);
      // O Mercado Pago manda o motivo certo em `cause[0].description` (ex:
      // "cpf invalid", "Invalid parameter identification.number") ou, às
      // vezes, só em `message` — sobe esse texto pra quem chamou em vez de um
      // erro genérico, senão o cliente final nunca sabe o que corrigir (ver
      // AgendamentosService.criarLote, que repassa BadRequestException como
      // veio em vez de mascarar tudo com uma mensagem só).
      const detalhe = corpo?.cause?.[0]?.description || corpo?.message || null;
      throw new BadRequestException(
        detalhe
          ? `O Mercado Pago recusou a operação: ${detalhe}`
          : `Falha ao comunicar com o Mercado Pago (HTTP ${resposta.status}).`,
      );
    }
    return corpo as T;
  }

  // ============================= OAUTH (conta da barbearia) =============================

  // URL pra abrir no navegador do dono da barbearia — ele loga na PRÓPRIA
  // conta Mercado Pago e autoriza. `state` deve conter algo que identifique
  // a barbearia de volta no callback (ver BarbeariasMercadoPagoService, que
  // usa um token assinado em vez do id cru, pra ninguém conseguir conectar a
  // conta de outra barbearia adivinhando o id).
  gerarUrlAutorizacao(state: string): string {
    const clientId = this.config.get<string>("MERCADOPAGO_CLIENT_ID");
    const redirectUri = this.config.get<string>("MERCADOPAGO_OAUTH_REDIRECT_URI");
    if (!clientId || !redirectUri) {
      throw new BadRequestException("Conexão com Mercado Pago ainda não configurada nesta instalação. Fale com o suporte.");
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      platform_id: "mp",
      redirect_uri: redirectUri,
      state,
    });
    return `${MP_AUTH_URL}/authorization?${params.toString()}`;
  }

  // Troca o "code" que o Mercado Pago devolveu no redirect por um access
  // token de verdade da conta da barbearia. Chamada uma vez, no callback.
  async trocarCodigoPorToken(code: string): Promise<TokensOAuth> {
    const clientId = this.config.get<string>("MERCADOPAGO_CLIENT_ID");
    const clientSecret = this.config.get<string>("MERCADOPAGO_CLIENT_SECRET");
    const redirectUri = this.config.get<string>("MERCADOPAGO_OAUTH_REDIRECT_URI");
    const resposta = await fetch(`${MP_API_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const corpo: any = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      this.logger.error(`Falha ao trocar code por token no Mercado Pago: ${resposta.status} ${JSON.stringify(corpo)}`);
      throw new BadRequestException("Não foi possível concluir a conexão com o Mercado Pago. Tente novamente.");
    }
    if (!corpo.public_key) {
      // Não é um erro — só registra, porque é comum o Mercado Pago não
      // devolver public_key pra contas conectadas novas (ver
      // publicKeyPlataforma acima, que é o que realmente é usado pra
      // tokenizar cartão).
      this.logger.warn(`OAuth do Mercado Pago não devolveu public_key para a conta ${corpo.user_id} (usando a chave da aplicação como fallback).`);
    }
    return {
      accessToken: corpo.access_token,
      refreshToken: corpo.refresh_token ?? null,
      publicKey: corpo.public_key ?? null,
      userId: String(corpo.user_id),
      expiraEm: new Date(Date.now() + (corpo.expires_in ?? 15552000) * 1000), // padrão MP: 180 dias
    };
  }

  private async renovarToken(refreshToken: string): Promise<TokensOAuth> {
    const clientId = this.config.get<string>("MERCADOPAGO_CLIENT_ID");
    const clientSecret = this.config.get<string>("MERCADOPAGO_CLIENT_SECRET");
    const resposta = await fetch(`${MP_API_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const corpo: any = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      this.logger.error(`Falha ao renovar token do Mercado Pago: ${resposta.status} ${JSON.stringify(corpo)}`);
      throw new BadRequestException(
        "A conexão dessa barbearia com o Mercado Pago expirou. Peça pro dono reconectar em Mais > Mercado Pago.",
      );
    }
    return {
      accessToken: corpo.access_token,
      refreshToken: corpo.refresh_token ?? refreshToken,
      publicKey: corpo.public_key ?? null,
      userId: String(corpo.user_id),
      expiraEm: new Date(Date.now() + (corpo.expires_in ?? 15552000) * 1000),
    };
  }

  // Devolve um access token válido da barbearia, renovando (e persistindo)
  // automaticamente se estiver perto de expirar. É o que AgendamentosService/
  // PacotesMensaisService devem chamar antes de qualquer operação de
  // pagamento — nunca leem mercadoPagoAccessToken direto do banco.
  async tokenDaBarbearia(barbeariaId: string): Promise<string> {
    const barbearia = await this.prisma.barbearia.findUnique({
      where: { id: barbeariaId },
      select: { mercadoPagoAccessToken: true, mercadoPagoRefreshToken: true, mercadoPagoTokenExpiraEm: true },
    });
    if (!barbearia?.mercadoPagoAccessToken) {
      throw new BadRequestException(
        "Essa barbearia ainda não conectou uma conta Mercado Pago — peça pro dono conectar em Mais > Mercado Pago antes de agendar com pagamento.",
      );
    }
    const prestesAExpirar =
      !barbearia.mercadoPagoTokenExpiraEm || barbearia.mercadoPagoTokenExpiraEm.getTime() - Date.now() < 24 * 60 * 60 * 1000;
    if (!prestesAExpirar) return barbearia.mercadoPagoAccessToken;

    if (!barbearia.mercadoPagoRefreshToken) return barbearia.mercadoPagoAccessToken; // nada a fazer, tenta com o que tem

    const tokens = await this.renovarToken(barbearia.mercadoPagoRefreshToken);
    await this.prisma.barbearia.update({
      where: { id: barbeariaId },
      data: {
        mercadoPagoAccessToken: tokens.accessToken,
        mercadoPagoRefreshToken: tokens.refreshToken,
        mercadoPagoTokenExpiraEm: tokens.expiraEm,
      },
    });
    return tokens.accessToken;
  }

  // ============================= ASSINATURA RECORRENTE (Preapproval) =============================

  // Cria a assinatura (cobrança recorrente mensal) no Mercado Pago. O pagador
  // precisa abrir `initPoint` e autorizar com o cartão dele — a cobrança de
  // verdade só começa depois disso (ver o webhook "subscription_preapproval").
  // `accessTokenOverride`: passar o token da barbearia quando for uma
  // assinatura de pacote mensal (cliente pagando a barbearia); omitir usa o
  // token de plataforma (assinatura SaaS da barbearia com a Divisions Tech).
  async criarPreapproval(
    params: { reason: string; externalReference: string; payerEmail: string; precoCentavos: number; backUrl: string },
    accessTokenOverride?: string,
  ): Promise<PreapprovalCriado> {
    const corpo: any = await this.chamar(
      "/preapproval",
      {
        method: "POST",
        body: JSON.stringify({
          reason: params.reason,
          external_reference: params.externalReference,
          payer_email: params.payerEmail,
          back_url: params.backUrl,
          status: "pending",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: Math.round(params.precoCentavos) / 100,
            currency_id: "BRL",
          },
        }),
      },
      accessTokenOverride,
    );
    return { id: String(corpo.id), initPoint: corpo.init_point, status: corpo.status };
  }

  async buscarPreapproval(id: string, accessTokenOverride?: string): Promise<PreapprovalDetalhe> {
    const corpo: any = await this.chamar(`/preapproval/${id}`, undefined, accessTokenOverride);
    return {
      id: String(corpo.id),
      status: corpo.status,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      nextPaymentDate: corpo.auto_recurring?.next_payment_date ?? corpo.next_payment_date ?? null,
    };
  }

  // Usado quando o dono cancela a assinatura pelo app — cancela também do
  // lado do Mercado Pago pra parar a cobrança recorrente de verdade.
  async cancelarPreapproval(id: string, accessTokenOverride?: string): Promise<void> {
    await this.chamar(`/preapproval/${id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, accessTokenOverride);
  }

  async buscarAuthorizedPayment(id: string, accessTokenOverride?: string): Promise<AuthorizedPaymentDetalhe> {
    const corpo: any = await this.chamar(`/authorized_payments/${id}`, undefined, accessTokenOverride);
    return {
      id: String(corpo.id),
      preapprovalId: corpo.preapproval_id != null ? String(corpo.preapproval_id) : null,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      paymentId: corpo.payment?.id != null ? String(corpo.payment.id) : null,
    };
  }

  // ============================= PAGAMENTO AVULSO (Pix / Cartão) =============================

  // Cria uma cobrança Pix avulsa (não recorrente) — usada pra pagar UM
  // agendamento. Devolve o QR code pronto pra exibir; a confirmação de
  // verdade chega pelo webhook "payment" (ver AgendamentosService).
  async criarPagamentoPix(params: {
    valorCentavos: number;
    descricao: string;
    externalReference: string;
    payerEmail: string;
  }, accessTokenOverride: string): Promise<PixCriado> {
    const corpo: any = await this.chamar(
      "/v1/payments",
      {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: Math.round(params.valorCentavos) / 100,
          description: params.descricao,
          payment_method_id: "pix",
          external_reference: params.externalReference,
          payer: { email: params.payerEmail },
        }),
      },
      accessTokenOverride,
    );
    const dadosPix = corpo.point_of_interaction?.transaction_data;
    return {
      id: String(corpo.id),
      status: corpo.status,
      qrCodeBase64: dadosPix?.qr_code_base64 ?? null,
      qrCode: dadosPix?.qr_code ?? null,
    };
  }

  // Identifica a bandeira do cartão (payment_method_id, ex: "visa",
  // "master") a partir do BIN (6 primeiros dígitos) — o Mercado Pago exige
  // esse id explícito na hora de criar o pagamento (ver criarPagamentoCartao)
  // e essa consulta só pode ser feita com o access token (não dá pra fazer
  // pelo app com a chave pública), por isso mora aqui e não no app.
  async identificarBandeiraCartao(bin: string, accessTokenOverride: string): Promise<{ paymentMethodId: string }> {
    // Esse endpoint específico do Mercado Pago exige a chave PÚBLICA na
    // própria URL — o Bearer do access token (accessTokenOverride) sozinho
    // não basta, ele responde "public_key is required" mesmo autenticado
    // (constatado nos logs de produção). Usa a chave da aplicação (mesma
    // ideia de publicKeyPlataforma/comChavePublicaResolvida em
    // BarbeariasService) já que essa consulta é só "que bandeira é esse BIN",
    // sem relação com qual barbearia vai receber o pagamento.
    const query = new URLSearchParams({ bin });
    if (this.publicKeyPlataforma) query.set("public_key", this.publicKeyPlataforma);
    const corpo: any = await this.chamar(`/v1/payment_methods/search?${query.toString()}`, undefined, accessTokenOverride);
    const resultados: any[] = Array.isArray(corpo) ? corpo : (corpo?.results ?? []);
    // O mesmo BIN às vezes casa com MAIS de um resultado — ex: "visa"
    // (crédito) e "debvisa" (débito) — porque o Mercado Pago não consegue
    // saber só pelo BIN qual é. Como só cobramos à vista e não implementamos
    // o fluxo extra de autenticação que cartão de DÉBITO exige por essa API,
    // sempre preferimos a versão de CRÉDITO explicitamente; pegar sempre o
    // primeiro resultado (às vezes vem o de débito primeiro) fazia o
    // Mercado Pago recusar a cobrança com "Invalid payment_method_id".
    const encontrado =
      resultados.find((r) => r.payment_type_id === "credit_card" && r.status === "active") ??
      resultados.find((r) => r.status === "active") ??
      resultados[0];
    if (!encontrado?.id) {
      throw new BadRequestException("Não foi possível identificar a bandeira desse cartão. Confira o número digitado.");
    }
    return { paymentMethodId: encontrado.id };
  }

  // Cria a cobrança com o cartão TOKENIZADO direto no app do cliente (ver
  // CartaoScreen) — nem o app nem esse servidor chegam a ver o número do
  // cartão em si, só o token de uso único que o próprio Mercado Pago gerou a
  // partir dele. Sempre à vista (installments fixo em 1 — o produto não
  // oferece parcelamento). O `payer.identification` (CPF) é exigido pelo
  // Mercado Pago em pagamentos com cartão no Brasil.
  async criarPagamentoCartao(
    params: {
      valorCentavos: number;
      descricao: string;
      externalReference: string;
      token: string;
      paymentMethodId: string;
      payerEmail: string;
      payerCpf: string;
    },
    accessTokenOverride: string,
  ): Promise<CartaoPagamentoCriado> {
    const corpo: any = await this.chamar(
      "/v1/payments",
      {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: Math.round(params.valorCentavos) / 100,
          description: params.descricao,
          token: params.token,
          installments: 1,
          payment_method_id: params.paymentMethodId,
          external_reference: params.externalReference,
          payer: {
            email: params.payerEmail,
            identification: { type: "CPF", number: params.payerCpf.replace(/\D/g, "") },
          },
        }),
      },
      accessTokenOverride,
    );
    return { id: String(corpo.id), status: corpo.status, statusDetail: corpo.status_detail ?? null };
  }

  // Cria uma preference do Checkout Pro (página de pagamento hospedada pelo
  // próprio Mercado Pago) — mantido só pra referência/uso futuro (ex: outro
  // método de pagamento que precise de página hospedada); o pagamento com
  // cartão do cliente final agora usa criarPagamentoCartao acima, direto no
  // app, sem sair pro navegador.
  async criarPreferenceCheckout(params: {
    valorCentavos: number;
    descricao: string;
    externalReference: string;
    backUrls: { success: string; pending: string; failure: string };
  }, accessTokenOverride: string): Promise<CheckoutPreferenceCriada> {
    const corpo: any = await this.chamar(
      "/checkout/preferences",
      {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              title: params.descricao,
              quantity: 1,
              currency_id: "BRL",
              unit_price: Math.round(params.valorCentavos) / 100,
            },
          ],
          external_reference: params.externalReference,
          back_urls: params.backUrls,
          auto_return: "approved",
          payment_methods: { excluded_payment_types: [{ id: "ticket" }] },
        }),
      },
      accessTokenOverride,
    );
    return { id: String(corpo.id), initPoint: corpo.init_point };
  }

  async buscarPayment(id: string, accessTokenOverride?: string): Promise<PaymentDetalhe> {
    const corpo: any = await this.chamar(`/v1/payments/${id}`, undefined, accessTokenOverride);
    return {
      id: String(corpo.id),
      status: corpo.status,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      transactionAmountCentavos: Math.round((corpo.transaction_amount ?? 0) * 100),
      metodoPagamento: corpo.payment_method_id ?? null,
      dataAprovacao: corpo.date_approved ?? null,
      dataCriacao: corpo.date_created,
    };
  }

  // Estorno total (sem `valorCentavos`) ou parcial (com) de um pagamento já
  // aprovado — usado pela multa de não comparecimento (estorna 50%, mantém
  // 50% com a barbearia). Estorno parcial só funciona dentro da janela que o
  // Mercado Pago permite (normalmente até a liberação do valor) — se falhar,
  // quem chamou deve tratar como "precisa resolver manualmente".
  async estornarPagamento(paymentId: string, accessTokenOverride: string, valorCentavos?: number): Promise<void> {
    await this.chamar(
      `/v1/payments/${paymentId}/refunds`,
      {
        method: "POST",
        body: valorCentavos != null ? JSON.stringify({ amount: Math.round(valorCentavos) / 100 }) : undefined,
      },
      accessTokenOverride,
    );
  }

  // Confere a assinatura HMAC da notificação (header x-signature), usando o
  // "webhook secret" configurado no painel do Mercado Pago (Suas integrações
  // > sua aplicação > Webhooks > Configurar notificações > mostrar chave
  // secreta — não é o Access Token). Fórmula documentada pelo próprio MP:
  // manifesto = "id:{data.id};request-id:{x-request-id};ts:{ts};" (omitindo
  // qualquer parte cujo dado não veio), HMAC-SHA256 desse manifesto com o
  // secret deve bater com o "v1" do header.
  //
  // Sem MERCADOPAGO_WEBHOOK_SECRET configurado não dá pra validar — aceitamos
  // mesmo assim (útil em desenvolvimento/sandbox), mas registramos um alerta;
  // configure o secret antes de ir pra produção.
  validarAssinaturaWebhook(params: { xSignature?: string; xRequestId?: string; dataId?: string }): boolean {
    const secret = this.config.get<string>("MERCADOPAGO_WEBHOOK_SECRET");
    if (!secret) {
      this.logger.warn("MERCADOPAGO_WEBHOOK_SECRET não configurado — pulando validação da assinatura do webhook.");
      return true;
    }
    if (!params.xSignature) return false;

    const partes: Record<string, string> = {};
    for (const par of params.xSignature.split(",")) {
      const [chave, ...resto] = par.split("=");
      if (chave) partes[chave.trim()] = resto.join("=").trim();
    }
    const ts = partes.ts;
    const v1 = partes.v1;
    if (!ts || !v1) return false;

    let manifesto = "";
    if (params.dataId) manifesto += `id:${params.dataId.toLowerCase()};`;
    if (params.xRequestId) manifesto += `request-id:${params.xRequestId};`;
    manifesto += `ts:${ts};`;

    const hmac = crypto.createHmac("sha256", secret).update(manifesto).digest("hex");
    return hmac === v1;
  }
}
