import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Papel } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFuncionarioDto } from "./dto/create-funcionario.dto";
import { UpdateFuncionarioDto } from "./dto/update-funcionario.dto";
import { DefinirHorariosDto } from "./dto/definir-horarios.dto";
import { CreateFolgaDto } from "./dto/create-folga.dto";

@Injectable()
export class FuncionariosService {
  constructor(private prisma: PrismaService) {}

  // ---------- Gestão da equipe (BARBEARIA_ADMIN) ----------

  listarDaBarbearia(barbeariaId: string) {
    return this.prisma.funcionario.findMany({
      where: { barbeariaId },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
      orderBy: { usuario: { nome: "asc" } },
    });
  }

  // Cria o login do funcionário (Usuario) + o cadastro na equipe (Funcionario)
  // numa mesma transação. Respeita o limite de funcionários do plano da
  // barbearia (null = ilimitado) — é o "convite" de um novo membro da equipe.
  async criar(barbeariaId: string, dto: CreateFuncionarioDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    await this.garantirDentroDoLimiteDoPlano(barbeariaId);

    const senhaHash = await bcrypt.hash(dto.senha, 10);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nome: dto.nome,
          email: dto.email,
          senhaHash,
          papel: Papel.FUNCIONARIO,
          barbeariaId,
        },
      });

      return tx.funcionario.create({
        data: {
          usuarioId: usuario.id,
          barbeariaId,
          cargo: dto.cargo ?? "Barbeiro",
          comissaoPercentual: dto.comissaoPercentual ?? 60,
        },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      });
    });
  }

  async atualizar(id: string, barbeariaId: string, dto: UpdateFuncionarioDto) {
    await this.garantirDaBarbearia(id, barbeariaId);

    // Reativar um funcionário desativado também respeita o limite do plano
    // (senão dava pra contornar o limite desativando/reativando gente).
    if (dto.ativo) {
      const funcionario = await this.prisma.funcionario.findUnique({ where: { id } });
      if (funcionario && !funcionario.ativo) {
        await this.garantirDentroDoLimiteDoPlano(barbeariaId);
      }
    }

    return this.prisma.funcionario.update({
      where: { id },
      data: dto,
      include: { usuario: { select: { id: true, nome: true, email: true } } },
    });
  }

  // Só o id do cadastro na equipe (Funcionario.id, diferente do id do
  // Usuario/login) — usado pra lançar um agendamento manual na própria
  // agenda (ver AgendamentosController.criarManual, que exige esse id).
  async buscarMeuId(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return { id: funcionario.id };
  }

  // ---------- Horário de trabalho (o próprio funcionário edita o seu) ----------

  async listarMeusHorarios(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.listarHorariosPorFuncionarioId(funcionario.id);
  }

  // Substitui a semana inteira de uma vez (mais simples do que um CRUD dia a
  // dia — a tela do app manda os 7 dias juntos, só com os que ele trabalha).
  async definirMeusHorarios(usuarioId: string, dto: DefinirHorariosDto) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.definirHorariosPorFuncionarioId(funcionario.id, dto);
  }

  // ---------- Horário de trabalho (o dono da barbearia edita o de qualquer funcionário) ----------

  async listarHorariosDoFuncionario(funcionarioId: string, barbeariaId: string) {
    await this.garantirDaBarbearia(funcionarioId, barbeariaId);
    return this.listarHorariosPorFuncionarioId(funcionarioId);
  }

  async definirHorariosDoFuncionario(funcionarioId: string, barbeariaId: string, dto: DefinirHorariosDto) {
    await this.garantirDaBarbearia(funcionarioId, barbeariaId);
    return this.definirHorariosPorFuncionarioId(funcionarioId, dto);
  }

  // ---------- Folgas (o próprio funcionário edita as suas) ----------

  async listarMinhasFolgas(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.listarFolgasPorFuncionarioId(funcionario.id);
  }

  async criarMinhaFolga(usuarioId: string, dto: CreateFolgaDto) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.criarFolgaPorFuncionarioId(funcionario.id, dto);
  }

  async removerMinhaFolga(usuarioId: string, folgaId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.removerFolgaPorFuncionarioId(funcionario.id, folgaId);
  }

  // ---------- Folgas (o dono da barbearia edita as de qualquer funcionário) ----------

  async listarFolgasDoFuncionario(funcionarioId: string, barbeariaId: string) {
    await this.garantirDaBarbearia(funcionarioId, barbeariaId);
    return this.listarFolgasPorFuncionarioId(funcionarioId);
  }

  async criarFolgaDoFuncionario(funcionarioId: string, barbeariaId: string, dto: CreateFolgaDto) {
    await this.garantirDaBarbearia(funcionarioId, barbeariaId);
    return this.criarFolgaPorFuncionarioId(funcionarioId, dto);
  }

  async removerFolgaDoFuncionario(funcionarioId: string, barbeariaId: string, folgaId: string) {
    await this.garantirDaBarbearia(funcionarioId, barbeariaId);
    return this.removerFolgaPorFuncionarioId(funcionarioId, folgaId);
  }

  // ---------- implementação comum (horários/folgas), por Funcionario.id ----------

  private async listarHorariosPorFuncionarioId(funcionarioId: string) {
    return this.prisma.horarioTrabalho.findMany({ where: { funcionarioId }, orderBy: { diaSemana: "asc" } });
  }

  private async definirHorariosPorFuncionarioId(funcionarioId: string, dto: DefinirHorariosDto) {
    for (const dia of dto.dias) {
      if (dia.horaFim <= dia.horaInicio) {
        throw new BadRequestException(`O horário final precisa ser depois do inicial (dia ${dia.diaSemana}).`);
      }
      const temAlmoco = dia.inicioAlmoco && dia.fimAlmoco;
      if (temAlmoco && (dia.inicioAlmoco! < dia.horaInicio || dia.fimAlmoco! > dia.horaFim || dia.fimAlmoco! <= dia.inicioAlmoco!)) {
        throw new BadRequestException(`O horário de almoço precisa estar dentro do expediente (dia ${dia.diaSemana}).`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.horarioTrabalho.deleteMany({ where: { funcionarioId } });
      if (dto.dias.length > 0) {
        await tx.horarioTrabalho.createMany({
          data: dto.dias.map((dia) => ({
            funcionarioId,
            diaSemana: dia.diaSemana,
            horaInicio: dia.horaInicio,
            horaFim: dia.horaFim,
            inicioAlmoco: dia.inicioAlmoco,
            fimAlmoco: dia.fimAlmoco,
          })),
        });
      }
    });

    return this.listarHorariosPorFuncionarioId(funcionarioId);
  }

  private async listarFolgasPorFuncionarioId(funcionarioId: string) {
    return this.prisma.folga.findMany({
      where: { funcionarioId, fim: { gte: new Date() } },
      orderBy: { inicio: "asc" },
    });
  }

  private async criarFolgaPorFuncionarioId(funcionarioId: string, dto: CreateFolgaDto) {
    const inicio = new Date(dto.inicio);
    const fim = new Date(dto.fim);
    if (fim <= inicio) throw new BadRequestException("O fim da folga precisa ser depois do início.");

    return this.prisma.folga.create({
      data: { funcionarioId, inicio, fim, motivo: dto.motivo },
    });
  }

  private async removerFolgaPorFuncionarioId(funcionarioId: string, folgaId: string) {
    const folga = await this.prisma.folga.findUnique({ where: { id: folgaId } });
    if (!folga || folga.funcionarioId !== funcionarioId) throw new NotFoundException("Folga não encontrada.");
    await this.prisma.folga.delete({ where: { id: folgaId } });
    return { ok: true };
  }

  // ---------- helpers ----------

  private async buscarFuncionarioPorUsuario(usuarioId: string) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");
    return funcionario;
  }

  private async garantirDaBarbearia(id: string, barbeariaId: string) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { id } });
    if (!funcionario) throw new NotFoundException("Funcionário não encontrado.");
    if (funcionario.barbeariaId !== barbeariaId) throw new ForbiddenException("Funcionário não pertence à sua barbearia.");
  }

  private async garantirDentroDoLimiteDoPlano(barbeariaId: string) {
    const assinatura = await this.prisma.assinatura.findUnique({ where: { barbeariaId }, include: { plano: true } });
    const limite = assinatura?.plano.limiteFuncionarios;
    if (limite == null) return; // sem assinatura encontrada ou plano ilimitado: não bloqueia

    const totalAtivos = await this.prisma.funcionario.count({ where: { barbeariaId, ativo: true } });
    if (totalAtivos >= limite) {
      throw new BadRequestException(
        `Seu plano (${assinatura!.plano.nome}) permite até ${limite} funcionário${limite === 1 ? "" : "s"}. Desative alguém ou faça upgrade do plano pra adicionar mais.`,
      );
    }
  }
}
