import React, { useCallback } from 'react';
import {
  Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { buttonHeight, color, radius, shadow } from '../theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'locked';
export type ButtonSize = 'large' | 'medium' | 'small';

export interface ButtonProps {
  readonly label: string;
  readonly sub?: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  readonly icon?: React.ReactNode;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly progress?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * 画面設計書 §4.6 のボタン。
 * 完全なピル・上辺 1px のインナーハイライト・押下で scale 0.96 かつ影を消す。
 * 無効状態はタップで横に揺らして「効かないこと」を返す。
 */
export function Button(props: ButtonProps): React.ReactElement {
  const {
    label, sub, variant = 'primary', size = 'large', disabled = false,
    icon, onPress, onLongPress, style, progress,
  } = props;
  const h = buttonHeight[size];
  const press = useSharedValue(0);
  const shake = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - press.value * 0.04 },
      { translateX: shake.value },
    ],
    shadowOpacity: disabled ? 0 : 0.4 * (1 - press.value),
  }));

  const handlePress = useCallback(() => {
    if (disabled) {
      shake.value = withSequence(
        withTiming(-3, { duration: 60 }),
        withTiming(3, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    void Haptics.impactAsync(
      variant === 'locked' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    onPress?.();
  }, [disabled, onPress, shake, variant]);

  const palette = VARIANTS[variant];

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}、${sub}` : label}
      accessibilityState={{ disabled }}
      onPressIn={() => { press.value = withTiming(1, { duration: 100 }); }}
      onPressOut={() => { press.value = withSpring(0, { stiffness: 400, damping: 22 }); }}
      onPress={handlePress}
      onLongPress={disabled ? undefined : onLongPress}
      delayLongPress={550}
      style={[
        styles.base,
        shadow.button,
        {
          height: h,
          borderRadius: radius.button(h),
          paddingHorizontal: h * 0.45,
          backgroundColor: palette.bg,
          borderWidth: palette.border ? 1 : 0,
          borderColor: palette.border ?? 'transparent',
          opacity: disabled ? 0.35 : 1,
        },
        animated,
        style,
      ]}
    >
      <View style={styles.inner} pointerEvents="none">
        {icon}
        <View>
          <Text style={[styles.label, { color: palette.fg, fontSize: size === 'small' ? 13 : 16 }]}>
            {label}
          </Text>
          {sub ? <Text style={[styles.sub, { color: palette.fg }]}>{sub}</Text> : null}
        </View>
      </View>
      <View style={styles.topHighlight} pointerEvents="none" />
      {progress === undefined ? null : (
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}
    </AnimatedPressable>
  );
}

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.accent, fg: '#FFFFFF' },
  secondary: { bg: color.bgElevated, fg: color.textPrimary, border: color.tierBoundary },
  ghost: { bg: 'rgba(18,18,26,0.96)', fg: color.textSecondary, border: color.tierBoundary },
  locked: { bg: 'rgba(124,92,255,0.12)', fg: color.accentGlow, border: '#3B3556' },
};

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '600', letterSpacing: 0.2, textAlign: 'center' },
  sub: { fontSize: 12, opacity: 0.72, textAlign: 'center', marginTop: 2 },
  topHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressTrack: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressFill: { height: 2, backgroundColor: color.accentGlow },
});
