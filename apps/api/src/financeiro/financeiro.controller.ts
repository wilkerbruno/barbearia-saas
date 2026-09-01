import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { Papel } from "@barbearia-saas/shared";
import { FinanceiroService } from "./financeiro.service";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("financeiro")
export class FinanceiroController {
  constructor(private financeiroService: FinanceiroService) {}

  @Roles(Papel.FUNCIONARIO)
  @Get("meu-resumo")
  meuResumo(@CurrentUser() user: AuthUser, @Query("periodo") periodo: "hoje" | "semana" | "mes" = "semana") {
    return this.financeiroService.resumoFuncionario(user.id, periodo);
  }

  @Roles(Papel.BARBEARIA_ADMIN)
  @Get("resumo-barbearia")
  resumoBarbearia(@CurrentUser() user: AuthUser, @Query("periodo") periodo: "hoje" | "semana" | "mes" = "semana") {
    if (!user.barbeariaId) throw new ForbiddenException("Usuário sem barbearia associada.");
    return this.financeiroService.resumoBarbearia(user.barbeariaId, periodo);
  }
}
