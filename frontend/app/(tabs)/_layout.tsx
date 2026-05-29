import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { C } from "@/src/lib/api";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textMuted,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.OS === "ios" ? "rgba(5,5,8,0.85)" : "rgba(5,5,8,0.97)",
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 86 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 10,
        },
        tabBarBackground: Platform.OS === "ios" ? () => (
          <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
        ) : undefined,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="online" options={{ title: "Online", tabBarIcon: ({ color, size }) => <Ionicons name="videocam" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="live" options={{ title: "Live", tabBarIcon: ({ color, size }) => <Ionicons name="radio" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="library" options={{ title: "Libreria", tabBarIcon: ({ color, size }) => <Ionicons name="library" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Impostazioni", tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size - 2} /> }} />
    </Tabs>
  );
}
