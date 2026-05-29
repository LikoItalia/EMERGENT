import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, C, DOMAIN_COLORS } from "@/src/lib/api";

type W = { id: string; word: string; definition: string; domain: string; what_to_say: string; language: string; created_at: string };

export default function Library() {
  const [words, setWords] = useState<W[]>([]);
  const [q, setQ] = useState("");
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ words: W[] }>("/library/words");
      setWords(r.words);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grouped = useMemo(() => {
    const m: Record<string, W[]> = {};
    for (const w of words) {
      if (q && !w.word.includes(q.toLowerCase()) && !w.definition.toLowerCase().includes(q.toLowerCase())) continue;
      (m[w.domain] = m[w.domain] || []).push(w);
    }
    return m;
  }, [words, q]);

  const domains = Object.keys(grouped).sort();
  const currentList = activeDomain ? grouped[activeDomain] || [] : [];

  const delWord = (id: string) => {
    Alert.alert("Eliminare?", "La parola sarà rimossa.", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: async () => {
        await api(`/library/word/${id}`, { method: "DELETE" });
        load();
      }},
    ]);
  };
  const delDomain = (d: string) => {
    Alert.alert(`Svuotare ${d}?`, "Tutte le parole di questo settore verranno eliminate.", [
      { text: "Annulla", style: "cancel" },
      { text: "Svuota", style: "destructive", onPress: async () => {
        await api(`/library/domain/${encodeURIComponent(d)}`, { method: "DELETE" });
        setActiveDomain(null);
        load();
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{activeDomain ? activeDomain : "Libreria"}</Text>
          <Text style={styles.sub}>{words.length} parole · {domains.length} settori</Text>
        </View>
        {activeDomain && (
          <TouchableOpacity onPress={() => setActiveDomain(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={C.text} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={C.textMuted} />
        <TextInput
          testID="library-search"
          style={styles.search}
          placeholder="Cerca una parola..."
          placeholderTextColor={C.textMuted}
          value={q}
          onChangeText={setQ}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.primary} />}
      >
        {!activeDomain ? (
          domains.length === 0 ? (
            <Text style={styles.empty}>Tocca una parola durante un meeting per salvarla qui.</Text>
          ) : (
            <View style={styles.grid}>
              {domains.map(d => {
                const dc = DOMAIN_COLORS[d] || DOMAIN_COLORS.Generale;
                return (
                  <TouchableOpacity
                    key={d} testID={`domain-${d}`}
                    style={[styles.domainCard, { borderColor: dc.border, backgroundColor: dc.bg }]}
                    onPress={() => setActiveDomain(d)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.domainName, { color: dc.text }]}>{d}</Text>
                    <Text style={styles.domainCount}>{grouped[d].length}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : (
          <>
            <TouchableOpacity onPress={() => delDomain(activeDomain)} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={14} color="#f87171" />
              <Text style={styles.clearTxt}>Svuota settore</Text>
            </TouchableOpacity>
            {currentList.map(w => {
              const dc = DOMAIN_COLORS[w.domain] || DOMAIN_COLORS.Generale;
              return (
                <View key={w.id} style={styles.wordCard}>
                  <View style={styles.wordHead}>
                    <Text style={styles.wordTxt}>{w.word}</Text>
                    <View style={[styles.badge, { backgroundColor: dc.bg, borderColor: dc.border }]}>
                      <Text style={[styles.badgeTxt, { color: dc.text }]}>{w.domain}</Text>
                    </View>
                  </View>
                  <Text style={styles.def}>{w.definition}</Text>
                  {!!w.what_to_say && (
                    <View style={styles.sayBox}>
                      <Text style={styles.sayLbl}>Cosa dire</Text>
                      <Text style={styles.sayTxt}>{w.what_to_say}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.delBtn} onPress={() => delWord(w.id)}>
                    <Ionicons name="trash-outline" size={14} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6, gap: 10 },
  title: { color: C.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  sub: { color: C.textDim, fontSize: 13, marginTop: 2 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderColor: C.border, borderWidth: 1 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 20, marginTop: 10, marginBottom: 4,
    backgroundColor: C.surface, borderColor: C.border, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  search: { flex: 1, color: C.text, fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  domainCard: { width: "47%", padding: 18, borderRadius: 18, borderWidth: 1, minHeight: 110, justifyContent: "space-between" },
  domainName: { fontSize: 17, fontWeight: "700" },
  domainCount: { color: C.text, fontSize: 28, fontWeight: "800", marginTop: 6 },
  empty: { color: C.textMuted, fontSize: 14, textAlign: "center", marginTop: 80, paddingHorizontal: 30, lineHeight: 22 },
  wordCard: { backgroundColor: C.surface, borderRadius: 16, borderColor: C.border, borderWidth: 1, padding: 16, marginBottom: 10, position: "relative" },
  wordHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 },
  wordTxt: { color: C.text, fontSize: 18, fontWeight: "700", textTransform: "capitalize" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgeTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  def: { color: C.textDim, fontSize: 14, lineHeight: 21 },
  sayBox: { marginTop: 10, backgroundColor: "rgba(124,80,255,0.1)", borderColor: "rgba(124,80,255,0.25)", borderWidth: 1, borderRadius: 10, padding: 10 },
  sayLbl: { color: C.primary, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  sayTxt: { color: C.text, fontSize: 13, fontStyle: "italic", lineHeight: 19 },
  delBtn: { position: "absolute", top: 12, right: 12, padding: 6 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12, backgroundColor: "rgba(248,113,113,0.1)", borderRadius: 8, borderColor: "rgba(248,113,113,0.3)", borderWidth: 1 },
  clearTxt: { color: "#f87171", fontSize: 12, fontWeight: "600" },
});
