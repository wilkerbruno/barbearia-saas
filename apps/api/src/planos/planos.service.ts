import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePlanoDto } from "./dto/create-plano.dto";
import { UpdatePlanoDto } from "./dto/update-plano.dto";

@Injectable()
export class PlanosService {
  constructor(private prisma: PrismaService) {}

  // Público: usado na tela de onboarding ("escolha seu plano") antes do login existir.
  listarAtivos() {
    return this.prisma.plano.findMany({ where: { ativo: true }, orderBy: { precoCentavos: "asc" } });
  }

  // SAAS_ADMIN: enxerga também os planos desativados (legados).
  listarTodos() {
    return this.prisma.plano.findMany({ orderBy: { precoCentavos: "asc" } });
  }

  criar(dto: CreatePlanoDto) {
    return this.prisma.plano.create({ data: dto });
  }

  // É aqui que o SaaS "faz os valores": muda o preço da mensalidade de um plano.
  atualizar(id: string, dto: UpdatePlanoDto) {
    return this.prisma.plano.update({ where: { id }, data: dto });
  }
}
