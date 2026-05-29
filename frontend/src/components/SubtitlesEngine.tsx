import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Animated, Easing } from "react-native";
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
import { LinearGradient } from "expo-linear-gradient";
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

  // Pulse animation refs
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.5)).current;

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

  // Run pulse animation when recording
  useEffect(() => {
    if (recording) {
      const buttonPulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.6, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
        ])
      );
      const ringPulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ringScale, { toValue: 1.6, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      buttonPulse.start();
      ringPulse.start();
      return () => { buttonPulse.stop(); ringPulse.stop(); };
    } else {
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.6);
      ringScale.setValue(1);
      ringOpacity.setValue(0);
    }
  }, [recording]);

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
      api("/library/save", { method: "POST", body: {
        word: r.word, definition: r.definition, domain: r.domain, what_to_say: r.what_to_say, language: lang
      }}).catch(() => {});
    } catch (e: any) {
      setSel({ word: clean, definition: "Errore: " + e.message, domain: "Generale", whatToSay: "" });
    } finally {
      setSheetLoading(false);
    }
  };

  const hasWords = words.length > 0;

  return (
    <View style={styles.root}>
      {/* Words stream area */}
      <ScrollView
        ref={scrollRef}
        style={styles.stream}
        contentContainerStyle={[
          styles.streamContent,
          large && { paddingHorizontal: 28 },
          !hasWords && styles.streamEmpty,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {hasWords && (
          <View style={styles.wordsWrap}>
            {words.map((w, i) => (
              <TouchableOpacity key={i} onPress={() => onWordPress(w)} testID={`word-${i}`} activeOpacity={0.6}>
                <Text style={[styles.word, large && styles.wordLarge]}>{w}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {sending && <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} />}
      </ScrollView>

      {/* Centered record button */}
      <View pointerEvents="box-none" style={styles.centerOverlay}>
        <View style={styles.btnWrap}>
          {/* Pulsing ring (visible while recording) */}
          {recording && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulseRing,
                { transform: [{ scale: ringScale }], opacity: ringOpacity },
              ]}
            />
          )}
          <Animated.View
            style={[
              styles.btnGlow,
              recording && { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
            ]}
          />
          <TouchableOpacity
            testID="record-btn"
            onPress={recording ? stop : start}
            activeOpacity={0.85}
            style={styles.btnTouch}
          >
            <Animated.View style={recording ? { transform: [{ scale: pulseScale }] } : undefined}>
              <LinearGradient
                colors={recording ? ["#ef4444", "#dc2626"] : ["#7c50ff", "#a855f7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btnCircle}
              >
                {recording ? (
                  <View style={styles.stopIcon} />
                ) : (
                  <Ionicons name="mic" size={48} color="#fff" />
                )}
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>
          <Text style={styles.btnLabel}>
            {recording ? "Tocca per fermare" : "Tocca per iniziare"}
          </Text>
        </View>
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

const BTN_SIZE = 120;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  stream: { flex: 1 },
  streamContent: { padding: 20, paddingBottom: BTN_SIZE + 140, minHeight: "100%" },
  streamEmpty: { justifyContent: "center" },
  wordsWrap: { flexDirection: "row", flexWrap: "wrap" },
  word: { color: C.text, fontSize: 20, marginRight: 8, marginBottom: 8, fontWeight: "500", lineHeight: 32 },
  wordLarge: { fontSize: 38, lineHeight: 56, marginRight: 12, marginBottom: 12, fontWeight: "700" },

  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  btnWrap: { alignItems: "center", justifyContent: "center" },
  pulseRing: {
    position: "absolute",
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: "rgba(124,80,255,0.35)",
  },
  btnGlow: {
    position: "absolute",
    width: BTN_SIZE + 30,
    height: BTN_SIZE + 30,
    borderRadius: (BTN_SIZE + 30) / 2,
    backgroundColor: "rgba(124,80,255,0.25)",
    shadowColor: "#7c50ff",
    shadowOpacity: 1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 24,
  },
  btnTouch: { alignItems: "center", justifyContent: "center" },
  btnCircle: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7c50ff",
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  stopIcon: { width: 36, height: 36, borderRadius: 6, backgroundColor: "#fff" },
  btnLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 22,
    letterSpacing: 0.3,
  },
});
