import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { AgendamentosService } from "./agendamentos.service";
import { CreateAgendamentoDto } from "./dto/create-agendamento.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("agendamentos")
export class AgendamentosController {
  constructor(private agendamentosService: AgendamentosService) {}

  @Roles(Papel.CLIENTE)
  @Post()
  criar(@Body() dto: CreateAgendamentoDto, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.criar(user.id, dto);
  }

  @Roles(Papel.CLIENTE)
  @Get("meus")
  listarMeus(@CurrentUser() user: AuthUser) {
    return this.agendamentosService.listarMeusComoCliente(user.id);
  }

  // Agenda do próprio funcionário logado. ?data=2026-08-31 filtra o dia inteiro.
  @Roles(Papel.FUNCIONARIO)
  @Get("minha-agenda")
  minhaAgenda(@CurrentUser() user: AuthUser, @Query("data") data?: string) {
    const { inicio, fim } = this.parseIntervaloDia(data);
    return this.agendamentosService.listarAgendaFuncionario(user.id, inicio, fim);
  }

  // Agenda geral da barbearia (dono). ?funcionarioId filtra por profissional.
  @Roles(Papel.BARBEARIA_ADMIN)
  @Get("agenda-barbearia")
  agendaBarbearia(@CurrentUser() user: AuthUser, @Query("data") data?: string, @Query("funcionarioId") funcionarioId?: string) {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    const { inicio, fim } = this.parseIntervaloDia(data);
    return this.agendamentosService.listarAgendaBarbearia(user.barbeariaId, inicio, fim, funcionarioId);
  }

  @Patch(":id/cancelar")
  cancelar(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.cancelar(id, user);
  }

  @Patch(":id/concluir")
  concluir(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.concluir(id, user);
  }

  private parseIntervaloDia(data?: string): { inicio?: Date; fim?: Date } {
    if (!data) return {};
    const inicio = new Date(`${data}T00:00:00`);
    const fim = new Date(`${data}T23:59:59.999`);
    return { inicio, fim };
  }
}
