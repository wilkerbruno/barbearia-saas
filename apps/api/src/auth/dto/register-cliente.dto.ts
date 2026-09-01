import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

// Cadastro de um cliente final (quem agenda horário no app).
export class RegisterClienteDto {
  @IsString()
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  @IsOptional()
  @IsString()
  telefone?: string;
}
