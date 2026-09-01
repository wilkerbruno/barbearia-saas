import { NotFoundException, Injectable } from "@nestjs/common";
import { StatusAssinatura } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AssinaturasService {
  constructor(private prisma: PrismaService) {}

  async minhaAssinatura(barbeariaId: string) {
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { barbeariaId },
      include: { plano: true, faturas: { orderBy: { vencimentoEm: "desc" }, take: 12 } },
    });
    if (!assinatura) throw new NotFoundException("Barbearia sem assinatura ativa.");
    return assinatura;
  }

  // Troca de plano (upgrade/downgrade). A cobrança proporcional (se houver) fica
  // a cargo do gateway de pagamento na integração real — aqui só atualizamos o registro.
  async mudarPlano(barbeariaId: string, planoId: string) {
    await this.minhaAssinatura(barbeariaId); // garante que existe
    return this.prisma.assinatura.update({
      where: { barbeariaId },
      data: { planoId, status: StatusAssinatura.ATIVA },
      include: { plano: true },
    });
  }

  async cancelar(barbeariaId: string) {
    await this.minhaAssinatura(barbeariaId);
    return this.prisma.assinatura.update({
      where: { barbeariaId },
      data: { status: StatusAssinatura.CANCELADA },
    });
  }

  // Painel SaaS: visão geral de todas as assinaturas + faturamento recorrente.
  listarTodas() {
    return this.prisma.assinatura.findMany({
      include: { plano: true, barbearia: true, faturas: { orderBy: { vencimentoEm: "desc" }, take: 1 } },
      orderBy: { inicioEm: "desc" },
    });
  }

  listarFaturas() {
    return this.prisma.fatura.findMany({
      include: { assinatura: { include: { barbearia: true, plano: true } } },
      orderBy: { vencimentoEm: "desc" },
      take: 200,
    });
  }

  // Placeholder para o webhook do gateway de pagamento (Stripe, Asaas, Iugu, etc.).
  // Ao integrar de verdade: validar a assinatura do webhook, achar a Fatura pelo
  // gatewayFaturaId e atualizar o status (PAGA/ATRASADA) e, se preciso, o status
  // da Assinatura (ex: ATIVA -> INADIMPLENTE após falha de cobrança).
  async processarEventoPagamento(_payload: unknown) {
    // TODO: implementar na integração com o gateway de pagamento escolhido.
    return { recebido: true };
  }
}
