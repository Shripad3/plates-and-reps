import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { PURCHASES_ERROR_CODE, PACKAGE_TYPE, type PurchasesError, type PurchasesPackage } from "react-native-purchases";
import {
  getOfferings,
  initPurchases,
  purchasePackage,
  restorePurchases,
  hasPremiumEntitlement,
} from "@/lib/purchases";
import { syncRevenueCatPremium } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { captureError } from "@/lib/errorReporting";
import { APP_PREMIUM_NAME } from "@/constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { colors } from "@/lib/theme";

function periodLabel(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:      return "/year";
    case PACKAGE_TYPE.SIX_MONTH:   return "/6 months";
    case PACKAGE_TYPE.THREE_MONTH: return "/3 months";
    case PACKAGE_TYPE.TWO_MONTH:   return "/2 months";
    case PACKAGE_TYPE.MONTHLY:     return "/month";
    case PACKAGE_TYPE.WEEKLY:      return "/week";
    default:                       return "";
  }
}

function periodWord(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:      return "year";
    case PACKAGE_TYPE.SIX_MONTH:   return "6 months";
    case PACKAGE_TYPE.THREE_MONTH: return "3 months";
    case PACKAGE_TYPE.TWO_MONTH:   return "2 months";
    case PACKAGE_TYPE.MONTHLY:     return "month";
    case PACKAGE_TYPE.WEEKLY:      return "week";
    default:                       return "period";
  }
}

const FEATURES = [
  { free: "30-day history", premium: "Full history" },
  { free: "10 AI chats / day", premium: "Unlimited AI coach" },
  { free: "3 photo logs / day", premium: "Unlimited photo logging" },
  { free: "5 voice logs / day", premium: "Unlimited voice logging" },
];

function describePurchaseError(error: unknown): { cancelled: boolean; message: string } {
  const err = error as PurchasesError;
  const cancelled =
    err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err?.userCancelled === true;
  const message =
    err?.underlyingErrorMessage?.trim() ||
    err?.message?.trim() ||
    (error instanceof Error ? error.message : "Please try again.");
  return { cancelled, message };
}

export default function PaywallScreen() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    initPurchases(user?.id)
      .then(() => getOfferings())
      .then(setPackages)
      .catch((error) => captureError(error, { scope: "paywall-offerings" }))
      .finally(() => setLoading(false));
  }, [user?.id]);

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasing(true);
    try {
      const customerInfo = await purchasePackage(pkg);
      const synced = await syncRevenueCatPremium().catch((error) => {
        captureError(error, { scope: "sync-revenuecat-premium" });
        return { is_premium: false };
      });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["rc-premium"] });

      const activated =
        hasPremiumEntitlement(customerInfo) || synced.is_premium;
      if (!activated) {
        Alert.alert(
          "Premium not activated",
          "Payment was received but premium is not active yet. In RevenueCat, ensure the entitlement identifier is \"premium\" and attached to your subscriptions, then tap Restore purchases."
        );
        return;
      }

      Alert.alert("Welcome to Premium!", "Your subscription is active.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: unknown) {
      const { cancelled, message } = describePurchaseError(error);
      if (!cancelled) {
        captureError(error, {
          scope: "paywall-purchase",
          productId: pkg.product.identifier,
        });
      }
      if (cancelled) {
        Alert.alert(
          "Purchase not completed",
          "The payment sheet closed before finishing.\n\nIf you didn't tap Cancel:\n• Use a Sandbox Tester account (App Store Connect)\n• Enable Developer Mode on this iPhone\n• Confirm Paid Apps agreement is Active\n• Try again when the Apple payment sheet appears"
        );
      } else {
        Alert.alert("Purchase failed", message);
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setPurchasing(true);
    try {
      const customerInfo = await restorePurchases();
      const synced = await syncRevenueCatPremium().catch((error) => {
        captureError(error, { scope: "sync-revenuecat-premium-restore" });
        return { is_premium: false };
      });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["rc-premium"] });

      const activated =
        hasPremiumEntitlement(customerInfo) || synced.is_premium;
      if (!activated) {
        Alert.alert(
          "No purchases found",
          "No active subscription was found for this account."
        );
        return;
      }

      Alert.alert("Restored", "Your purchases have been restored.");
      router.back();
    } catch (error) {
      Alert.alert("Restore failed", (error as Error).message);
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        <TouchableOpacity className="pt-2 pb-4" onPress={() => router.back()}>
          <Text className="text-brand-400 text-base">Close</Text>
        </TouchableOpacity>

        <Text className="text-white text-3xl font-bold mb-2 tracking-tight">{APP_PREMIUM_NAME}</Text>
        <Text className="text-slate-400 text-base mb-8 leading-relaxed">
          Full history, unlimited AI coach, and faster logging.
        </Text>

        <Card className="mb-6">
          {FEATURES.map((row, index) => (
            <View
              key={row.free}
              className={`flex-row py-3 ${index < FEATURES.length - 1 ? "border-b border-surface-border" : ""}`}
            >
              <View className="flex-1">
                <Text className="text-slate-500 text-xs mb-0.5">Free</Text>
                <Text className="text-slate-300 text-sm">{row.free}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-brand-400 text-xs mb-0.5">Premium</Text>
                <Text className="text-white text-sm font-medium">{row.premium}</Text>
              </View>
            </View>
          ))}
        </Card>

        {loading ? (
          <ActivityIndicator color={colors.brand[400]} className="py-8" />
        ) : packages.length === 0 ? (
          <Card className="mb-4">
            <Text className="text-slate-300 text-center text-sm">
              Subscriptions are not configured yet. Set EXPO_PUBLIC_REVENUECAT_IOS_KEY and
              configure products in RevenueCat.
            </Text>
          </Card>
        ) : (
          packages.map((pkg) => (
            <View key={pkg.identifier} className="mb-4">
              <Button
                label={`${pkg.product.title} — ${pkg.product.priceString}${periodLabel(pkg)}`}
                onPress={() => handlePurchase(pkg)}
                loading={purchasing}
                fullWidth
              />
              <Text className="text-slate-500 text-xs text-center mt-2">
                Auto-renews at {pkg.product.priceString}/{periodWord(pkg)} unless cancelled at least 24 hours before the end of the current period.
              </Text>
            </View>
          ))
        )}

        <TouchableOpacity className="py-4 items-center" onPress={handleRestore} disabled={purchasing}>
          <Text className="text-slate-400 text-sm">Restore purchases</Text>
        </TouchableOpacity>

        <Text className="text-slate-600 text-xs text-center leading-5 px-4">
          Payment charged to your Apple ID account. Manage or cancel your subscription anytime in{" "}
          Settings {">"} Apple ID {">"} Subscriptions.
        </Text>
        <View className="flex-row justify-center items-center gap-2 mt-4 mb-2">
          <TouchableOpacity
            className="px-3 py-2"
            onPress={() => router.push("/legal/terms" as Href)}
          >
            <Text className="text-brand-400 text-sm underline">Terms of Use</Text>
          </TouchableOpacity>
          <Text className="text-slate-600">·</Text>
          <TouchableOpacity
            className="px-3 py-2"
            onPress={() => router.push("/legal/privacy" as Href)}
          >
            <Text className="text-brand-400 text-sm underline">Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
