import { Body, Controller, Patch } from "@nestjs/common";
import { UsuariosService } from "./usuarios.service";
import { SalvarPushTokenDto } from "./dto/salvar-push-token.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("usuarios")
export class UsuariosController {
  constructor(private usuariosService: UsuariosService) {}

  // Qualquer papel logado pode salvar o próprio token — hoje só é usado pro
  // aviso de assinatura vencendo (equipe da barbearia), mas é um dado inócuo
  // por usuário, sem motivo pra restringir por papel.
  @Patch("meu-push-token")
  salvarPushToken(@Body() dto: SalvarPushTokenDto, @CurrentUser() user: AuthUser) {
    return this.usuariosService.salvarPushToken(user.id, dto.pushToken);
  }
}
