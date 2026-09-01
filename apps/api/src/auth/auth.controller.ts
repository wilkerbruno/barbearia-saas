import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterClienteDto } from "./dto/register-cliente.dto";
import { RegisterBarbeariaDto } from "./dto/register-barbearia.dto";
import { Public } from "../common/decorators/public.decorator";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post("registrar-cliente")
  registerCliente(@Body() dto: RegisterClienteDto) {
    return this.authService.registerCliente(dto);
  }

  // Onboarding de uma nova barbearia assinante do SaaS.
  @Public()
  @Post("registrar-barbearia")
  registerBarbearia(@Body() dto: RegisterBarbeariaDto) {
    return this.authService.registerBarbearia(dto);
  }
}
