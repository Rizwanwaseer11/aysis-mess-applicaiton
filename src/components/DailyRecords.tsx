import type { Bootstrap } from "../types";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, ApiError } from "../lib/api";
import { reportText, type DailyReport } from "../lib/report";
import { colors, styles as s } from "../theme";

export default function DailyRecords({
  onRevoked,
  site,
  device,
}: {
  site?: Bootstrap["site"];
  device?: Bootstrap["device"];
  onRevoked: () => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [scope, setScope] = useState<"site" | "device">("device");
  const [report, setReport] = useState<DailyReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const gate = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function load(page = 1) {
    if (gate.current) return;
    gate.current = true;
    const expected = ++generation.current;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const value = await api<DailyReport>(
        "/reports/daily?scope=" +
          scope +
          "&page=" +
          page +
          "&limit=50" +
          (date ? "&date=" + encodeURIComponent(date) : ""),
      );
      if (expected === generation.current) {
        setReport(value);
        setDate(value.serviceDate);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await onRevoked();
      if (expected === generation.current)
        setError(error instanceof Error ? error.message : "Report unavailable");
    } finally {
      gate.current = false;
      if (expected === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function action(title: string, onPress: () => void, disabled = busy) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[s.button, s.secondary, disabled && s.disabled]}
      >
        <Text style={s.buttonText}>{title}</Text>
      </Pressable>
    );
  }
  return (
    <View style={[s.panel, { maxWidth: 1100, padding: 20 }]}>
      <Text style={s.eyebrow}>REGISTERED SITE</Text>
      <Text style={s.siteName}>
        {site?.name || report?.site.name || "Loading registered site…"}
      </Text>
      <Text style={s.text}>
        {device?.name || report?.device.name || "Connecting tablet…"}
      </Text>
      <Text style={s.heading}>Daily meal records</Text>
      <Text style={s.muted}>
        Confirmed servings only. Overnight meals belong to their opening date.
        Leave date empty for today.
      </Text>
      <View style={s.recordControls}>
        <View style={s.recordControl}>
          <Text style={s.title}>Service date</Text>
          <TextInput
            accessibilityLabel="Report service date"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            value={date}
            editable={!busy}
            onChangeText={(value) => {
              setDate(value);
              setReport(null);
            }}
            maxLength={10}
            style={s.input}
          />
        </View>
        <View style={s.recordControl}>
          <Text style={s.title}>Report scope</Text>
          {action(
            scope === "device"
              ? "Scope: this tablet — switch to site"
              : "Scope: whole site — switch to tablet",
            () => {
              setScope(scope === "device" ? "site" : "device");
              setReport(null);
            },
          )}
        </View>
      </View>
      {action("Load / refresh records", () => void load())}
      {busy && <ActivityIndicator color={colors.primary} />}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {report && (
        <>
          <Text style={s.title}>
            {report.site.name} · {report.serviceDate}
          </Text>
          <Text style={s.muted}>
            {report.scope === "site" ? "All site devices" : report.device.name}{" "}
            · As of {new Date(report.generatedAt).toLocaleTimeString()}
          </Text>
          <View style={s.totalsGrid}>
            {report.meals.map((meal) => (
              <View key={meal.id} style={s.totalCard}>
                <Text style={s.muted}>{meal.name}</Text>
                <Text style={s.totalNumber}>{meal.served}</Text>
              </View>
            ))}
          </View>
          <Text style={s.title}>Total: {report.total}</Text>
          {action("Share meal summary", () => {
            void Share.share({ message: reportText(report) }).catch(() =>
              setError(
                "Sharing unavailable. You can read these totals to your administrator.",
              ),
            );
          })}
          {report.records.map((row) => (
            <View
              key={row.id}
              style={{
                width: "100%",
                borderBottomWidth: 1,
                borderColor: colors.border,
                paddingVertical: 8,
              }}
            >
              <Text style={s.text}>
                {row.full_name} · {row.employee_number}
              </Text>
              <Text style={s.subtitle}>
                {row.meal_name} · {row.device_name} ·{" "}
                {new Date(row.served_at).toLocaleTimeString("en-GB", {
                  timeZone: report.site.timezone,
                })}
              </Text>
            </View>
          ))}
          {report.total === 0 && (
            <Text style={s.muted}>No confirmed meals for this selection.</Text>
          )}
          <Text style={s.muted}>
            Page {report.pagination.page} of{" "}
            {Math.max(1, report.pagination.pages)} · 50 records per page
          </Text>
          {action(
            "Previous page",
            () => void load(report.pagination.page - 1),
            busy || report.pagination.page <= 1,
          )}
          {action(
            "Next page",
            () => void load(report.pagination.page + 1),
            busy || report.pagination.page >= report.pagination.pages,
          )}
        </>
      )}
    </View>
  );
}
