import { IsArray, IsInt, IsOptional, IsPositive, IsString } from "class-validator";

export class CreatePlanoDto {
  @IsString()
  nome: string;

  // Preço da mensalidade em centavos. Ex: R$ 129,00 = 12900.
  @IsInt()
  @IsPositive()
  precoCentavos: number;

  @IsOptional()
  @IsInt()
  limiteFuncionarios?: number; // omitido = ilimitado

  @IsArray()
  @IsString({ each: true })
  recursos: string[];
}
