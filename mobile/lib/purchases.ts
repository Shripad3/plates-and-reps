import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  PACKAGE_TYPE,
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

function periodLabelForPackage(pkg: PurchasesPackage): string {
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

export type SubscriptionDetails = {
  title: string;
  priceString: string;
  period: string;
  expirationDate: string | null;
};

export async function getSubscriptionDetails(): Promise<SubscriptionDetails | null> {
  if (!isPurchasesConfigured()) return null;
  try {
    const [info, offerings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);
    const entitlement = info.entitlements.active[ENTITLEMENT_ID];
    if (!entitlement) return null;

    const packages = offerings.current?.availablePackages ?? [];
    const pkg = packages.find((p) => p.product.identifier === entitlement.productIdentifier);

    return {
      title: pkg?.product.title ?? entitlement.productIdentifier,
      priceString: pkg?.product.priceString ?? "",
      period: pkg ? periodLabelForPackage(pkg) : "",
      expirationDate: entitlement.expirationDate ?? null,
    };
  } catch {
    return null;
  }
}
