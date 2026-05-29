import React, { useEffect } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import { SubtitlesEngine } from "@/src/components/SubtitlesEngine";
import { C } from "@/src/lib/api";

export default function Live() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {!isLandscape && (
        <View style={styles.header}>
          <Text style={styles.title}>Live · Eventi</Text>
          <Text style={styles.sub}>Gira il telefono per la modalità XL</Text>
        </View>
      )}
      <SubtitlesEngine large={isLandscape} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { color: C.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: C.textDim, fontSize: 13, marginTop: 2 },
});
