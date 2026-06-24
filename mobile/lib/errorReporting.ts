import * as Sentry from "@sentry/react-native";
import { APP_NAME } from "@/constants";

type ErrorContext = Record<string, unknown>;

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
let sentryReady = false;

export function initErrorReporting() {
  if (!SENTRY_DSN || sentryReady) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
  });
  sentryReady = true;
}

const recentErrors: Array<{ message: string; at: string; context?: ErrorContext }> = [];

export function captureError(error: unknown, context?: ErrorContext) {
  const message = error instanceof Error ? error.message : String(error);
  const entry = { message, at: new Date().toISOString(), context };
  recentErrors.unshift(entry);
  if (recentErrors.length > 20) recentErrors.pop();

  if (sentryReady) {
    Sentry.captureException(error, { extra: context });
  }

  if (__DEV__) {
    console.error(`[${APP_NAME}]`, message, context ?? "", error);
  }
}

export function captureMessage(message: string, context?: ErrorContext) {
  if (sentryReady) {
    Sentry.captureMessage(message, { extra: context });
  }

  if (__DEV__) {
    console.log(`[${APP_NAME}]`, message, context ?? "");
  }
}

export function getRecentErrors() {
  return recentErrors;
}
