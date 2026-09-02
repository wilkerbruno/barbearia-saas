import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

// O dono da barbearia cadastra a conta do funcionário (nome/e-mail/senha) —
// não existe autocadastro de funcionário, é sempre um convite feito pelo dono.
export class CreateFuncionarioDto {
  @IsString()
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  comissaoPercentual?: number;
}
