import { ScrollView, Text, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { APP_NAME, APP_AI_NAME, SUPPORT_EMAIL, TERMS_URL } from "@/constants";

export default function TermsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScreenHeader title="Terms of Service" />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          By using {APP_NAME}, you agree to these terms. If you do not agree, do not use the app.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          {APP_NAME} provides fitness tracking and {APP_AI_NAME} coaching. AI guidance is for general
          fitness purposes only and is not medical advice. Consult a healthcare professional before
          starting any diet or exercise program.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          Premium subscriptions renew automatically unless cancelled at least 24 hours before the
          end of the current period. Manage or cancel subscriptions in iOS Settings → Apple ID →
          Subscriptions. Restore purchases is available on the paywall screen.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          You are responsible for the accuracy of data you log. We may update these terms; continued
          use after changes constitutes acceptance.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          Support:{" "}
          <Text
            className="text-brand-400"
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          >
            {SUPPORT_EMAIL}
          </Text>
        </Text>
        <Text className="text-brand-400 text-sm mb-4" onPress={() => Linking.openURL(TERMS_URL)}>
          View web version
        </Text>
        <Text className="text-slate-500 text-xs">Last updated: June 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
