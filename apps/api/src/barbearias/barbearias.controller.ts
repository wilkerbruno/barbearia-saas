import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { BarbeariasService } from "./barbearias.service";
import { UpdateBarbeariaDto } from "./dto/update-barbearia.dto";
import { CreateAvaliacaoDto } from "./dto/create-avaliacao.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("barbearias")
export class BarbeariasController {
  constructor(private barbeariasService: BarbeariasService) {}

  // Painel SaaS: lista todas as barbearias assinantes da plataforma.
  @Roles(Papel.SAAS_ADMIN)
  @Get()
  listarTodas() {
    return this.barbeariasService.listarTodas();
  }

  // Público: tela "Perto de você" do app do cliente. Precisa vir ANTES de
  // ":id" pra não ser interpretada como um id de barbearia.
  @Public()
  @Get("proximas")
  listarProximas(@Query("lat") lat: string, @Query("lng") lng: string, @Query("raioKm") raioKm?: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (lat === undefined || lng === undefined || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException("Informe os parâmetros lat e lng.");
    }
    return this.barbeariasService.listarProximas(latitude, longitude, raioKm ? Number(raioKm) : undefined);
  }

  // Público: dados mínimos pra Home do app do cliente (nome, endereço, estrelas).
  @Public()
  @Get(":id/publico")
  buscarInfoPublica(@Param("id") id: string) {
    return this.barbeariasService.buscarInfoPublica(id);
  }

  @Get(":id")
  buscarPorId(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    this.garantirAcesso(id, user);
    return this.barbeariasService.buscarPorId(id);
  }

  // Público: usado pelo app do cliente no passo "Escolher profissional".
  @Public()
  @Get(":id/funcionarios")
  listarFuncionarios(@Param("id") id: string) {
    return this.barbeariasService.listarFuncionariosPublico(id);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: UpdateBarbeariaDto, @CurrentUser() user: AuthUser) {
    this.garantirAcesso(id, user);
    return this.barbeariasService.atualizar(id, dto);
  }

  // Público: estrelas + comentários de quem já avaliou (tela de detalhe da barbearia).
  @Public()
  @Get(":id/avaliacoes")
  listarAvaliacoes(@Param("id") id: string) {
    return this.barbeariasService.listarAvaliacoes(id);
  }

  // Cliente avalia (ou atualiza a própria avaliação) uma barbearia.
  @Roles(Papel.CLIENTE)
  @Post(":id/avaliacoes")
  avaliar(@Param("id") id: string, @Body() dto: CreateAvaliacaoDto, @CurrentUser() user: AuthUser) {
    return this.barbeariasService.avaliar(id, user.id, dto);
  }

  // Cliente logado busca a própria avaliação (pra pré-preencher as estrelas).
  @Roles(Papel.CLIENTE)
  @Get(":id/avaliacoes/minha")
  buscarMinhaAvaliacao(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.barbeariasService.buscarMinhaAvaliacao(id, user.id);
  }

  // Um BARBEARIA_ADMIN só pode ler/editar a própria barbearia; SAAS_ADMIN pode ver qualquer uma.
  private garantirAcesso(barbeariaId: string, user: AuthUser) {
    if (user.papel === Papel.SAAS_ADMIN) return;
    if (user.barbeariaId !== barbeariaId) {
      throw new ForbiddenException("Você não tem acesso a esta barbearia.");
    }
  }
}
