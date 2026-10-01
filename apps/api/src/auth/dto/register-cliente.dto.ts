import { IsEmail, IsString, MinLength } from "class-validator";

// Cadastro de um cliente final (quem agenda horário no app).
export class RegisterClienteDto {
  @IsString()
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  // Obrigatório: é o número que a barbearia usa pra ligar em caso de
  // imprevisto (ver botão "Ligar para o cliente" na agenda — AgendaScreen).
  @IsString()
  @MinLength(8)
  telefone: string;
}
