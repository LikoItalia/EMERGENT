import React, { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { C } from "@/src/lib/api";
import { ContextLogo } from "@/src/components/ContextLogo";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password || (mode === "register" && !name)) {
      setErr("Compila tutti i campi");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Errore");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logoGlow}>
              <ContextLogo size={72} />
            </View>
            <Text style={styles.brand}>Context</Text>
            <Text style={styles.tagline}>Capisci ogni parola. In tempo reale.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.tabs}>
              <TouchableOpacity
                testID="tab-login"
                style={[styles.tab, mode === "login" && styles.tabActive]}
                onPress={() => setMode("login")}
              >
                <Text style={[styles.tabTxt, mode === "login" && styles.tabTxtActive]}>Accedi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="tab-register"
                style={[styles.tab, mode === "register" && styles.tabActive]}
                onPress={() => setMode("register")}
              >
                <Text style={[styles.tabTxt, mode === "register" && styles.tabTxtActive]}>Registrati</Text>
              </TouchableOpacity>
            </View>

            {mode === "register" && (
              <View style={styles.field}>
                <Ionicons name="person-outline" size={18} color={C.textDim} />
                <TextInput
                  testID="input-name"
                  style={styles.input}
                  placeholder="Nome"
                  placeholderTextColor={C.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            )}
            <View style={styles.field}>
              <Ionicons name="mail-outline" size={18} color={C.textDim} />
              <TextInput
                testID="input-email"
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={C.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.field}>
              <Ionicons name="lock-closed-outline" size={18} color={C.textDim} />
              <TextInput
                testID="input-password"
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={C.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {err && <Text style={styles.err}>{err}</Text>}

            <TouchableOpacity
              testID="submit-btn"
              style={[styles.cta, loading && { opacity: 0.6 }]}
              onPress={submit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaTxt}>
                  {mode === "login" ? "Accedi" : "Inizia prova gratis di 7 giorni"}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.foot}>
              {mode === "register"
                ? "Dopo 7 giorni, abbonamento Pro a €9/mese. Annulli quando vuoi."
                : "Crittografato end-to-end."}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 24, flexGrow: 1, justifyContent: "center" },
  logoWrap: { alignItems: "center", marginBottom: 40 },
  logoGlow: {
    width: 88, height: 88, borderRadius: 22,
    backgroundColor: "rgba(124,80,255,0.08)",
    borderWidth: 1, borderColor: "rgba(124,80,255,0.25)",
    alignItems: "center", justifyContent: "center",
    shadowColor: C.primary, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
  },
  brand: { fontSize: 32, fontWeight: "800", color: C.text, marginTop: 18, letterSpacing: -1 },
  tagline: { color: C.textDim, fontSize: 14, marginTop: 6 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 24, padding: 22,
  },
  tabs: { flexDirection: "row", backgroundColor: C.bg, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 9 },
  tabActive: { backgroundColor: C.surfaceElev },
  tabTxt: { color: C.textMuted, fontWeight: "600", fontSize: 14 },
  tabTxtActive: { color: C.text },
  field: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 14 : 4,
    marginBottom: 12,
  },
  input: { flex: 1, color: C.text, fontSize: 15, paddingVertical: Platform.OS === "ios" ? 0 : 12 },
  err: { color: "#f87171", fontSize: 13, marginBottom: 10 },
  cta: {
    backgroundColor: C.primary, paddingVertical: 15, borderRadius: 14, alignItems: "center", marginTop: 6,
    shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  ctaTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  foot: { color: C.textMuted, fontSize: 12, textAlign: "center", marginTop: 14, lineHeight: 18 },
});
