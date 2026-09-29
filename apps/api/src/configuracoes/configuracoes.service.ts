import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateConfiguracaoDto } from "./dto/update-configuracao.dto";

// Linha única (singleton, id fixo "default") com os parâmetros globais do
// SaaS que o SAAS_ADMIN ajusta no admin-web: duração do teste grátis e horas
// de carência que um cliente ainda vê a barbearia depois da assinatura vencer
// (ver AssinaturasService/AssinaturaGuard, que leem esses valores em tempo de
// requisição — não há job agendado, o cálculo é sempre feito na hora).
@Injectable()
export class ConfiguracoesService {
  constructor(private prisma: PrismaService) {}

  // Cria a linha com os valores padrão (14 dias de teste, 24h de carência) na
  // primeira vez que alguém ler ou uma requisição precisar dela.
  async obter() {
    return this.prisma.configuracaoPlataforma.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
  }

  async atualizar(dto: UpdateConfiguracaoDto) {
    await this.obter();
    return this.prisma.configuracaoPlataforma.update({
      where: { id: "default" },
      data: dto,
    });
  }
}
