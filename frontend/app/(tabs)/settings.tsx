import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api, C } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const LANGS = [
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

export default function Settings() {
  const { user, logout, setLanguage, refresh } = useAuth();
  const router = useRouter();
  const [billing, setBilling] = useState<{ status: string; days_left: number } | null>(null);

  useEffect(() => {
    api<{ status: string; days_left: number }>("/billing/status").then(setBilling).catch(() => {});
  }, []);

  const upgrade = async () => {
    try {
      const r = await api<{ checkout_url: string }>("/billing/create-checkout-session", { method: "POST" });
      await WebBrowser.openBrowserAsync(r.checkout_url);
      setTimeout(() => { refresh(); api<any>("/billing/status").then(setBilling).catch(() => {}); }, 1000);
    } catch (e: any) {
      Alert.alert("Errore", e.message);
    }
  };

  const doLogout = () => {
    Alert.alert("Esci", "Vuoi davvero uscire?", [
      { text: "Annulla", style: "cancel" },
      { text: "Esci", style: "destructive", onPress: async () => { await logout(); router.replace("/auth"); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Text style={styles.title}>Impostazioni</Text>

        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{(user?.name?.[0] || user?.email[0] || "?").toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name || "Utente"}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>

        <Text style={styles.section}>Abbonamento</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View>
              <Text style={styles.cardTitle}>Context Pro</Text>
              <Text style={styles.cardSub}>
                {billing?.status === "trial" ? `Prova · ${billing.days_left} ${billing.days_left === 1 ? "giorno" : "giorni"} rimast${billing.days_left === 1 ? "o" : "i"}`
                  : billing?.status === "active" ? "Attivo · €9/mese"
                  : "Non attivo"}
              </Text>
            </View>
            {billing?.status !== "active" && (
              <TouchableOpacity testID="upgrade-btn" style={styles.upgradeBtn} onPress={upgrade}>
                <Text style={styles.upgradeTxt}>Passa a Pro</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.section}>Lingua</Text>
        <View style={styles.card}>
          {LANGS.map((l, i) => (
            <TouchableOpacity
              key={l.code}
              testID={`lang-${l.code}`}
              style={[styles.langRow, i < LANGS.length - 1 && styles.divider]}
              onPress={() => setLanguage(l.code)}
            >
              <Text style={{ fontSize: 22, marginRight: 12 }}>{l.flag}</Text>
              <Text style={styles.langTxt}>{l.label}</Text>
              {user?.language === l.code && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>Account</Text>
        <TouchableOpacity testID="logout-btn" style={[styles.card, styles.row, { padding: 16 }]} onPress={doLogout}>
          <Ionicons name="log-out-outline" size={20} color="#f87171" />
          <Text style={{ color: "#f87171", fontSize: 15, fontWeight: "600", marginLeft: 10 }}>Esci</Text>
        </TouchableOpacity>

        <Text style={styles.foot}>Context · v1.0 · Powered by Whisper + Claude</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  title: { color: C.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.8, marginBottom: 18 },
  profile: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 24 },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.primaryDim, borderColor: "rgba(124,80,255,0.4)", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: C.primary, fontSize: 22, fontWeight: "800" },
  name: { color: C.text, fontSize: 17, fontWeight: "700" },
  email: { color: C.textDim, fontSize: 13, marginTop: 2 },
  section: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 18, marginBottom: 10 },
  card: { backgroundColor: C.surface, borderRadius: 16, borderColor: C.border, borderWidth: 1, padding: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: "700" },
  cardSub: { color: C.textDim, fontSize: 13, marginTop: 4 },
  upgradeBtn: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  upgradeTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  langRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.border },
  langTxt: { color: C.text, fontSize: 15, flex: 1 },
  foot: { color: C.textMuted, fontSize: 11, textAlign: "center", marginTop: 28 },
});
