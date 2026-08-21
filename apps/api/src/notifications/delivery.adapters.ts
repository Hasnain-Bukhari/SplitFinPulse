import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export type DeliveryResult =
  | { status: "SENT"; providerMessageId: string }
  | { status: "RETRY"; code: string }
  | { status: "INVALID"; code: string };

export class FcmPushAdapter {
  private readonly app?: App;
  constructor(config?: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  }) {
    if (config) {
      this.app = getApps()[0] ?? initializeApp({ credential: cert(config) });
    }
  }
  get available(): boolean {
    return Boolean(this.app);
  }
  async send(token: string, notificationId: string): Promise<DeliveryResult> {
    if (!this.app) return { status: "RETRY", code: "PROVIDER_UNAVAILABLE" };
    try {
      const id = await getMessaging(this.app).send({
        token,
        notification: {
          title: "SplitFinPulse",
          body: "You have a SplitFinPulse update",
        },
        data: { notificationId },
      });
      return { status: "SENT", providerMessageId: id };
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "FCM_SEND_FAILED";
      return code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token")
        ? { status: "INVALID", code: "FCM_TOKEN_INVALID" }
        : { status: "RETRY", code: "FCM_SEND_FAILED" };
    }
  }
}

export class ResendEmailAdapter {
  constructor(
    private readonly apiKey?: string,
    private readonly from?: string,
  ) {}
  get available(): boolean {
    return Boolean(this.apiKey && this.from);
  }
  async send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<DeliveryResult> {
    if (!this.available)
      return { status: "RETRY", code: "PROVIDER_UNAVAILABLE" };
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject,
          text,
          html,
        }),
      });
      if (response.ok) {
        const body = (await response.json()) as { id?: string };
        return { status: "SENT", providerMessageId: body.id ?? "resend" };
      }
      return response.status >= 400 && response.status < 500
        ? { status: "INVALID", code: "EMAIL_DESTINATION_INVALID" }
        : { status: "RETRY", code: "EMAIL_SEND_FAILED" };
    } catch {
      return { status: "RETRY", code: "EMAIL_SEND_FAILED" };
    }
  }
}
