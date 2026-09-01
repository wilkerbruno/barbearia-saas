import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateBarbeariaDto } from "./dto/update-barbearia.dto";

@Injectable()
export class BarbeariasService {
  constructor(private prisma: PrismaService) {}

  // Usado pelo painel SaaS (SAAS_ADMIN) para listar todas as barbearias assinantes.
  listarTodas() {
    return this.prisma.barbearia.findMany({
      include: { assinatura: { include: { plano: true } }, funcionarios: true },
      orderBy: { criadoEm: "desc" },
    });
  }

  async buscarPorId(id: string) {
    const barbearia = await this.prisma.barbearia.findUnique({
      where: { id },
      include: { assinatura: { include: { plano: true } } },
    });
    if (!barbearia) throw new NotFoundException("Barbearia não encontrada.");
    return barbearia;
  }

  atualizar(id: string, dto: UpdateBarbeariaDto) {
    return this.prisma.barbearia.update({ where: { id }, data: dto });
  }

  // Público: o app do cliente usa isso para montar a lista de profissionais
  // no passo "Escolher profissional" do agendamento.
  listarFuncionariosPublico(barbeariaId: string) {
    return this.prisma.funcionario.findMany({
      where: { barbeariaId, ativo: true, disponivel: true },
      include: { usuario: { select: { id: true, nome: true } } },
    });
  }
}
