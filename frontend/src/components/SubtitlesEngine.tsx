import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { C, api } from "@/src/lib/api";
import { WordBottomSheet } from "@/src/components/WordBottomSheet";
import { useAuth } from "@/src/lib/auth";

type Props = { large?: boolean };

const CHUNK_MS = 4000;

export function SubtitlesEngine({ large = false }: Props) {
  const { user } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const cycleRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sel, setSel] = useState({ word: "", definition: "", domain: "Generale", whatToSay: "" });

  const lang = user?.language || "it";

  useEffect(() => {
    (async () => {
      const s = await AudioModule.requestRecordingPermissionsAsync();
      setPermission(s.granted);
      if (s.granted) {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
    })();
    return () => { stoppingRef.current = true; if (cycleRef.current) clearTimeout(cycleRef.current); };
  }, []);

  const transcribeChunk = useCallback(async (uri: string) => {
    try {
      const form = new FormData();
      const filename = `chunk-${Date.now()}.m4a`;
      // @ts-ignore - RN FormData accepts {uri,name,type}
      form.append("file", { uri, name: filename, type: "audio/m4a" });
      setSending(true);
      const r = await api<{ text: string }>(`/transcribe?language=${lang}`, {
        method: "POST", body: form, isForm: true,
      });
      if (r.text && r.text.trim()) {
        const newWords = r.text.trim().split(/\s+/).filter(w => w.length > 0);
        setWords((w) => [...w, ...newWords]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      }
    } catch (e) {
      console.warn("Transcribe error", e);
    } finally {
      setSending(false);
    }
  }, [lang]);

  const recordCycle = useCallback(async () => {
    if (stoppingRef.current) return;
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      cycleRef.current = setTimeout(async () => {
        if (stoppingRef.current) return;
        try {
          await recorder.stop();
          const uri = recorder.uri;
          if (uri) transcribeChunk(uri);
        } catch {}
        recordCycle();
      }, CHUNK_MS) as any;
    } catch (e) {
      console.warn("record cycle err", e);
    }
  }, [recorder, transcribeChunk]);

  const start = async () => {
    if (!permission) {
      const s = await AudioModule.requestRecordingPermissionsAsync();
      setPermission(s.granted);
      if (!s.granted) return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    stoppingRef.current = false;
    setRecording(true);
    setWords([]);
    await recordCycle();
  };

  const stop = async () => {
    stoppingRef.current = true;
    if (cycleRef.current) { clearTimeout(cycleRef.current); cycleRef.current = null; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { await recorder.stop(); } catch {}
    setRecording(false);
  };

  const onWordPress = async (raw: string) => {
    const clean = raw.replace(/[.,!?;:"'()\[\]]/g, "").trim();
    if (!clean) return;
    Haptics.selectionAsync().catch(() => {});
    setSel({ word: clean, definition: "", domain: "Generale", whatToSay: "" });
    setSheetVisible(true);
    setSheetLoading(true);
    try {
      const ctx = words.slice(-30).join(" ");
      const r = await api<{ word: string; definition: string; domain: string; what_to_say: string }>(
        "/explain", { method: "POST", body: { word: clean, context: ctx, language: lang } }
      );
      setSel({ word: r.word, definition: r.definition, domain: r.domain, whatToSay: r.what_to_say });
      // Auto-save to library
      api("/library/save", { method: "POST", body: {
        word: r.word, definition: r.definition, domain: r.domain, what_to_say: r.what_to_say, language: lang
      }}).catch(() => {});
    } catch (e: any) {
      setSel({ word: clean, definition: "Errore: " + e.message, domain: "Generale", whatToSay: "" });
    } finally {
      setSheetLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        style={styles.stream}
        contentContainerStyle={[styles.streamContent, large && { paddingHorizontal: 28 }]}
      >
        {words.length === 0 && !recording && (
          <Text style={styles.placeholder}>
            Premi il pulsante per iniziare. Le parole appariranno qui.{"\n"}Tocca una parola per scoprire il significato.
          </Text>
        )}
        <View style={styles.wordsWrap}>
          {words.map((w, i) => (
            <TouchableOpacity key={i} onPress={() => onWordPress(w)} testID={`word-${i}`} activeOpacity={0.6}>
              <Text style={[styles.word, large && styles.wordLarge]}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {sending && <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} />}
      </ScrollView>

      <View style={styles.controls}>
        <TouchableOpacity
          testID="record-btn"
          onPress={recording ? stop : start}
          style={[styles.recBtn, recording && styles.recBtnActive]}
          activeOpacity={0.85}
        >
          {recording ? (
            <>
              <View style={styles.dot} />
              <Text style={styles.recTxt}>Stop</Text>
            </>
          ) : (
            <>
              <Ionicons name="mic" size={22} color="#fff" />
              <Text style={styles.recTxt}>Ascolta</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <WordBottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        word={sel.word}
        definition={sel.definition}
        domain={sel.domain}
        whatToSay={sel.whatToSay}
        loading={sheetLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  stream: { flex: 1 },
  streamContent: { padding: 20, paddingBottom: 30, minHeight: "100%" },
  placeholder: { color: C.textMuted, fontSize: 15, textAlign: "center", marginTop: 80, lineHeight: 24 },
  wordsWrap: { flexDirection: "row", flexWrap: "wrap" },
  word: { color: C.text, fontSize: 20, marginRight: 8, marginBottom: 8, fontWeight: "500", lineHeight: 32 },
  wordLarge: { fontSize: 38, lineHeight: 56, marginRight: 12, marginBottom: 12, fontWeight: "700" },
  controls: { padding: 18, paddingBottom: Platform.OS === "ios" ? 30 : 24, alignItems: "center" },
  recBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.primary, paddingVertical: 16, paddingHorizontal: 36, borderRadius: 999,
    shadowColor: C.primary, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  recBtnActive: { backgroundColor: "#dc2626", shadowColor: "#dc2626" },
  recTxt: { color: "#fff", fontWeight: "700", fontSize: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff" },
});
