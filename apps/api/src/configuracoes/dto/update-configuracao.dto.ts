import { IsInt, IsOptional, Min } from "class-validator";

export class UpdateConfiguracaoDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  diasTesteGratis?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  horasCarenciaAposVencimento?: number;
}
