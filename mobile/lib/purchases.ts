import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  LOG_LEVEL,
} from "react-native-purchases";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ENTITLEMENT_ID = "premium";

let configured = false;

function isIosPurchasesAvailable(): boolean {
  return Platform.OS === "ios" && !!IOS_KEY;
}

export function isPurchasesConfigured(): boolean {
  return configured && isIosPurchasesAvailable();
}

export async function initPurchases(userId?: string): Promise<void> {
  if (!isIosPurchasesAvailable() || !userId) return;
  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure({ apiKey: IOS_KEY, appUserID: userId });
    configured = true;
    return;
  }

  const currentId = await Purchases.getAppUserID();
  if (currentId !== userId) {
    await Purchases.logIn(userId);
  }
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  if (!isPurchasesConfigured()) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export function hasPremiumEntitlement(info: CustomerInfo): boolean {
  return !!info.entitlements.active[ENTITLEMENT_ID];
}

export async function getCustomerPremiumStatus(): Promise<boolean> {
  if (!isPurchasesConfigured()) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return hasPremiumEntitlement(info);
  } catch {
    return false;
  }
}
