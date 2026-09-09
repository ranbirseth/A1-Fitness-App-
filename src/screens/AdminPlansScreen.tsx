import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';
import { type PlanItem, listPlans } from '../api/plans';
import { SuperadminHeader } from '../components/SuperadminHeader';
import { useDrawer } from '../components/drawer/DrawerContext';

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function formatPrice(price: number): string {
  return price.toLocaleString('en-IN');
}

export function AdminPlansScreen() {
  const { user } = useAuth();
  const { setActive } = useDrawer();

  const branchCode = user?.branchCode ?? '';

  useEffect(() => {
    setActive('Plans');
  }, [setActive]);

  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const page = await listPlans({ branchCode });
        setPlans(page.items);
      } catch (err) {
        setError(messageFrom(err, 'Failed to load plans. Please try again.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branchCode]
  );

  useEffect(() => {
    load('initial');
  }, [load]);

  const renderPlanCard = useCallback(({ item: plan }: { item: PlanItem }) => {
    const featureCount = plan.features?.length ?? 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Text style={styles.cardName} numberOfLines={1}>{plan.name}</Text>
            <Text style={styles.cardDuration}>{plan.duration} days</Text>
          </View>
          <Text style={styles.cardPrice}>{'\u20B9'}{formatPrice(plan.price)}</Text>
        </View>

        <View style={styles.availabilityRow}>
          <View style={styles.availableDot} />
          <Text style={styles.availabilityText}>Available in your branch</Text>
        </View>

        {featureCount > 0 ? (
          <View style={styles.featuresSection}>
            {plan.features.slice(0, 3).map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Text style={styles.featureBullet}>{'\u2713'}</Text>
                <Text style={styles.featureText} numberOfLines={1}>{f}</Text>
              </View>
            ))}
            {featureCount > 3 && (
              <Text style={styles.featureMore}>+{featureCount - 3} more</Text>
            )}
          </View>
        ) : (
          <Text style={styles.noFeatures}>No features listed</Text>
        )}
      </View>
    );
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SuperadminHeader
        title="Plans"
        subtitle="Membership plans available in your branch."
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>Loading plans...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>{'\u26A0'}</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => load('initial')} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => item._id}
          renderItem={renderPlanCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>{'\u26A1'}</Text>
              <Text style={styles.emptyTitle}>No plans available yet</Text>
              <Text style={styles.emptySubtitle}>
                Contact the superadmin to apply membership plans to your branch.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0b10',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  errorIcon: {
    fontSize: 36,
    color: colors.textFaint,
  },
  retryButton: {
    marginTop: 18,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: 'rgba(30,32,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTopLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  cardDuration: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  cardPrice: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '800',
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46,184,114,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46,184,114,0.35)',
    borderRadius: 999,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  availableDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 6,
  },
  availabilityText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
  featuresSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureBullet: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
    width: 18,
  },
  featureText: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  featureMore: {
    color: colors.textFaint,
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 18,
    marginTop: 2,
  },
  noFeatures: {
    color: colors.textFaint,
    fontSize: 13,
    fontStyle: 'italic',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
});