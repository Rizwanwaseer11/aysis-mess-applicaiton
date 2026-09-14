import { Text, View } from "react-native";
import type { Bootstrap, Recent } from "../types";
import { colors, styles as s } from "../theme";
export default function SiteOverview({
  boot,
  recent,
}: {
  boot: Bootstrap | null;
  recent: Recent[];
}) {
  return (
    <View style={s.contextColumn}>
      <View style={s.contextCard}>
        <Text style={s.eyebrow}>REGISTERED SITE</Text>
        <Text style={s.siteName}>
          {boot?.site.name || "Loading registered site…"}
        </Text>
        <Text style={s.text}>{boot?.device.name || "Connecting tablet…"}</Text>
        <Text style={s.subtitle}>{boot?.site.timezone}</Text>
      </View>
      <View style={s.contextCard}>
        <Text style={s.sectionTitle}>Today’s meal windows</Text>
        {boot?.mealWindows.map((meal) => (
          <View
            key={meal.id}
            style={[s.mealRow, meal.active_now && s.openMeal]}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{meal.meal_name}</Text>
              <Text style={s.subtitle}>
                {meal.start_time.slice(0, 5)} – {meal.end_time.slice(0, 5)}
              </Text>
            </View>
            <Text
              style={[
                s.badge,
                { color: meal.active_now ? colors.green : colors.muted },
              ]}
            >
              {meal.active_now ? "Open now" : "Closed"}
            </Text>
          </View>
        ))}
        <Text style={s.subtitle}>Meal times follow the site’s timezone.</Text>
      </View>
      <View style={s.contextCard}>
        <Text style={s.sectionTitle}>Recent tablet activity</Text>
        {!recent.length && (
          <Text style={s.text}>New scans will appear here.</Text>
        )}
        {recent.slice(0, 3).map((row) => (
          <View key={row.id} style={s.historyRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.text}>{row.full_name || "Unknown card"}</Text>
              <Text style={s.subtitle}>{row.meal_name || "Scan"}</Text>
            </View>
            <Text
              style={[
                s.badge,
                {
                  color:
                    row.decision === "APPROVED" ? colors.green : colors.red,
                },
              ]}
            >
              {row.decision === "APPROVED" ? "Served" : "Denied"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
