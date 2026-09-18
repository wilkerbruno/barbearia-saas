import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { identificarBandeiraLocal } from "@barbearia-saas/shared";
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
  // URL do desafio 3DS (ver criarPagamentoCartao) — só vem preenchida
  // enquanto a Order está "action_required"/"pending_challenge"; some de
  // novo (null) assim que o comprador conclui ou o desafio expira.
  desafio3dsUrl?: string | null;
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
  // Preenchida quando o Mercado Pago exige autenticação 3DS do titular antes
  // de aprovar (ver criarPagamentoCartao) — o app precisa abrir essa URL
  // numa WebView pro cliente confirmar com o próprio banco.
  desafio3dsUrl: string | null;
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
  // esse id explícito na hora de criar o pagamento (ver criarPagamentoCartao).
  //
  // HISTÓRICO (bug de produção "bandeira sempre master", investigado set/2026):
  // essa função chamava GET /v1/payment_methods/search?bin=...&public_key=...
  // pra descobrir a bandeira pelo BIN. O Mercado Pago, porém, descontinuou o
  // filtro por BIN nesse endpoint ("Changes to the Payment Methods API
  // search", anunciado 26/07/2024, rollout escalonado por país até nov/2024 —
  // https://www.mercadopago.com.br/developers/pt/news/2024/07/26/Changes-to-the-Payment-Methods-API-search--effective-09-09-2024).
  // Confirmamos isso testando o endpoint em sandbox com 3 BINs diferentes
  // (inclusive um BIN de cartão de teste OFICIAL do próprio Mercado Pago,
  // 423564 = Visa, e sem nenhum header de Authorization, pra descartar
  // qualquer influência dele): a chamada sempre devolveu a MESMA lista com
  // os ~80 meios de pagamento habilitados na conta inteira (Mastercard,
  // Visa, Amex, Elo, Pix, boleto, repetidos por vários emissores),
  // ignorando completamente o `bin` enviado. Como o código pegava o
  // primeiro resultado de crédito dessa lista genérica — que por coincidência
  // é sempre um Mastercard —, o resultado era sempre "master", não importa o
  // cartão real do cliente.
  //
  // A correção é não depender mais dessa chamada: identificarBandeiraLocal
  // (pacote compartilhado) reconhece a bandeira pelos próprios dígitos do
  // BIN (mesma técnica usada por qualquer gateway de pagamento, sem chamada
  // de rede nenhuma) — funciona tanto aqui quanto no app (ver CartaoScreen,
  // que agora mostra a bandeira ao cliente assim que ele digita o número).
  async identificarBandeiraCartao(bin: string): Promise<{ paymentMethodId: string }> {
    const bandeira = identificarBandeiraLocal(bin);
    if (!bandeira) {
      throw new BadRequestException("Não foi possível identificar a bandeira desse cartão. Confira o número digitado.");
    }
    return { paymentMethodId: bandeira.paymentMethodId };
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
      payerNome: string;
      // Device ID gerado pelo script antifraude do próprio Mercado Pago
      // (window.MP_DEVICE_SESSION_ID, capturado numa WebView oculta em
      // CartaoScreen) — mandado no header X-Meli-Session-Id abaixo quando
      // presente. Ajuda o antifraude a avaliar melhor o risco da transação
      // (ver histórico de "high_risk" logo abaixo); opcional porque a coleta
      // no app pode falhar/expirar sem impedir o pagamento.
      deviceId?: string;
    },
    accessTokenOverride: string,
  ): Promise<CartaoPagamentoCriado> {
    // HISTÓRICO DE INVESTIGAÇÃO (cartão recusado com "Invalid
    // payment_method_id", código 3028, mesmo com bandeira certa e habilitada
    // na conta — ver logs de produção) — essa função chamava a API CLÁSSICA
    // de Payments (POST /v1/payments), mas a aplicação do Mercado Pago dessa
    // conta foi provisionada especificamente pra "API Orders" (confirmado em
    // Suas integrações > [aplicação] > Detalhes > "API integrada: API
    // Orders"). Chamar a API clássica numa aplicação assim é o que causava
    // esse erro — e, ao tentar contornar com `application_fee` (outra
    // hipótese testada), veio "application_fee attribute must be positive"
    // e depois "You cannot use application_fee with this payment" (a
    // aplicação não está habilitada pra marketplace/split, então nem esse
    // caminho serve). A correção é usar a Orders API mesmo (POST
    // /v1/orders), que é o que essa aplicação realmente espera — ver
    // interpretarOrder/buscarOrderComoPayment abaixo pra como o retorno dela
    // é traduzido pro mesmo vocabulário ("approved"/"pending"/"rejected")
    // que o resto do código (ex: AgendamentosService) já usa.
    const valorFormatado = (Math.round(params.valorCentavos) / 100).toFixed(2);
    // "HTTP 422 Unprocessable Entity" genérico (sem detalhe nenhum no corpo)
    // veio depois de corrigir o external_reference — a estrutura da
    // requisição já bate com o exemplo oficial do SDK Node.js do próprio
    // Mercado Pago (mercadopago/sdk-nodejs), mas esse exemplo SEMPRE inclui
    // nome do pagador (first_name/last_name) e statement_descriptor, que
    // aqui não iam. Adiciona os dois — a Orders API parece validar o payer
    // de forma mais rígida que a API clássica (que aceitava só e-mail+CPF).
    const [primeiroNome, ...restoNome] = params.payerNome.trim().split(/\s+/);
    // Registra só SE o Device ID chegou até aqui (nunca o valor em si, que é
    // um identificador de sessão) — fecha a dúvida se a WebView oculta do app
    // (ver CartaoScreen) está de fato conseguindo capturar o
    // window.MP_DEVICE_SESSION_ID antes do cliente confirmar o pagamento, ou
    // se está sempre expirando/falhando e o antifraude nunca recebe esse sinal.
    this.logger.log(`Cobrança com cartão: Device ID ${params.deviceId ? "presente" : "AUSENTE"} (paymentMethodId=${params.paymentMethodId})`);
    const corpo: any = await this.chamar(
      "/v1/orders",
      {
        method: "POST",
        headers: {
          "X-Idempotency-Key": crypto.randomUUID(),
          // Device ID (ver comentário no parâmetro `deviceId` acima) — só
          // manda o header quando a coleta no app deu certo; omitir é
          // melhor do que mandar vazio/inválido.
          ...(params.deviceId ? { "X-Meli-Session-Id": params.deviceId } : {}),
        },
        body: JSON.stringify({
          type: "online",
          processing_mode: "automatic",
          total_amount: valorFormatado,
          external_reference: params.externalReference,
          // HISTÓRICO (set/2026): sem isso, o Mercado Pago mostra "Produto sem
          // nome" pro cliente nos e-mails/telas de confirmação/recusa — o
          // campo certo pra isso é `items` (documentado na API Reference da
          // Orders API: título aparece por conta desse campo), que não
          // estava sendo enviado. Além de deixar mais claro pro cliente o que
          // ele está pagando (evita ele desconfiar de um "produto sem nome" e
          // reportar como compra não reconhecida), dar contexto real da
          // compra tende a ajudar o antifraude do próprio Mercado Pago a
          // avaliar a transação — uma cobrança sem nenhum item identificado
          // é um sinal a menos de que é uma compra legítima.
          items: [
            {
              title: params.descricao.slice(0, 256),
              quantity: 1,
              unit_price: valorFormatado,
            },
          ],
          payer: {
            email: params.payerEmail,
            first_name: primeiroNome || params.payerNome,
            last_name: restoNome.join(" ") || primeiroNome || params.payerNome,
            identification: { type: "CPF", number: params.payerCpf.replace(/\D/g, "") },
          },
          // HISTÓRICO (pagamento recusado de cara com status_detail
          // "high_risk", mesmo em tentativas legítimas com cartão/CPF/valor
          // diferentes — ver logs de produção set/2026): sem esse bloco, o
          // Mercado Pago cria a Order com `transaction_security.validation:
          // "never"` por padrão, ou seja, NUNCA aciona o desafio 3DS — pra
          // qualquer transação que o antifraude deles considere arriscada
          // (comum em conta de marketplace nova, sem histórico), a única
          // saída que sobra pro motor de risco é recusar direto, sem dar
          // chance de o titular se autenticar. "on_fraud_risk" pede pro
          // Mercado Pago acionar o desafio 3DS SÓ quando o risco exigir (não
          // em toda compra) — e `liability_shift: "required"` é obrigatório
          // junto (transfere a responsabilidade por chargeback pro emissor
          // do cartão quando o desafio é concluído). Doc oficial: Checkout
          // Transparente via Orders > Payment management > Integrar 3DS 2.0.
          // Quando a Order volta com status "action_required"/status_detail
          // "pending_challenge", a URL do desafio vem em
          // transactions.payments[0].payment_method.transaction_security.url
          // (ver interpretarOrder abaixo) — o app abre isso numa WebView
          // (ver CartaoScreen/PagamentoScreen) pro cliente confirmar com o
          // próprio banco antes de aprovar.
          config: {
            online: {
              transaction_security: {
                validation: "on_fraud_risk",
                liability_shift: "required",
              },
            },
          },
          transactions: {
            payments: [
              {
                amount: valorFormatado,
                payment_method: {
                  id: params.paymentMethodId,
                  type: "credit_card",
                  token: params.token,
                  installments: 1,
                  statement_descriptor: params.descricao.slice(0, 22),
                },
              },
            ],
          },
        }),
      },
      accessTokenOverride,
    );
    const { status, statusDetail, desafio3dsUrl } = this.interpretarOrder(corpo);
    // HISTÓRICO (investigação "high_risk", set/2026): quando o Mercado Pago
    // recusa a Order já na criação (HTTP não-2xx), o `chamar()` acima loga um
    // ERROR sozinho. Mas quando a criação responde OK (2xx) e a Order já vem
    // com o pagamento "failed"/"rejected" dentro do corpo — sem nenhum erro
    // de transporte —, esse caminho passava batido, sem nenhum log, dando a
    // falsa impressão de que a tentativa "sumiu" (foi o que aconteceu num
    // teste de R$40 que não apareceu em log nenhum). Registra aqui sempre que
    // o resultado não for aprovação na hora, pra nenhuma tentativa ficar
    // invisível independente do valor ou do motivo.
    if (status !== "approved") {
      this.logger.warn(
        `Order ${corpo.id} criada sem recusa de transporte, mas resultado não aprovado: status=${status} statusDetail=${statusDetail} valor=${valorFormatado} paymentMethodId=${params.paymentMethodId}`,
      );
    }
    // Guarda o id da ORDER (prefixo "ORD...", não o id do pagamento aninhado
    // dentro dela) — é esse id que fica salvo em Pagamento.gatewayPagamentoId
    // e usado depois em buscarPayment/estornarPagamento, que reconhecem esse
    // prefixo pra saber que devem usar a Orders API em vez da API clássica.
    return { id: String(corpo.id), status, statusDetail, desafio3dsUrl };
  }

  // Traduz o status de uma Order (API nova, usada pelo cartão — ver
  // criarPagamentoCartao) pro vocabulário clássico "approved"/"pending"/
  // "rejected" que o resto do código já espera (CartaoPagamentoCriado,
  // PaymentDetalhe). Lê o status da PRIMEIRA transação da Order — a única
  // que essa integração cria por Order — porque é lá que vem o motivo
  // específico de recusa (ex: "cc_rejected_insufficient_amount", igual à API
  // clássica) que traduzirMotivoRecusaCartao usa; o status da Order em si é
  // mais genérico. Tabela oficial: Checkout Transparente via Orders >
  // Payment management > Status > Transaction status.
  private interpretarOrder(corpo: any): {
    status: "approved" | "pending" | "rejected";
    statusDetail: string | null;
    transacao: any;
    desafio3dsUrl: string | null;
  } {
    const transacao = corpo?.transactions?.payments?.[0];
    const statusBruto = transacao?.status ?? corpo?.status;
    const statusDetail = transacao?.status_detail ?? corpo?.status_detail ?? null;
    const status: "approved" | "pending" | "rejected" =
      statusBruto === "processed" && (statusDetail === "accredited" || statusDetail === "partially_refunded")
        ? "approved"
        : ["created", "processing", "action_required", "in_review"].includes(statusBruto)
          ? "pending"
          : "rejected"; // failed, charged_back, refunded, expired, canceled
    // Só vem preenchida quando o Mercado Pago decidiu acionar o desafio 3DS
    // pra essa transação (status_detail "pending_challenge", ver
    // criarPagamentoCartao) — nos demais casos é undefined, por isso o `??
    // null` (facilita quem só quer checar "tem desafio pendente ou não").
    const desafio3dsUrl = transacao?.payment_method?.transaction_security?.url ?? null;
    return { status, statusDetail, transacao, desafio3dsUrl };
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

  // Ids de Order (cartão — ver criarPagamentoCartao) sempre vêm com o
  // prefixo "ORD" do próprio Mercado Pago, o que basta pra distinguir de um
  // id de payment clássico (Pix) sem precisar guardar mais nada no banco.
  private ehIdDeOrder(id: string): boolean {
    return id.startsWith("ORD");
  }

  async buscarPayment(id: string, accessTokenOverride?: string): Promise<PaymentDetalhe> {
    if (this.ehIdDeOrder(id)) return this.buscarOrderComoPayment(id, accessTokenOverride);
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

  // Consulta uma Order (GET /v1/orders/:id) e devolve no mesmo formato
  // PaymentDetalhe que o resto do código (poll em AgendamentosService,
  // webhook em WebhooksService) já sabe interpretar — nenhum dos dois
  // precisou mudar por causa da Orders API graças a essa tradução ficar
  // isolada aqui.
  private async buscarOrderComoPayment(id: string, accessTokenOverride?: string): Promise<PaymentDetalhe> {
    const corpo: any = await this.chamar(`/v1/orders/${id}`, undefined, accessTokenOverride);
    const { status, statusDetail, transacao, desafio3dsUrl } = this.interpretarOrder(corpo);
    // Mesmo histórico do comentário em criarPagamentoCartao: uma recusa
    // descoberta só AQUI (Order criada normalmente, mas que virou
    // "failed"/"rejected" depois, entre a criação e esse polling) nunca
    // passava pelo log de ERROR do `chamar()` — essa consulta em si é um 200
    // OK. Registra pra essas recusas assíncronas também ficarem visíveis.
    if (status === "rejected") {
      this.logger.warn(`Order ${id} consultada via polling/webhook veio recusada: statusDetail=${statusDetail}`);
    }
    return {
      id: String(corpo.id),
      status,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      transactionAmountCentavos: Math.round(Number(corpo.total_amount ?? 0) * 100),
      metodoPagamento: transacao?.payment_method?.id ?? null,
      dataAprovacao: status === "approved" ? (corpo.last_updated_date ?? null) : null,
      dataCriacao: corpo.created_date,
      desafio3dsUrl,
    };
  }

  // Estorno total (sem `valorCentavos`) ou parcial (com) de um pagamento já
  // aprovado — usado pela multa de não comparecimento (estorna 50%, mantém
  // 50% com a barbearia). Estorno parcial só funciona dentro da janela que o
  // Mercado Pago permite (normalmente até a liberação do valor) — se falhar,
  // quem chamou deve tratar como "precisa resolver manualmente".
  async estornarPagamento(paymentId: string, accessTokenOverride: string, valorCentavos?: number): Promise<void> {
    if (this.ehIdDeOrder(paymentId)) {
      // Orders API: /v1/orders/:id/refund. Estorno parcial exige o
      // `transaction_id` do pagamento aninhado dentro da Order (prefixo
      // "PAY...") — precisa buscar a Order primeiro pra pegar esse id;
      // estorno total é só um corpo vazio.
      let transactionId: string | undefined;
      if (valorCentavos != null) {
        const order: any = await this.chamar(`/v1/orders/${paymentId}`, undefined, accessTokenOverride);
        transactionId = order?.transactions?.payments?.[0]?.id;
      }
      await this.chamar(
        `/v1/orders/${paymentId}/refund`,
        {
          method: "POST",
          body: JSON.stringify(
            valorCentavos != null ? { amount: Math.round(valorCentavos) / 100, transaction_id: transactionId } : {},
          ),
        },
        accessTokenOverride,
      );
      return;
    }
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
