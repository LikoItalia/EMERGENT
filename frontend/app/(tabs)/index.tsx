import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { api, C, DOMAIN_COLORS } from "@/src/lib/api";
import { ContextLogo } from "@/src/components/ContextLogo";

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({ total: 0, domains: 0 });
  const [billing, setBilling] = useState<{ status: string; days_left: number } | null>(null);

  useEffect(() => {
    api<{ words: any[] }>("/library/words").then(r => {
      const domains = new Set(r.words.map((w: any) => w.domain));
      setStats({ total: r.words.length, domains: domains.size });
    }).catch(() => {});
    api<{ status: string; days_left: number; trial_ends_at: string }>("/billing/status").then(setBilling).catch(() => {});
  }, []);

  const firstName = (user?.name || "").split(" ")[0] || "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greet}>Ciao{firstName ? `, ${firstName}` : ""}</Text>
            <Text style={styles.brand}>Context</Text>
          </View>
          <ContextLogo size={40} />
        </View>

        {billing && billing.status === "trial" && (
          <View testID="trial-card" style={styles.trialCard}>
            <Ionicons name="sparkles" size={16} color={C.primary} />
            <Text style={styles.trialTxt}>
              Prova Pro · {billing.days_left} {billing.days_left === 1 ? "giorno rimasto" : "giorni rimasti"}
            </Text>
          </View>
        )}
        {billing && billing.status === "expired" && (
          <TouchableOpacity style={styles.expiredCard} onPress={() => router.push("/(tabs)/settings")}>
            <Text style={styles.expiredTxt}>Prova terminata · Passa a Pro €9/mese</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.total}</Text>
            <Text style={styles.statLbl}>Parole salvate</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.domains}</Text>
            <Text style={styles.statLbl}>Settori</Text>
          </View>
        </View>

        <Text style={styles.section}>Modalità</Text>

        <TouchableOpacity testID="card-online" style={styles.modeCard} onPress={() => router.push("/(tabs)/online")} activeOpacity={0.85}>
          <View style={[styles.modeIcon, { backgroundColor: "rgba(124,80,255,0.15)" }]}>
            <Ionicons name="videocam" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>Meeting Online</Text>
            <Text style={styles.modeDesc}>Sottotitoli live dei tuoi meeting</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity testID="card-live" style={styles.modeCard} onPress={() => router.push("/(tabs)/live")} activeOpacity={0.85}>
          <View style={[styles.modeIcon, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
            <Ionicons name="radio" size={22} color="#4ade80" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>Live · Eventi</Text>
            <Text style={styles.modeDesc}>Testo grande, perfetto da lontano</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity testID="card-library" style={styles.modeCard} onPress={() => router.push("/(tabs)/library")} activeOpacity={0.85}>
          <View style={[styles.modeIcon, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
            <Ionicons name="library" size={22} color="#fbbf24" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>Libreria</Text>
            <Text style={styles.modeDesc}>Le tue parole organizzate per settore</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  greet: { color: C.textDim, fontSize: 14 },
  brand: { color: C.text, fontSize: 30, fontWeight: "800", letterSpacing: -1 },
  trialCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(124,80,255,0.12)", borderColor: "rgba(124,80,255,0.3)", borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginBottom: 18, alignSelf: "flex-start",
  },
  trialTxt: { color: C.primary, fontSize: 13, fontWeight: "600" },
  expiredCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.primary, padding: 14, borderRadius: 14, marginBottom: 18,
  },
  expiredTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 28 },
  statBox: { flex: 1, backgroundColor: C.surface, borderRadius: 16, padding: 18, borderColor: C.border, borderWidth: 1 },
  statNum: { color: C.text, fontSize: 32, fontWeight: "800", letterSpacing: -1 },
  statLbl: { color: C.textDim, fontSize: 12, marginTop: 2 },
  section: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 },
  modeCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: C.surface, padding: 16, borderRadius: 18,
    borderColor: C.border, borderWidth: 1, marginBottom: 10,
  },
  modeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modeTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  modeDesc: { color: C.textDim, fontSize: 13, marginTop: 2 },
});
