import { IsLatitude, IsLongitude, IsOptional, IsString } from "class-validator";

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

  // Preenchidos pela tela "Mais > Localização" do app (captura o GPS do
  // celular de quem está logado como dono da barbearia).
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
