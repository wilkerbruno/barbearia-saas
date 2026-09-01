import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors(); // em produção, restrinja para os domínios do app mobile/admin.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos que não existem no DTO
      transform: true, // converte payloads JSON pros tipos dos DTOs
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix("api");

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API rodando em http://localhost:${port}/api`);
}
bootstrap();
