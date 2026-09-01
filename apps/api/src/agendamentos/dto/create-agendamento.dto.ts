import { IsDateString, IsOptional, IsString, ValidateIf } from "class-validator";

// O cliente escolhe OU um serviço avulso OU um pacote — nunca os dois.
export class CreateAgendamentoDto {
  @IsString()
  funcionarioId: string;

  @ValidateIf((dto) => !dto.pacoteId)
  @IsString()
  servicoId?: string;

  @ValidateIf((dto) => !dto.servicoId)
  @IsString()
  pacoteId?: string;

  @IsDateString()
  inicio: string;
}
