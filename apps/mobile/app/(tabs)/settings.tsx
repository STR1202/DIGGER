import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../src/state/store';
import { SERVICES, SERVICE_KEYS } from '../../src/services/links';
import { color } from '../../src/theme/tokens';

/** SC-12 設定。データクレジットは法的義務ではないが、必ず載せる。 */
export default function SettingsScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const prefs = useAppStore((s) => s.prefs);
  const setPref = useAppStore((s) => s.setPref);
  const entitlement = useAppStore((s) => s.entitlement);
  const wipeAll = useAppStore((s) => s.wipeAll);
  const clearHistory = useAppStore((s) => s.clearHistory);

  const planName = entitlement.plan === 'free'
    ? 'Free'
    : entitlement.plan === 'pro_yearly' ? 'DIGGR Pro（年額）' : 'DIGGR Pro（月額）';

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>設定</Text>

      <Section label="プラン">
        <Row label="現在のプラン" value={planName} />
        <Row label="サブスクリプションの管理" value="ストアへ ›" />
        <Row label="購入を復元" value="›" />
      </Section>

      <Section label="音楽アプリ">
        <View style={styles.chips}>
          {SERVICE_KEYS.map((k) => (
            <Pressable key={k} onPress={() => setPref('service', k)}
              style={[styles.chip, prefs.service === k && styles.chipOn]}>
              <Text style={[styles.chipText, prefs.service === k && styles.chipTextOn]}>
                {SERVICES[k].name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Toggle label="遷移前に確認する" value={prefs.confirmBeforeLaunch}
          onChange={(v) => setPref('confirmBeforeLaunch', v)} />
      </Section>

      <Section label="表示">
        <Toggle label="ランダム表示を混ぜる" caption="既定は OFF（類似度順）"
          value={prefs.randomOn} onChange={(v) => setPref('randomOn', v)} />
        <Toggle label="ラベルを多く表示" value={prefs.labelDense}
          onChange={(v) => setPref('labelDense', v)} />
        <Toggle label="エッジで関係タイプを示す" value={prefs.relationColors}
          onChange={(v) => setPref('relationColors', v)} />
        <Toggle label="アニメーションを軽減" value={prefs.reduceMotion}
          onChange={(v) => setPref('reduceMotion', v)} />
      </Section>

      <Section label="データ">
        <Pressable onPress={clearHistory}><Row label="履歴をすべて削除" value="" /></Pressable>
        <Pressable
          onPress={() => Alert.alert(
            'アカウントと全データを削除',
            '履歴・ブックマーク・購入に紐づく権利情報をすべて削除します。取り消せません。',
            [{ text: 'キャンセル', style: 'cancel' }, { text: '削除する', style: 'destructive', onPress: wipeAll }],
          )}
        >
          <Row label="アカウントと全データの削除" value="" danger />
        </Pressable>
      </Section>

      <Section label="情報">
        <Text style={styles.credits}>
          {'このアプリの音楽データは、以下の\nパブリックドメイン（CC0）データセットに\n基づいています。\n\n  MusicBrainz\n  ListenBrainz\n  Discogs\n  Wikidata\n\nデータを公開している各コミュニティに\n感謝します。'}
        </Text>
        <Row label="バージョン" value="1.0.0" />
      </Section>
    </ScrollView>
  );
}

function Section(props: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.section}>{props.label}</Text>
      <View style={styles.group}>{props.children}</View>
    </View>
  );
}

function Row(props: { label: string; value: string; danger?: boolean }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, props.danger && { color: color.error }]}>{props.label}</Text>
      <Text style={styles.rowValue}>{props.value}</Text>
    </View>
  );
}

function Toggle(props: {
  label: string; caption?: string; value: boolean; onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{props.label}</Text>
        {props.caption ? <Text style={styles.caption}>{props.caption}</Text> : null}
      </View>
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        trackColor={{ true: '#38295E', false: '#2C2C3A' }}
        thumbColor={props.value ? color.accentGlow : '#8E8E9A'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  content: { padding: 16, gap: 18, paddingBottom: 48 },
  title: { color: color.textPrimary, fontSize: 20, fontWeight: '700' },
  section: { color: color.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  group: {
    backgroundColor: color.bgSurface, borderRadius: 16,
    borderWidth: 1, borderColor: color.hairline, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1C1C25',
  },
  rowLabel: { color: color.textPrimary, fontSize: 14, flex: 1 },
  rowValue: { color: color.textSecondary, fontSize: 12.5 },
  caption: { color: color.textSecondary, fontSize: 11.5, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  chip: {
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: color.hairline, backgroundColor: color.bgElevated,
  },
  chipOn: { borderColor: color.accent, backgroundColor: '#1A1730' },
  chipText: { color: color.textSecondary, fontSize: 12.5 },
  chipTextOn: { color: color.textPrimary, fontWeight: '700' },
  credits: {
    color: color.textSecondary, fontSize: 11.5, lineHeight: 19,
    fontFamily: 'Menlo', padding: 14,
  },
});
