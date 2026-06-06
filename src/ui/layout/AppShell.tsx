import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { colors, radius, spacing } from '../theme';

type NavItem = {
  route: '/' | '/settings' | '/ai-cache' | '/log';
  label: string;
  shortLabel: string;
};

const NAV_ITEMS: NavItem[] = [
  { route: '/', label: '对话', shortLabel: '聊' },
  { route: '/settings', label: '设置', shortLabel: '设' },
  { route: '/ai-cache', label: '运行', shortLabel: '运' },
  { route: '/log', label: '日志', shortLabel: '志' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const sidebarWidth = compact ? 68 : 188;

  const activeRoute = useMemo(() => {
    if (pathname === '/') return '/';
    return NAV_ITEMS.find((item) => pathname.startsWith(item.route) && item.route !== '/')?.route || '/';
  }, [pathname]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <View style={[styles.sidebar, { width: sidebarWidth }]}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>¥</Text>
            </View>
            {!compact ? (
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandTitle}>Wealth</Text>
                <Text style={styles.brandSub}>AI OS</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.navList}>
            {NAV_ITEMS.map((item) => {
              const active = activeRoute === item.route;
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navItem, compact && styles.navItemCompact, active && styles.navItemActive]}
                  onPress={() => router.push(item.route)}
                  activeOpacity={0.76}
                >
                  <View style={[styles.navDot, active && styles.navDotActive]} />
                  <Text
                    style={[styles.navText, compact && styles.navTextCompact, active && styles.navTextActive]}
                    numberOfLines={1}
                  >
                    {compact ? item.shortLabel : item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!compact ? (
            <View style={styles.footer}>
              <Text style={styles.footerLabel}>local first</Text>
              <Text style={styles.footerText}>memory · cache · tools</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.content}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.bg,
  },
  sidebar: {
    backgroundColor: colors.bgAlt,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  brand: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.34)',
  },
  brandMarkText: {
    color: colors.accent,
    fontSize: 21,
    fontWeight: '800',
  },
  brandTextWrap: {
    flex: 1,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  brandSub: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  navList: {
    gap: spacing.sm,
  },
  navItem: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: spacing.sm,
  },
  navItemCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
  },
  navDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textSubtle,
  },
  navDotActive: {
    backgroundColor: colors.accent,
  },
  navText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  navTextCompact: {
    fontSize: 14,
  },
  navTextActive: {
    color: colors.text,
  },
  footer: {
    marginTop: 'auto',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  footerText: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 4,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
});
