import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { Papel, StatusAssinatura } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterClienteDto } from "./dto/register-cliente.dto";
import { RegisterBarbeariaDto } from "./dto/register-barbearia.dto";

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas após normalize NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private async assinarToken(usuario: { id: string; papel: Papel; barbeariaId: string | null }) {
    const token = await this.jwt.signAsync({
      sub: usuario.id,
      papel: usuario.papel,
      barbeariaId: usuario.barbeariaId,
    });
    return { accessToken: token };
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (!usuario) throw new UnauthorizedException("E-mail ou senha inválidos.");

    const senhaValida = await bcrypt.compare(dto.senha, usuario.senhaHash);
    if (!senhaValida) throw new UnauthorizedException("E-mail ou senha inválidos.");

    const { senhaHash, ...usuarioSemSenha } = usuario;
    return {
      usuario: usuarioSemSenha,
      ...(await this.assinarToken(usuario)),
    };
  }

  async registerCliente(dto: RegisterClienteDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    const senhaHash = await bcrypt.hash(dto.senha, 10);
    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senhaHash,
        telefone: dto.telefone,
        papel: Papel.CLIENTE,
      },
    });

    const { senhaHash: _, ...usuarioSemSenha } = usuario;
    return { usuario: usuarioSemSenha, ...(await this.assinarToken(usuario)) };
  }

  // Onboarding do SaaS: cria a barbearia (tenant), o usuário dono e a assinatura
  // inicial em modo TRIAL. É aqui que a barbearia "vira cliente" da plataforma.
  async registerBarbearia(dto: RegisterBarbeariaDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    const plano = await this.prisma.plano.findUnique({ where: { id: dto.planoId } });
    if (!plano) throw new ConflictException("Plano informado não existe.");

    const slugBase = slugify(dto.nomeBarbearia);
    let slug = slugBase;
    let tentativa = 1;
    while (await this.prisma.barbearia.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${++tentativa}`;
    }

    const senhaHash = await bcrypt.hash(dto.senha, 10);

    const resultado = await this.prisma.$transaction(async (tx) => {
      const barbearia = await tx.barbearia.create({
        data: { nome: dto.nomeBarbearia, slug },
      });

      const dono = await tx.usuario.create({
        data: {
          nome: dto.nomeDono,
          email: dto.email,
          senhaHash,
          papel: Papel.BARBEARIA_ADMIN,
          barbeariaId: barbearia.id,
        },
      });

      const trialAte = new Date();
      trialAte.setDate(trialAte.getDate() + 14);

      await tx.assinatura.create({
        data: {
          barbeariaId: barbearia.id,
          planoId: plano.id,
          status: StatusAssinatura.TRIAL,
          proximaCobrancaEm: trialAte,
        },
      });

      return { barbearia, dono };
    });

    const { senhaHash: _, ...usuarioSemSenha } = resultado.dono;
    return {
      barbearia: resultado.barbearia,
      usuario: usuarioSemSenha,
      ...(await this.assinarToken(resultado.dono)),
    };
  }
}
