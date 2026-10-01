import { IsEmail, IsString, MinLength } from "class-validator";

// Onboarding de uma nova barbearia no SaaS: cria o tenant (Barbearia) +
// o usuário dono (papel BARBEARIA_ADMIN) + assinatura em TRIAL no plano informado.
export class RegisterBarbeariaDto {
  @IsString()
  nomeBarbearia: string;

  @IsString()
  nomeDono: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  // Vira tanto o telefone pessoal do dono (Usuario.telefone) quanto o
  // telefone de contato da barbearia (Barbearia.telefone, mostrado pro
  // cliente no botão "Ligar para a barbearia" — ver AuthService.registerBarbearia).
  @IsString()
  @MinLength(8)
  telefone: string;

  @IsString()
  planoId: string;
}
