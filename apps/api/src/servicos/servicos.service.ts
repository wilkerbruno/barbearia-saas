import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServicoDto } from "./dto/create-servico.dto";
import { UpdateServicoDto } from "./dto/update-servico.dto";
import { CreatePacoteDto } from "./dto/create-pacote.dto";
import { UpdatePacoteDto } from "./dto/update-pacote.dto";

@Injectable()
export class ServicosService {
  constructor(private prisma: PrismaService) {}

  // ---------- Catálogo público (usado pelo app do cliente) ----------

  listarServicosDaBarbearia(barbeariaId: string) {
    return this.prisma.servico.findMany({
      where: { barbeariaId, ativo: true },
      orderBy: { nome: "asc" },
    });
  }

  listarPacotesDaBarbearia(barbeariaId: string) {
    return this.prisma.pacote.findMany({
      where: { barbeariaId, ativo: true },
      include: { servicos: { include: { servico: true } } },
      orderBy: { nome: "asc" },
    });
  }

  // ---------- Gestão (BARBEARIA_ADMIN) ----------

  criarServico(barbeariaId: string, dto: CreateServicoDto) {
    return this.prisma.servico.create({ data: { ...dto, barbeariaId } });
  }

  async atualizarServico(id: string, barbeariaId: string, dto: UpdateServicoDto) {
    await this.garantirServicoDaBarbearia(id, barbeariaId);
    return this.prisma.servico.update({ where: { id }, data: dto });
  }

  async removerServico(id: string, barbeariaId: string) {
    await this.garantirServicoDaBarbearia(id, barbeariaId);
    // Soft delete: mantém histórico de agendamentos que referenciam este serviço.
    return this.prisma.servico.update({ where: { id }, data: { ativo: false } });
  }

  async criarPacote(barbeariaId: string, dto: CreatePacoteDto) {
    const { servicoIds, ...dados } = dto;
    return this.prisma.pacote.create({
      data: {
        ...dados,
        barbeariaId,
        servicos: { create: servicoIds.map((servicoId) => ({ servicoId })) },
      },
      include: { servicos: { include: { servico: true } } },
    });
  }

  async atualizarPacote(id: string, barbeariaId: string, dto: UpdatePacoteDto) {
    await this.garantirPacoteDaBarbearia(id, barbeariaId);
    const { servicoIds, ...dados } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (servicoIds) {
        await tx.pacoteServico.deleteMany({ where: { pacoteId: id } });
        await tx.pacoteServico.createMany({
          data: servicoIds.map((servicoId) => ({ pacoteId: id, servicoId })),
        });
      }
      return tx.pacote.update({
        where: { id },
        data: dados,
        include: { servicos: { include: { servico: true } } },
      });
    });
  }

  async removerPacote(id: string, barbeariaId: string) {
    await this.garantirPacoteDaBarbearia(id, barbeariaId);
    return this.prisma.pacote.update({ where: { id }, data: { ativo: false } });
  }

  private async garantirServicoDaBarbearia(id: string, barbeariaId: string) {
    const servico = await this.prisma.servico.findUnique({ where: { id } });
    if (!servico) throw new NotFoundException("Serviço não encontrado.");
    if (servico.barbeariaId !== barbeariaId) throw new ForbiddenException("Serviço não pertence à sua barbearia.");
  }

  private async garantirPacoteDaBarbearia(id: string, barbeariaId: string) {
    const pacote = await this.prisma.pacote.findUnique({ where: { id } });
    if (!pacote) throw new NotFoundException("Pacote não encontrado.");
    if (pacote.barbeariaId !== barbeariaId) throw new ForbiddenException("Pacote não pertence à sua barbearia.");
  }
}
