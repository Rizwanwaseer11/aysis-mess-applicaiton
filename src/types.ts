export type Bootstrap = {
  serverTime: string;
  site: { id: string; name: string; timezone: string };
  device: {
    id: string;
    name: string;
    settings?: {
      soundEnabled?: boolean;
      resultDisplaySeconds?: number;
      kioskMessage?: string;
    };
  };
  mealWindows: {
    id: string;
    meal_name: string;
    active_now: boolean;
    service_date: string;
    start_time: string;
    end_time: string;
  }[];
};
export type Result = {
  serverTime: string;
  previewId: string;
  decision: "PENDING_CONFIRMATION" | "APPROVED" | "DENIED";
  reasonCode: string;
  expiresAt?: string;
  employee: {
    fullName: string;
    employeeNumber: string;
    photoUrl: string;
  } | null;
  meal: { name: string } | null;
};
export type Recent = {
  scanned_at?: string;
  id: string;
  full_name: string | null;
  decision: string;
  meal_name: string | null;
};
