import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/lib/auth";
import { C } from "@/src/lib/api";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return user ? <Redirect href="/(tabs)" /> : <Redirect href="/auth" />;
}
