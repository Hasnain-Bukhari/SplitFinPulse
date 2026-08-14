import { ConsoleLogger, ValidationPipe, type LogLevel } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import type { Environment } from "./config/environment";
import { HttpExceptionFilter } from "./http/http-exception.filter";

export function configureApplication(
  application: NestExpressApplication,
): void {
  const config = application.get(ConfigService<Environment, true>);
  const origins = config
    .get("CORS_ORIGINS", { infer: true })
    .split(",")
    .map((origin) => origin.trim());

  application.use(helmet());
  application.useBodyParser("json", { limit: "1mb" });
  application.useBodyParser("urlencoded", { extended: true, limit: "1mb" });
  application.enableCors({
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: origins,
  });
  application.setGlobalPrefix("api/v1", {
    exclude: ["health", "ready"],
  });
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  application.useGlobalFilters(new HttpExceptionFilter());
  application.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle("SplitFinPulse API")
    .setDescription(
      "Client-agnostic API for personal finance and shared expenses",
    )
    .setVersion("1.0")
    .build();
  const document = SwaggerModule.createDocument(application, openApiConfig);
  SwaggerModule.setup("api/docs", application, document, {
    jsonDocumentUrl: "api/docs-json",
    customSiteTitle: "SplitFinPulse API",
  });
}

function enabledLogLevels(level: string | undefined): LogLevel[] {
  switch (level) {
    case "debug":
      return ["debug", "verbose", "log", "warn", "error", "fatal"];
    case "warn":
      return ["warn", "error", "fatal"];
    case "error":
      return ["error", "fatal"];
    default:
      return ["log", "warn", "error", "fatal"];
  }
}

export function createLogger(): ConsoleLogger {
  return new ConsoleLogger({
    colors: false,
    json: true,
    logLevels: enabledLogLevels(process.env.LOG_LEVEL),
    prefix: "SplitFinPulse",
  });
}
