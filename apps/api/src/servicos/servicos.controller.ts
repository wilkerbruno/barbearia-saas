import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { ServicosService } from "./servicos.service";
import { CreateServicoDto } from "./dto/create-servico.dto";
import { UpdateServicoDto } from "./dto/update-servico.dto";
import { CreatePacoteDto } from "./dto/create-pacote.dto";
import { UpdatePacoteDto } from "./dto/update-pacote.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller()
export class ServicosController {
  constructor(private servicosService: ServicosService) {}

  // ---------- Catálogo público: o app do cliente navega pelo id/slug da barbearia ----------

  @Public()
  @Get("barbearias/:barbeariaId/servicos")
  listarServicos(@Param("barbeariaId") barbeariaId: string) {
    return this.servicosService.listarServicosDaBarbearia(barbeariaId);
  }

  @Public()
  @Get("barbearias/:barbeariaId/pacotes")
  listarPacotes(@Param("barbeariaId") barbeariaId: string) {
    return this.servicosService.listarPacotesDaBarbearia(barbeariaId);
  }

  // ---------- Gestão: só o dono da barbearia mexe no próprio catálogo ----------

  @Roles(Papel.BARBEARIA_ADMIN)
  @Post("servicos")
  criarServico(@Body() dto: CreateServicoDto, @CurrentUser() user: AuthUser) {
    return this.servicosService.criarServico(user.barbeariaId!, dto);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Patch("servicos/:id")
  atualizarServico(@Param("id") id: string, @Body() dto: UpdateServicoDto, @CurrentUser() user: AuthUser) {
    return this.servicosService.atualizarServico(id, user.barbeariaId!, dto);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Delete("servicos/:id")
  removerServico(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.servicosService.removerServico(id, user.barbeariaId!);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Post("pacotes")
  criarPacote(@Body() dto: CreatePacoteDto, @CurrentUser() user: AuthUser) {
    return this.servicosService.criarPacote(user.barbeariaId!, dto);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Patch("pacotes/:id")
  atualizarPacote(@Param("id") id: string, @Body() dto: UpdatePacoteDto, @CurrentUser() user: AuthUser) {
    return this.servicosService.atualizarPacote(id, user.barbeariaId!, dto);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Delete("pacotes/:id")
  removerPacote(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.servicosService.removerPacote(id, user.barbeariaId!);
  }
}
