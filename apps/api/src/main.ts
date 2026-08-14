import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApplication, createLogger } from "./application";
import type { Environment } from "./config/environment";

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create<NestExpressApplication>(
    AppModule,
    {
      logger: createLogger(),
    },
  );
  configureApplication(application);

  const config = application.get(ConfigService<Environment, true>);
  await application.listen(config.get("PORT", { infer: true }), "0.0.0.0");
}

void bootstrap();
