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
import { AgendamentosService } from "../agendamentos/agendamentos.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("barbearias")
export class BarbeariasController {
  constructor(
    private barbeariasService: BarbeariasService,
    private agendamentosService: AgendamentosService,
  ) {}

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

  // Público: dias do mês com pelo menos um horário livre pra duração total dos
  // serviços escolhidos — alimenta o calendário da tela de agendamento.
  // mes no formato "YYYY-MM".
  @Public()
  @Get(":id/dias-disponiveis")
  diasDisponiveis(
    @Param("id") id: string,
    @Query("mes") mes: string,
    @Query("duracaoMinutos") duracaoMinutos?: string,
  ) {
    const [ano, mesNum] = (mes ?? "").split("-").map(Number);
    if (!ano || !mesNum) throw new BadRequestException("Informe o parâmetro mes no formato YYYY-MM.");
    return this.agendamentosService.listarDiasDisponiveis(id, ano, mesNum, Number(duracaoMinutos) || 30);
  }

  // Público: horários livres (formato "HH:mm") num dia específico, pra duração
  // total dos serviços escolhidos. data no formato "YYYY-MM-DD".
  @Public()
  @Get(":id/horarios-disponiveis")
  horariosDisponiveis(
    @Param("id") id: string,
    @Query("data") data: string,
    @Query("duracaoMinutos") duracaoMinutos?: string,
    @Query("funcionarioId") funcionarioId?: string,
  ) {
    if (!data) throw new BadRequestException("Informe o parâmetro data no formato YYYY-MM-DD.");
    return this.agendamentosService.listarHorariosDisponiveis(id, data, Number(duracaoMinutos) || 30, funcionarioId);
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
