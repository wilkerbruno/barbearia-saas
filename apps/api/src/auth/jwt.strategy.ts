import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Papel } from "@barbearia-saas/shared";

export interface JwtPayload {
  sub: string; // id do usuário
  papel: Papel;
  barbeariaId: string | null;
}

export interface AuthUser {
  id: string;
  papel: Papel;
  barbeariaId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "dev-secret",
    });
  }

  // O retorno aqui vira `request.user` (lido pelo @CurrentUser()).
  async validate(payload: JwtPayload): Promise<AuthUser> {
    return { id: payload.sub, papel: payload.papel, barbeariaId: payload.barbeariaId };
  }
}
