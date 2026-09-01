import { IsOptional, IsString } from "class-validator";

export class UpdateBarbeariaDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  endereco?: string;

  @IsOptional()
  @IsString()
  telefone?: string;
}
