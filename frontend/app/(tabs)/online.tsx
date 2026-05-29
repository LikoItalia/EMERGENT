import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SubtitlesEngine } from "@/src/components/SubtitlesEngine";
import { C } from "@/src/lib/api";

export default function Online() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Meeting Online</Text>
        <Text style={styles.sub}>Parla durante il meeting — tocca le parole per scoprirle</Text>
      </View>
      <SubtitlesEngine />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { color: C.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: C.textDim, fontSize: 13, marginTop: 2 },
});
