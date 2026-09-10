import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { StatusAgendamento } from "@barbearia-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { UpdateBarbeariaDto } from "./dto/update-barbearia.dto";
import { CreateAvaliacaoDto } from "./dto/create-avaliacao.dto";

// Campos seguros para expor sem autenticação (busca de proximidade, tela
// pública "sobre a barbearia" etc). Nunca inclua e-mail/telefone de usuários
// nem dados de assinatura/faturamento aqui. mercadoPagoPublicKey é a chave
// PÚBLICA usada pra tokenizar cartão direto no aparelho do cliente (ver
// CartaoScreen) — ao contrário do access token, é seguro expor. Vem do banco
// só por compatibilidade; na prática quase sempre é substituída pela chave
// da própria aplicação (ver comChavePublicaResolvida abaixo).
const SELECT_PUBLICO = {
  id: true,
  nome: true,
  endereco: true,
  telefone: true,
  latitude: true,
  longitude: true,
  logoUrl: true,
  notaMedia: true,
  totalAvaliacoes: true,
  mercadoPagoPublicKey: true,
} as const;

// Tamanho máximo aceito pro arquivo de logo enviado (antes de comprimir).
const TAMANHO_MAXIMO_LOGO_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class BarbeariasService {
  constructor(
    private prisma: PrismaService,
    private mercadoPago: MercadoPagoService,
  ) {}

  // O Mercado Pago nem sempre devolve a public_key da conta conectada no
  // OAuth (ver MercadoPagoService.trocarCodigoPorToken) — como a tokenização
  // de cartão não depende de quem vai receber o dinheiro, cai pra chave da
  // própria aplicação (MERCADOPAGO_PUBLIC_KEY) sempre que a da barbearia não
  // veio, em vez de deixar o cliente sem poder pagar com cartão.
  private comChavePublicaResolvida<T extends { mercadoPagoPublicKey: string | null }>(barbearia: T): T {
    return { ...barbearia, mercadoPagoPublicKey: barbearia.mercadoPagoPublicKey ?? this.mercadoPago.publicKeyPlataforma };
  }

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
      include: {
        assinatura: { include: { plano: true, faturas: { orderBy: { vencimentoEm: "desc" }, take: 12 } } },
        funcionarios: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      },
    });
    if (!barbearia) throw new NotFoundException("Barbearia não encontrada.");
    return barbearia;
  }

  // Público: dados mínimos para a Home do app do cliente (nome, endereço, estrelas).
  async buscarInfoPublica(id: string) {
    const barbearia = await this.prisma.barbearia.findUnique({ where: { id }, select: SELECT_PUBLICO });
    if (!barbearia) throw new NotFoundException("Barbearia não encontrada.");
    return {
      ...this.comChavePublicaResolvida(barbearia),
      // TEMP — diagnóstico pra confirmar se MERCADOPAGO_PUBLIC_KEY está
      // chegando no servidor. Não expõe o valor, só se está definida ou não.
      // Remover depois de confirmar.
      _debugMpPublicKeyPlataformaDefinida: this.mercadoPago.publicKeyPlataforma != null,
    };
  }

  atualizar(id: string, dto: UpdateBarbeariaDto) {
    return this.prisma.barbearia.update({ where: { id }, data: dto });
  }

  // Recebe o arquivo de logo enviado pelo dono (registro da barbearia ou
  // Mais > Logo), redimensiona/comprime com sharp e guarda como data URL
  // (base64) direto no banco — ver comentário do campo logoUrl no schema.
  async atualizarLogo(id: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Envie um arquivo de imagem no campo "logo".');
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("O arquivo enviado precisa ser uma imagem.");
    }
    if (file.size > TAMANHO_MAXIMO_LOGO_BYTES) {
      throw new BadRequestException("A imagem enviada é muito grande (máximo 5MB).");
    }

    let comprimida: Buffer;
    try {
      comprimida = await sharp(file.buffer)
        .rotate() // aplica a orientação EXIF (fotos tiradas na vertical no celular) antes de cortar
        .resize(512, 512, { fit: "cover" })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException("Não foi possível processar essa imagem. Tente outro arquivo.");
    }

    const logoUrl = `data:image/jpeg;base64,${comprimida.toString("base64")}`;
    return this.prisma.barbearia.update({
      where: { id },
      data: { logoUrl },
      select: { id: true, logoUrl: true },
    });
  }

  // Público: o app do cliente usa isso para montar a lista de profissionais
  // no passo "Escolher profissional" do agendamento.
  listarFuncionariosPublico(barbeariaId: string) {
    return this.prisma.funcionario.findMany({
      where: { barbeariaId, ativo: true, disponivel: true },
      include: { usuario: { select: { id: true, nome: true } } },
    });
  }

  // Home do app do cliente. Busca as barbearias com localização cadastrada
  // dentro do raio (fórmula de Haversine, em memória — sem depender de
  // extensão geoespacial do MySQL, suficiente pro volume de um SaaS ainda
  // pequeno), com filtro opcional por nome, e ordena colocando à frente:
  // 1) barbearias onde o cliente já teve algum agendamento; 2) as com melhor
  // nota média; 3) desempate por distância.
  async listarProximas(latitude: number, longitude: number, raioKm = 15, nome?: string, clienteId?: string) {
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException("Informe latitude e longitude válidas.");
    }

    const [candidatas, agendamentosDoCliente] = await Promise.all([
      this.prisma.barbearia.findMany({
        where: {
          latitude: { not: null },
          longitude: { not: null },
          ...(nome ? { nome: { contains: nome } } : {}),
        },
        select: SELECT_PUBLICO,
      }),
      clienteId
        ? this.prisma.agendamento.findMany({
            where: { clienteId },
            select: { barbeariaId: true },
            distinct: ["barbeariaId"],
          })
        : Promise.resolve([]),
    ]);

    const idsJaAgendados = new Set(agendamentosDoCliente.map((a) => a.barbeariaId));

    return candidatas
      .map((barbearia) => ({
        ...this.comChavePublicaResolvida(barbearia),
        distanciaKm: distanciaHaversineKm(latitude, longitude, barbearia.latitude!, barbearia.longitude!),
        jaAgendou: idsJaAgendados.has(barbearia.id),
      }))
      .filter((barbearia) => barbearia.distanciaKm <= raioKm)
      .sort((a, b) => {
        if (a.jaAgendou !== b.jaAgendou) return a.jaAgendou ? -1 : 1;
        if (b.notaMedia !== a.notaMedia) return b.notaMedia - a.notaMedia;
        return a.distanciaKm - b.distanciaKm;
      });
  }

  // Cliente avalia (ou atualiza a própria avaliação) uma barbearia. Depois de
  // gravar, recalcula a média/contagem cacheadas em Barbearia.notaMedia e
  // Barbearia.totalAvaliacoes, usadas em toda listagem (evita agregar a tabela
  // Avaliacao inteira toda vez que alguém abre a lista de barbearias).
  async avaliar(barbeariaId: string, clienteId: string, dto: CreateAvaliacaoDto) {
    const barbearia = await this.prisma.barbearia.findUnique({ where: { id: barbeariaId } });
    if (!barbearia) throw new NotFoundException("Barbearia não encontrada.");

    if (!(await this.clienteJaFoiAtendido(barbeariaId, clienteId))) {
      throw new ForbiddenException(
        "Você só pode avaliar depois que o horário do seu atendimento nessa barbearia passar.",
      );
    }

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

    const atualizada = await this.prisma.barbearia.update({
      where: { id: barbeariaId },
      data: {
        notaMedia: agregado._avg.nota ?? 0,
        totalAvaliacoes: agregado._count.nota,
      },
      select: SELECT_PUBLICO,
    });
    return this.comChavePublicaResolvida(atualizada);
  }

  // Lista as avaliações (com comentário) de uma barbearia, mais recentes primeiro.
  listarAvaliacoes(barbeariaId: string) {
    return this.prisma.avaliacao.findMany({
      where: { barbeariaId },
      orderBy: { criadoEm: "desc" },
      include: { cliente: { select: { id: true, nome: true } } },
    });
  }

  // Avaliação que o próprio cliente logado já fez (se houver), mais se ele já
  // pode avaliar — usado pra pré-preencher as estrelas e pra decidir se o
  // formulário de avaliação aparece (só depois de um atendimento concluído).
  async buscarMinhaAvaliacao(barbeariaId: string, clienteId: string) {
    const [avaliacao, podeAvaliar] = await Promise.all([
      this.prisma.avaliacao.findUnique({ where: { barbeariaId_clienteId: { barbeariaId, clienteId } } }),
      this.clienteJaFoiAtendido(barbeariaId, clienteId),
    ]);
    return { avaliacao, podeAvaliar };
  }

  // Um cliente só pode avaliar uma barbearia depois que o horário de algum
  // agendamento dele lá já tiver passado (não vale cancelado, nem um horário
  // ainda futuro) — é isso que "libera" o formulário de avaliação no app.
  private async clienteJaFoiAtendido(barbeariaId: string, clienteId: string): Promise<boolean> {
    const total = await this.prisma.agendamento.count({
      where: {
        barbeariaId,
        clienteId,
        fim: { lt: new Date() },
        status: { not: StatusAgendamento.CANCELADO },
      },
    });
    return total > 0;
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
