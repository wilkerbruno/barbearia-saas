import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  // Sobrescreve o token de push do usuário logado (último aparelho em que
  // entrou é o que recebe notificação — ver comentário do campo no schema).
  async salvarPushToken(usuarioId: string, pushToken: string) {
    await this.prisma.usuario.update({ where: { id: usuarioId }, data: { pushToken } });
    return { ok: true };
  }
}
