import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateFuncionarioDto {
  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  comissaoPercentual?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsBoolean()
  disponivel?: boolean;
}
