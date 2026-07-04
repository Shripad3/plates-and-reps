import { ScrollView, Text, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { APP_NAME, APP_AI_NAME, SUPPORT_EMAIL, PRIVACY_POLICY_URL } from "@/constants";

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScreenHeader title="Privacy Policy" />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          {APP_NAME} (&quot;we&quot;, &quot;us&quot;) collects account information, nutrition and
          workout logs, body metrics, social activity, and AI chat content to provide tracking and
          coaching features.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          <Text className="text-white font-semibold">Data we collect{"\n"}</Text>
          Email address, display name, and profile settings; food and workout logs; weight entries;
          photos and voice recordings you submit for AI food logging; purchase status via Apple and
          RevenueCat; usage data needed to enforce free-tier limits.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          <Text className="text-white font-semibold">How we use data{"\n"}</Text>
          To operate the app, sync your account across devices, provide {APP_AI_NAME} responses,
          show social feed activity to people you connect with, and manage subscriptions. Food
          photos and voice recordings are processed by our servers using Groq for analysis.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          <Text className="text-white font-semibold">Third parties{"\n"}</Text>
          Supabase (database and authentication), Groq (AI processing), RevenueCat and Apple (in-app
          purchases), and optional Sentry (crash reporting if enabled in production builds).
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          <Text className="text-white font-semibold">Children&apos;s privacy{"\n"}</Text>
          {APP_NAME} is not intended for children under 13, and we do not knowingly collect
          information from anyone under 13. If you believe a child under 13 has created an
          account, contact us so we can delete it.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          <Text className="text-white font-semibold">Account deletion{"\n"}</Text>
          You can delete your account in the app under Account → Delete account. This permanently
          removes your profile and associated logs. Active subscriptions must be cancelled in iOS
          Settings → Apple ID → Subscriptions.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          <Text className="text-white font-semibold">Contact{"\n"}</Text>
          Questions or deletion requests:{" "}
          <Text
            className="text-brand-400"
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          >
            {SUPPORT_EMAIL}
          </Text>
        </Text>
        <Text
          className="text-brand-400 text-sm mb-4"
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
        >
          View web version
        </Text>
        <Text className="text-slate-500 text-xs">Last updated: June 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
