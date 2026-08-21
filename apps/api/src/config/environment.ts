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
  WEB_APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  AUTH_ISSUER: string;
  AUTH_AUDIENCE: string;
  AUTH_ACCESS_SECRET: string;
  AUTH_REFRESH_SECRET: string;
  OIDC_TRANSACTION_SECRET: string;
  FRIEND_INVITE_SECRET: string;
  AUTH_ACCESS_TTL_SECONDS: number;
  AUTH_REFRESH_TTL_SECONDS: number;
  AUTH_IDLE_TTL_SECONDS: number;
  FRIEND_INVITE_TTL_SECONDS: number;
  ATTACHMENT_STORAGE_ROOT: string;
  ATTACHMENT_UPLOAD_SECRET: string;
  ATTACHMENT_MAX_BYTES: number;
  PUSH_TOKEN_SECRET: string;
  FCM_PROJECT_ID?: string;
  FCM_CLIENT_EMAIL?: string;
  FCM_PRIVATE_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
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

function positiveInteger(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(config[key] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

function secret(config: Record<string, unknown>, key: string): string {
  const value = requiredString(config, key);
  if (value.length < 32) {
    throw new Error(`${key} must contain at least 32 characters`);
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

  const webAppUrl = validUrl(
    requiredString(config, "WEB_APP_URL"),
    "WEB_APP_URL",
    ["http:", "https:"],
  );
  const googleRedirectUri = validUrl(
    requiredString(config, "GOOGLE_REDIRECT_URI"),
    "GOOGLE_REDIRECT_URI",
    ["http:", "https:"],
  );

  const fcm = [
    config.FCM_PROJECT_ID,
    config.FCM_CLIENT_EMAIL,
    config.FCM_PRIVATE_KEY,
  ];
  if (
    fcm.some(Boolean) &&
    !fcm.every((value) => typeof value === "string" && value.trim())
  ) {
    throw new Error(
      "FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY must be configured together",
    );
  }
  if (
    config.RESEND_API_KEY &&
    !(typeof config.EMAIL_FROM === "string" && config.EMAIL_FROM.trim())
  ) {
    throw new Error("EMAIL_FROM is required when RESEND_API_KEY is configured");
  }

  return {
    NODE_ENV: enumValue(config, "NODE_ENV", nodeEnvironments, "development"),
    PORT: port,
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: corsOrigins,
    LOG_LEVEL: enumValue(config, "LOG_LEVEL", logLevels, "info"),
    WEB_APP_URL: webAppUrl,
    GOOGLE_CLIENT_ID: requiredString(config, "GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: requiredString(config, "GOOGLE_CLIENT_SECRET"),
    GOOGLE_REDIRECT_URI: googleRedirectUri,
    AUTH_ISSUER: requiredString(config, "AUTH_ISSUER"),
    AUTH_AUDIENCE: requiredString(config, "AUTH_AUDIENCE"),
    AUTH_ACCESS_SECRET: secret(config, "AUTH_ACCESS_SECRET"),
    AUTH_REFRESH_SECRET: secret(config, "AUTH_REFRESH_SECRET"),
    OIDC_TRANSACTION_SECRET: secret(config, "OIDC_TRANSACTION_SECRET"),
    FRIEND_INVITE_SECRET: secret(config, "FRIEND_INVITE_SECRET"),
    AUTH_ACCESS_TTL_SECONDS: positiveInteger(
      config,
      "AUTH_ACCESS_TTL_SECONDS",
      600,
    ),
    AUTH_REFRESH_TTL_SECONDS: positiveInteger(
      config,
      "AUTH_REFRESH_TTL_SECONDS",
      2_592_000,
    ),
    AUTH_IDLE_TTL_SECONDS: positiveInteger(
      config,
      "AUTH_IDLE_TTL_SECONDS",
      604_800,
    ),
    FRIEND_INVITE_TTL_SECONDS: positiveInteger(
      config,
      "FRIEND_INVITE_TTL_SECONDS",
      604_800,
    ),
    ATTACHMENT_STORAGE_ROOT:
      typeof config.ATTACHMENT_STORAGE_ROOT === "string" &&
      config.ATTACHMENT_STORAGE_ROOT.trim()
        ? config.ATTACHMENT_STORAGE_ROOT.trim()
        : "/tmp/splitfinpulse-attachments",
    ATTACHMENT_UPLOAD_SECRET:
      typeof config.ATTACHMENT_UPLOAD_SECRET === "string" &&
      config.ATTACHMENT_UPLOAD_SECRET.trim()
        ? secret(config, "ATTACHMENT_UPLOAD_SECRET")
        : secret(config, "FRIEND_INVITE_SECRET"),
    ATTACHMENT_MAX_BYTES: positiveInteger(
      config,
      "ATTACHMENT_MAX_BYTES",
      10_485_760,
    ),
    PUSH_TOKEN_SECRET:
      typeof config.PUSH_TOKEN_SECRET === "string" &&
      config.PUSH_TOKEN_SECRET.trim()
        ? secret(config, "PUSH_TOKEN_SECRET")
        : secret(config, "FRIEND_INVITE_SECRET"),
    ...(typeof config.FCM_PROJECT_ID === "string" &&
    config.FCM_PROJECT_ID.trim()
      ? {
          FCM_PROJECT_ID: config.FCM_PROJECT_ID.trim(),
          FCM_CLIENT_EMAIL: String(config.FCM_CLIENT_EMAIL).trim(),
          FCM_PRIVATE_KEY: String(config.FCM_PRIVATE_KEY)
            .replace(/\\n/g, "\n")
            .trim(),
        }
      : {}),
    ...(typeof config.RESEND_API_KEY === "string" &&
    config.RESEND_API_KEY.trim()
      ? {
          RESEND_API_KEY: config.RESEND_API_KEY.trim(),
          EMAIL_FROM: String(config.EMAIL_FROM).trim(),
        }
      : {}),
  };
}
