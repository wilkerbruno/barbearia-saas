import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

// "Perfil" no menu de cliente/funcionário/dono — cada um edita os próprios
// dados cadastrais básicos. O telefone é aceito aqui pra CLIENTE e
// BARBEARIA_ADMIN; pra FUNCIONARIO, UsuariosService.atualizarMeuPerfil recusa
// a mudança (só o dono da barbearia edita o telefone de um funcionário, pela
// tela Equipe — ver FuncionariosService.atualizar).
export class UpdateMeuPerfilDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  telefone?: string;
}
