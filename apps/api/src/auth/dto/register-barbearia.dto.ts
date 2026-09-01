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

  @IsString()
  planoId: string;
}
