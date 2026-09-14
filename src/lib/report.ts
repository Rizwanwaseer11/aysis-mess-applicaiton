export type DailyReport = {
  site: { id: string; code: string; name: string; timezone: string };
  device: { id: string; name: string };
  serviceDate: string;
  generatedAt: string;
  scope: "site" | "device";
  total: number;
  meals: { id: number; name: string; served: number }[];
  records: {
    id: string;
    served_at: string;
    employee_number: string;
    full_name: string;
    meal_name: string;
    device_name: string;
  }[];
  pagination: { page: number; pages: number; limit: number; total: number };
};
export function reportText(report: DailyReport) {
  return [
    "Aysis confirmed meal summary",
    "Site: " + report.site.name,
    "Scope: " +
      (report.scope === "site" ? "All devices at site" : report.device.name),
    "Service date: " + report.serviceDate + " / " + report.site.timezone,
    ...report.meals.map((meal) => meal.name + ": " + meal.served),
    "Total confirmed meals: " + report.total,
    "Generated: " + report.generatedAt,
    "Verify in Admin Reports with the same site and service date. Device totals are a subset of site totals.",
    "This is a point-in-time summary, not a signed or immutable report.",
  ].join("\n");
}
