import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heading, IconButton, type IconName, StatusPill } from '@/components/ui';
import { space, useColors } from '@/lib/theme';
import { useRound } from '@/providers/RoundProvider';

function Header() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { round, isOrganizer } = useRound();
  if (!round) return null;
  return (
    <View style={{ paddingTop: insets.top + 4, paddingBottom: 6, paddingHorizontal: space.xs, backgroundColor: c.bg, flexDirection: 'row', alignItems: 'center' }}>
      <IconButton icon="chevron-back" label="Zurück zu deinen Hops" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Heading size={20} style={{ flexShrink: 1 }}>{round.name}</Heading>
        <StatusPill status={round.status} />
      </View>
      <IconButton icon={isOrganizer ? 'options' : 'information-circle-outline'} label={isOrganizer ? 'Organisation' : 'Hop-Info'}
        onPress={() => router.push(`/round/${round.id}/dashboard`)} />
    </View>
  );
}

export default function TabsLayout() {
  const c = useColors();
  const { unread } = useRound();
  const icon = (name: IconName) => {
    const TabIcon = ({ focused }: { focused: boolean }) => (
      <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={25} color={focused ? c.accent : c.muted} />
    );
    return TabIcon;
  };
  return (
    <Tabs
      screenOptions={{
        header: () => <Header />,
        tabBarActiveTintColor: c.accent,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Karte', tabBarIcon: icon('map') }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: icon('chatbubbles'), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        tabBarBadgeStyle: { backgroundColor: c.accent, color: '#fff' } }} />
      <Tabs.Screen name="kosten" options={{ title: 'Kosten', tabBarIcon: icon('wallet') }} />
      <Tabs.Screen name="collage" options={{ title: 'Collage', tabBarIcon: icon('images') }} />
    </Tabs>
  );
}
