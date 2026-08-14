export const nodeEnvironments = ["development", "test", "production"] as const;
export const logLevels = ["debug", "info", "warn", "error"] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];
export type LogLevel = (typeof logLevels)[number];

export interface Environment {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  CORS_ORIGINS: string;
  LOG_LEVEL: LogLevel;
}

function requiredString(config: Record<string, unknown>, key: string): string {
  const value = config[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }

  return value.trim();
}

function enumValue<T extends string>(
  config: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = config[key] ?? fallback;

  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  }

  return value as T;
}

function validUrl(
  value: string,
  key: string,
  protocols: readonly string[],
): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${key} must use one of: ${protocols.join(", ")}`);
  }

  return value;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const rawPort = config.PORT ?? "3000";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const databaseUrl = validUrl(
    requiredString(config, "DATABASE_URL"),
    "DATABASE_URL",
    ["postgresql:", "postgres:"],
  );
  const corsOrigins = requiredString(config, "CORS_ORIGINS");

  for (const origin of corsOrigins.split(",").map((item) => item.trim())) {
    validUrl(origin, "CORS_ORIGINS", ["http:", "https:"]);
  }

  return {
    NODE_ENV: enumValue(config, "NODE_ENV", nodeEnvironments, "development"),
    PORT: port,
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: corsOrigins,
    LOG_LEVEL: enumValue(config, "LOG_LEVEL", logLevels, "info"),
  };
}
