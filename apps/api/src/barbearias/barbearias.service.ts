import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateBarbeariaDto } from "./dto/update-barbearia.dto";
import { CreateAvaliacaoDto } from "./dto/create-avaliacao.dto";

// Campos seguros para expor sem autenticação (busca de proximidade, tela
// pública "sobre a barbearia" etc). Nunca inclua e-mail/telefone de usuários
// nem dados de assinatura/faturamento aqui.
const SELECT_PUBLICO = {
  id: true,
  nome: true,
  endereco: true,
  telefone: true,
  latitude: true,
  longitude: true,
  notaMedia: true,
  totalAvaliacoes: true,
} as const;

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

  // Público: dados mínimos para a Home do app do cliente (nome, endereço, estrelas).
  async buscarInfoPublica(id: string) {
    const barbearia = await this.prisma.barbearia.findUnique({ where: { id }, select: SELECT_PUBLICO });
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

  // Público: usado pela tela "Perto de você" do app do cliente. Busca todas as
  // barbearias com localização cadastrada e calcula a distância até o ponto
  // informado (fórmula de Haversine, em memória — sem depender de extensão
  // geoespacial do MySQL, o que é suficiente pro volume de um SaaS ainda pequeno).
  async listarProximas(latitude: number, longitude: number, raioKm = 15) {
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException("Informe latitude e longitude válidas.");
    }

    const candidatas = await this.prisma.barbearia.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: SELECT_PUBLICO,
    });

    return candidatas
      .map((barbearia) => ({
        ...barbearia,
        distanciaKm: distanciaHaversineKm(latitude, longitude, barbearia.latitude!, barbearia.longitude!),
      }))
      .filter((barbearia) => barbearia.distanciaKm <= raioKm)
      .sort((a, b) => a.distanciaKm - b.distanciaKm);
  }

  // Cliente avalia (ou atualiza a própria avaliação) uma barbearia. Depois de
  // gravar, recalcula a média/contagem cacheadas em Barbearia.notaMedia e
  // Barbearia.totalAvaliacoes, usadas em toda listagem (evita agregar a tabela
  // Avaliacao inteira toda vez que alguém abre a lista de barbearias).
  async avaliar(barbeariaId: string, clienteId: string, dto: CreateAvaliacaoDto) {
    const barbearia = await this.prisma.barbearia.findUnique({ where: { id: barbeariaId } });
    if (!barbearia) throw new NotFoundException("Barbearia não encontrada.");

    await this.prisma.avaliacao.upsert({
      where: { barbeariaId_clienteId: { barbeariaId, clienteId } },
      update: { nota: dto.nota, comentario: dto.comentario },
      create: { barbeariaId, clienteId, nota: dto.nota, comentario: dto.comentario },
    });

    const agregado = await this.prisma.avaliacao.aggregate({
      where: { barbeariaId },
      _avg: { nota: true },
      _count: { nota: true },
    });

    return this.prisma.barbearia.update({
      where: { id: barbeariaId },
      data: {
        notaMedia: agregado._avg.nota ?? 0,
        totalAvaliacoes: agregado._count.nota,
      },
      select: SELECT_PUBLICO,
    });
  }

  // Lista as avaliações (com comentário) de uma barbearia, mais recentes primeiro.
  listarAvaliacoes(barbeariaId: string) {
    return this.prisma.avaliacao.findMany({
      where: { barbeariaId },
      orderBy: { criadoEm: "desc" },
      include: { cliente: { select: { id: true, nome: true } } },
    });
  }

  // Avaliação que o próprio cliente logado já fez (se houver) — usado pra
  // pré-preencher as estrelas quando ele reabre a tela de avaliação.
  buscarMinhaAvaliacao(barbeariaId: string, clienteId: string) {
    return this.prisma.avaliacao.findUnique({
      where: { barbeariaId_clienteId: { barbeariaId, clienteId } },
    });
  }
}

// Distância em linha reta entre duas coordenadas (km). Precisão de sobra pra
// filtrar barbearias "perto de você" num raio de alguns km.
function distanciaHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = grausParaRad(lat2 - lat1);
  const dLon = grausParaRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(grausParaRad(lat1)) * Math.cos(grausParaRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function grausParaRad(graus: number): number {
  return (graus * Math.PI) / 180;
}
