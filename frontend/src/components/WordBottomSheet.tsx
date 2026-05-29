import React, { useEffect, useRef } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, DOMAIN_COLORS } from "@/src/lib/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  word: string;
  definition: string;
  domain: string;
  whatToSay: string;
  loading?: boolean;
};

export function WordBottomSheet({ visible, onClose, word, definition, domain, whatToSay, loading }: Props) {
  const slide = useRef(new Animated.Value(500)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      Animated.timing(slide, { toValue: 500, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          onClose();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const dc = DOMAIN_COLORS[domain] || DOMAIN_COLORS.Generale;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.backdrop}>
        <Animated.View
          {...responder.panHandlers}
          onStartShouldSetResponder={() => true}
          style={[styles.sheet, { transform: [{ translateY: Animated.add(slide, dragY) }] }]}
        >
          <TouchableOpacity activeOpacity={1}>
            <View style={styles.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.row}>
                <Text testID="bs-word" style={styles.word}>{word}</Text>
                <View style={[styles.badge, { backgroundColor: dc.bg, borderColor: dc.border }]}>
                  <Text testID="bs-domain" style={[styles.badgeText, { color: dc.text }]}>{domain}</Text>
                </View>
              </View>

              {loading ? (
                <Text style={styles.loading}>Sto pensando…</Text>
              ) : (
                <>
                  <Text style={styles.label}>Definizione</Text>
                  <Text testID="bs-definition" style={styles.definition}>{definition}</Text>

                  <Text style={styles.label}>Cosa dire</Text>
                  <View style={styles.sayBox}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.primary} />
                    <Text testID="bs-whattosay" style={styles.sayText}>{whatToSay}</Text>
                  </View>
                </>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: C.borderStrong,
    maxHeight: "75%",
  },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginBottom: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 },
  word: { fontSize: 32, fontWeight: "800", color: C.primary, letterSpacing: -0.5, flexShrink: 1 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  label: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 8, marginBottom: 8 },
  definition: { color: C.text, fontSize: 17, lineHeight: 24, marginBottom: 4 },
  loading: { color: C.textDim, fontSize: 15, fontStyle: "italic", paddingVertical: 24 },
  sayBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: C.primaryDim,
    borderWidth: 1, borderColor: "rgba(124,80,255,0.3)",
    borderRadius: 14, padding: 14,
  },
  sayText: { color: C.text, fontSize: 15, lineHeight: 22, fontStyle: "italic", flex: 1 },
});
