import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

const MP_API_URL = "https://api.mercadopago.com";

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

// Integração com o Mercado Pago pra cobrar a mensalidade das barbearias
// assinantes do SaaS. Usa a API de "Preapproval" (assinatura recorrente com
// cartão salvo, cobrada automaticamente todo mês) — ver AssinaturasService
// pra como isso se encaixa no fluxo de troca/contratação de plano, e
// apps/api/.env.example pra como configurar as credenciais.
//
// Documentação oficial: https://www.mercadopago.com.br/developers/pt/docs/subscriptions
@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(private config: ConfigService) {}

  get configurado(): boolean {
    return !!this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN");
  }

  private get accessToken(): string {
    const token = this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN");
    if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
    return token;
  }

  private async chamar<T>(path: string, init?: RequestInit): Promise<T> {
    const resposta = await fetch(`${MP_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      this.logger.error(`Mercado Pago ${init?.method ?? "GET"} ${path} -> ${resposta.status}: ${JSON.stringify(corpo)}`);
      throw new Error(`Falha ao comunicar com o Mercado Pago (HTTP ${resposta.status}).`);
    }
    return corpo as T;
  }

  // Cria a assinatura (cobrança recorrente mensal) no Mercado Pago. O pagador
  // precisa abrir `initPoint` e autorizar com o cartão dele — a cobrança de
  // verdade só começa depois disso (ver o webhook "subscription_preapproval").
  async criarPreapproval(params: {
    reason: string;
    externalReference: string;
    payerEmail: string;
    precoCentavos: number;
    backUrl: string;
  }): Promise<PreapprovalCriado> {
    const corpo: any = await this.chamar("/preapproval", {
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
    });
    return { id: String(corpo.id), initPoint: corpo.init_point, status: corpo.status };
  }

  async buscarPreapproval(id: string): Promise<PreapprovalDetalhe> {
    const corpo: any = await this.chamar(`/preapproval/${id}`);
    return {
      id: String(corpo.id),
      status: corpo.status,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      nextPaymentDate: corpo.auto_recurring?.next_payment_date ?? corpo.next_payment_date ?? null,
    };
  }

  // Usado quando o dono cancela a assinatura pelo app — cancela também do
  // lado do Mercado Pago pra parar a cobrança recorrente de verdade.
  async cancelarPreapproval(id: string): Promise<void> {
    await this.chamar(`/preapproval/${id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
  }

  async buscarAuthorizedPayment(id: string): Promise<AuthorizedPaymentDetalhe> {
    const corpo: any = await this.chamar(`/authorized_payments/${id}`);
    return {
      id: String(corpo.id),
      preapprovalId: corpo.preapproval_id != null ? String(corpo.preapproval_id) : null,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      paymentId: corpo.payment?.id != null ? String(corpo.payment.id) : null,
    };
  }

  async buscarPayment(id: string): Promise<PaymentDetalhe> {
    const corpo: any = await this.chamar(`/v1/payments/${id}`);
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
