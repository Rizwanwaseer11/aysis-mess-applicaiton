import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { createDeviceSession } from "./session";

export const origin = (
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? "https://z0p76k6m-4000.inc1.devtunnels.ms/" : "")
).replace(/\/$/, "");
const session = createDeviceSession({
  read: () => SecureStore.getItemAsync("device-token"),
  write: (value) => SecureStore.setItemAsync("device-token", value),
  remove: () => SecureStore.deleteItemAsync("device-token"),
});

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function photoSource(path: string) {
  if (
    !/^\/api\/v1\/scanner\/employees\/[a-f0-9-]+\/photo\?size=thumbnail&v=/.test(
      path,
    )
  )
    throw new Error("Invalid employee photo path");
  return {
    uri: origin + path,
    headers: { Authorization: `Device ${session.snapshot().token}` },
  };
}
export const restoreSession = session.restore;
export const saveSession = session.save;
export async function renewSession() {
  const expected = session.snapshot().revision;
  const value = await api<{ deviceToken: string }>("/renew", {});
  return session.save(value.deviceToken, expected);
}
export async function installationId() {
  let id = await SecureStore.getItemAsync("installation-id");
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync("installation-id", id);
  }
  return id;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!origin || (!origin.startsWith("https://") && !__DEV__)) {
    throw new Error(
      "Configure EXPO_PUBLIC_API_URL with your HTTPS backend address.",
    );
  }
  const requestSession = session.snapshot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${origin}/api/v1/scanner${path}`, {
      method: body === undefined ? "GET" : "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(requestSession.token
          ? { Authorization: `Device ${requestSession.token}` }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    // A response from an old installation cannot restore its photo/result after revocation.
    if (
      path !== "/activate" &&
      session.snapshot().revision !== requestSession.revision
    ) {
      throw new Error(
        "Device session changed. Reconcile the previous request before scanning again.",
      );
    }
    if (!response.ok)
      throw new ApiError(
        payload.error?.message || "Request failed",
        response.status,
      );
    return payload.data;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "Request timed out. Its result is uncertain; retry the same request.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type Pending =
  | {
      kind: "manual";
      employeeNumber: string;
      scanEventId: string;
      createdAt: number;
    }
  | { kind: "preview"; qrToken: string; scanEventId: string; createdAt: number }
  | { kind: "confirm"; previewId: string }
  | {
      kind: "reject";
      previewId: string;
      reason: "IDENTITY_MISMATCH" | "PHOTO_UNAVAILABLE" | "CANCELLED";
    };

// Save the exact action before sending it. A timeout may mean the server already committed.
export async function storePending(value: Pending | null) {
  if (value)
    await SecureStore.setItemAsync("pending-scan", JSON.stringify(value));
  else await SecureStore.deleteItemAsync("pending-scan");
}
export async function restorePending(): Promise<Pending | null> {
  const value = await SecureStore.getItemAsync("pending-scan");
  return value ? JSON.parse(value) : null;
}
