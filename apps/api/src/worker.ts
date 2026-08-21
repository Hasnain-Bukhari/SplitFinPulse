import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createLogger } from "./application";
import { JobsService } from "./jobs/jobs.service";

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: createLogger(),
  });
  application.enableShutdownHooks();
  const jobs = application.get(JobsService);
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  while (!stopped) {
    const processed = await jobs.runNext();
    if (!processed) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await application.close();
}

void bootstrap();
