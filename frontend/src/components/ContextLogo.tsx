import React from "react";
import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

export function ContextLogo({ size = 64 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#9d75ff" />
            <Stop offset="1" stopColor="#7c50ff" />
          </LinearGradient>
        </Defs>
        <Path
          d="M44 16 a18 18 0 1 0 0 32"
          stroke="url(#g)"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
