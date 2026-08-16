import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      WEB_APP_URL: "http://localhost:5173",
      GOOGLE_CLIENT_ID: "test-google-client",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/v1/auth/google/callback",
      AUTH_ISSUER: "splitfinpulse-test",
      AUTH_AUDIENCE: "splitfinpulse-web-test",
      AUTH_ACCESS_SECRET: "test-access-secret-with-at-least-32-characters",
      AUTH_REFRESH_SECRET: "test-refresh-secret-with-at-least-32-characters",
      OIDC_TRANSACTION_SECRET: "test-oidc-secret-with-at-least-32-characters",
      FRIEND_INVITE_SECRET: "test-invite-secret-with-at-least-32-characters",
    },
    environment: "node",
    include: ["src/**/*.spec.ts"],
    mockReset: true,
  },
});
