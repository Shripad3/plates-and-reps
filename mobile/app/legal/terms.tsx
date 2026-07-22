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
          <Text className="text-white font-semibold">Health &amp; nutrition disclaimer{"\n"}</Text>
          {APP_NAME} provides fitness tracking, {APP_AI_NAME} coaching, AI meal plans, and AI workout
          analysis. All of this is general information, not medical, dietary, or medical-nutrition
          advice. AI-generated content may be inaccurate or incomplete. Calorie and nutrition values,
          and any allergen or dietary filtering, are best-effort estimates and are not guaranteed — do
          not rely on them if you have a food allergy, intolerance, or medical condition. Always verify
          ingredients yourself.
        </Text>
        <Text className="text-slate-300 text-sm leading-6 mb-4">
          Consult a qualified healthcare professional or registered dietitian before starting any diet
          or exercise program, particularly if you are pregnant, under 18, or have a medical condition
          or a history of disordered eating. Use of AI plans is at your own risk.
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
        <Text className="text-slate-500 text-xs">Last updated: July 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
