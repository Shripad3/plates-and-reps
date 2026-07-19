import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConversations,
  createConversation,
  getChatMessages,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { SUPABASE_URL, APP_AI_NAME } from "@/constants";
import { invalidateAfterAiAction } from "@/lib/invalidateAppData";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureError } from "@/lib/errorReporting";
import { isLimitReachedError } from "@/lib/limitErrors";
import { navigateToPaywall } from "@/lib/navigateToPaywall";
import { AppTextInput } from "@/components/AppTextInput";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { AnimatedKeyboardAvoidingView } from "@/components/AnimatedKeyboardAvoidingView";
import { EmptyState } from "@/components/EmptyState";
import { ChatSkeleton } from "@/components/skeletons/ChatSkeleton";
import { colors } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import type { ChatMessage } from "@/types";

const AI_CONSENT_KEY = "ai_data_consent_v1";

const SUGGESTED_PROMPTS = [
  "What have I eaten today?",
  "How's my protein goal going?",
  "Log my weight to 75 kg",
];

// ── Structured nutrition type (from backend tool result, never regex-parsed) ──

type NutritionSummary = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  log_count: number;
};

type LocalMessage = ChatMessage & { nutritionSummary?: NutritionSummary };

const MACRO_DISPLAY: { key: keyof Pick<NutritionSummary, "protein_g" | "carbs_g" | "fat_g">; label: string; color: string }[] = [
  { key: "protein_g", label: "Protein", color: colors.macro.protein },
  { key: "carbs_g",   label: "Carbs",   color: colors.macro.carbs   },
  { key: "fat_g",     label: "Fat",     color: colors.macro.fat     },
];

function NutritionStatCard({ summary }: { summary: NutritionSummary }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface.elevated,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.surface.border,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 36, fontWeight: "800", color: colors.text.primary, letterSpacing: -1.5 }}>
        {summary.calories.toLocaleString()}
      </Text>
      <Text style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
        kcal today
      </Text>

      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.surface.border, marginVertical: 12 }} />

      <View style={{ flexDirection: "row", gap: 20 }}>
        {MACRO_DISPLAY.map(({ key, label, color }) => (
          <View key={key}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
              <Text style={{ fontSize: 11, color: colors.text.muted }}>{label}</Text>
            </View>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text.primary }}>
              {summary[key]}g
            </Text>
          </View>
        ))}
      </View>

      {summary.log_count > 0 && (
        <>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.surface.border, marginTop: 12, marginBottom: 8 }} />
          <Text style={{ fontSize: 11, color: colors.text.muted }}>
            across {summary.log_count} logged items.
          </Text>
        </>
      )}
    </View>
  );
}

// ── Coach monogram ────────────────────────────────────────────────────────────

function CoachMonogram({ size = 20 }: { size?: number }) {
  const iconSize = Math.round(size * 0.55);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundColor: colors.brand[500],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="barbell-outline" size={iconSize} color={colors.white} />
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === "user";
  const content = message.content ?? "";
  const { nutritionSummary } = message;

  async function handleCopy() {
    if (!content.trim()) return;
    await Clipboard.setStringAsync(content);
    Alert.alert("Copied", "Message copied to clipboard.");
  }

  return (
    <View className={`mb-3 ${isUser ? "items-end" : "items-start"}`}>
      {!isUser && (
        <View className="flex-row items-center gap-1.5 mb-1">
          <CoachMonogram size={20} />
          <Text className="text-slate-400 text-xs font-medium">{APP_AI_NAME}</Text>
        </View>
      )}

      {nutritionSummary ? (
        <TouchableOpacity
          style={{ maxWidth: "85%" }}
          onLongPress={handleCopy}
          activeOpacity={0.85}
        >
          <NutritionStatCard summary={nutritionSummary} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-brand-500 rounded-br-sm"
              : "bg-surface-card border border-surface-border rounded-bl-sm"
          }`}
          onLongPress={handleCopy}
          activeOpacity={0.85}
        >
          {content.length > 0 ? (
            <Text className={`leading-relaxed ${isUser ? "text-white text-base" : "text-slate-300 text-sm"}`}>
              {content}
            </Text>
          ) : (
            <ActivityIndicator size="small" color={colors.brand[400]} />
          )}
        </TouchableOpacity>
      )}

      <Text className="text-slate-600 text-xs mt-1 px-1">
        {new Date(message.created_at).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationReady, setConversationReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // "loading" → reading AsyncStorage; "pending" → show consent form; "declined" → user said no; "agreed" → full access
  const [consentStatus, setConsentStatus] = useState<"loading" | "pending" | "declined" | "agreed">("loading");
  const listRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    getConversations()
      .then(async (convs) => {
        if (convs.length > 0) {
          const latest = convs[0];
          setConversationId(latest.id);
          const history = await getChatMessages(latest.id);
          setMessages(history);
        } else {
          const conv = await createConversation();
          setConversationId(conv.id);
        }
      })
      .catch(() => {
        Alert.alert("Error", "Could not load chat. Pull to retry or start a new chat.");
      })
      .finally(() => setConversationReady(true));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(AI_CONSENT_KEY).then((stored) => {
      if (stored === "agreed") setConsentStatus("agreed");
      else if (stored === "declined") setConsentStatus("declined");
      else setConsentStatus("pending");
    });
  }, []);

  async function grantConsent() {
    await AsyncStorage.setItem(AI_CONSENT_KEY, "agreed");
    setConsentStatus("agreed");
  }

  async function declineConsent() {
    await AsyncStorage.setItem(AI_CONSENT_KEY, "declined");
    setConsentStatus("declined");
  }

  async function sendMessage(text: string) {
    if (!text.trim() || !conversationId || isStreaming) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      conversation_id: conversationId,
      role: "user",
      content: text,
      tool_calls: null,
      tool_call_id: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantPlaceholderId = `tmp-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantPlaceholderId,
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        tool_calls: null,
        tool_call_id: null,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, "");
      if (!baseUrl) throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");

      const response = await fetch(`${baseUrl}/functions/v1/ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: conversationId, message: text }),
      });

      const raw = await response.text().catch(() => "");
      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        let errMsg = raw || "Unknown error";
        let errCode: string | undefined;
        try {
          const json = JSON.parse(raw);
          errMsg = json.error ?? json.message ?? raw;
          errCode = json.code;
        } catch {}
        if (response.status === 429 || errCode === "LIMIT_REACHED") {
          const limitErr = new Error(errMsg);
          (limitErr as Error & { code?: string }).code = "LIMIT_REACHED";
          throw limitErr;
        }
        throw new Error(
          response.status >= 500
            ? "Couldn't reach your coach. Pull to refresh and try again."
            : errMsg
        );
      }

      let finalText = "";
      let nutritionSummary: NutritionSummary | undefined;

      if (contentType.includes("application/json")) {
        try {
          const json = JSON.parse(raw);
          if (json.error) throw new Error(json.error);
          finalText = json.content ?? json.message ?? "";
          if (json.nutrition_summary) nutritionSummary = json.nutrition_summary;
        } catch (err) {
          if (err instanceof Error && err.message !== raw) throw err;
        }
      }

      if (!finalText.trim()) {
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.nutrition_summary) {
              nutritionSummary = parsed.nutrition_summary as NutritionSummary;
            } else {
              finalText += parsed.choices?.[0]?.delta?.content ?? "";
            }
          } catch {}
        }
      }

      if (!finalText.trim()) {
        try {
          const json = JSON.parse(raw);
          if (json.error) throw new Error(json.error);
        } catch {}
        throw new Error("Empty AI response");
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantPlaceholderId
            ? { ...m, content: finalText, ...(nutritionSummary ? { nutritionSummary } : {}) }
            : m
        )
      );
    } catch (err) {
      captureError(err, { scope: "ai-chat" });
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (isLimitReachedError(err)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantPlaceholderId
              ? {
                  ...m,
                  content:
                    "You've reached your free daily AI chat limit. Upgrade to Premium for unlimited coaching.",
                }
              : m
          )
        );
        Alert.alert("Daily limit reached", msg, [
          { text: "Not now", style: "cancel" },
          { text: "Upgrade", onPress: navigateToPaywall },
        ]);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantPlaceholderId
              ? { ...m, content: `Sorry, something went wrong.\n\n${msg}` }
              : m
          )
        );
      }
    }

    setIsStreaming(false);
    invalidateAfterAiAction(queryClient);
  }

  async function handleRefresh() {
    if (!conversationId) return;
    setRefreshing(true);
    try {
      const history = await getChatMessages(conversationId);
      setMessages(history);
      invalidateAfterAiAction(queryClient);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  if (consentStatus === "loading") {
    return (
      <SwipeBackGesture>
        <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
          <ChatSkeleton />
        </SafeAreaView>
      </SwipeBackGesture>
    );
  }

  if (consentStatus === "pending") {
    return (
      <SwipeBackGesture>
        <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
          <View className="px-5 pt-2 pb-3 flex-row items-center gap-3 border-b border-surface-border">
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
            <CoachMonogram size={36} />
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">{APP_AI_NAME}</Text>
              <Text className="text-slate-400 text-xs">Fitness coach</Text>
            </View>
          </View>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 24, paddingBottom: Math.max(insets.bottom + 24, 40) }}
          >
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text.primary, marginBottom: 8, letterSpacing: -0.5 }}>
              Before you start
            </Text>
            <Text style={{ fontSize: 14, color: colors.text.muted, lineHeight: 22, marginBottom: 24 }}>
              To give you personalised coaching, your app sends the following data to{" "}
              <Text style={{ color: colors.text.primary, fontWeight: "600" }}>Groq, Inc.</Text>
              {" "}(our AI provider):
            </Text>

            {[
              { icon: "person-outline" as const,        label: "Display name, height, and activity level" },
              { icon: "flag-outline" as const,           label: "Your fitness goals and target macros" },
              { icon: "restaurant-outline" as const,     label: "Today's nutrition logs and totals" },
              { icon: "barbell-outline" as const,        label: "Recent workout history" },
              { icon: "scale-outline" as const,          label: "Logged body weight entries" },
            ].map(({ icon, label }) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                <Ionicons name={icon} size={18} color={colors.brand[400]} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 14, color: colors.text.secondary, flex: 1, lineHeight: 22 }}>
                  {label}
                </Text>
              </View>
            ))}

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.surface.border, marginVertical: 20 }} />

            <Text style={{ fontSize: 12, color: colors.text.muted, lineHeight: 19, marginBottom: 28 }}>
              This data is sent only when you send a message and is subject to Groq's privacy policy.
              It is not used to train AI models. You can withdraw consent at any time by closing the
              coach and tapping "Review consent."
            </Text>

            <TouchableOpacity
              onPress={grantConsent}
              style={{
                backgroundColor: colors.brand[500],
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: colors.white, fontWeight: "700", fontSize: 16 }}>I Agree</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={declineConsent}
              style={{
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.surface.border,
              }}
            >
              <Text style={{ color: colors.text.muted, fontWeight: "600", fontSize: 15 }}>Don't Use AI</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </SwipeBackGesture>
    );
  }

  if (consentStatus === "declined") {
    return (
      <SwipeBackGesture>
        <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
          <View className="px-5 pt-2 pb-3 flex-row items-center gap-3 border-b border-surface-border">
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
            <CoachMonogram size={36} />
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">{APP_AI_NAME}</Text>
              <Text className="text-slate-400 text-xs">Fitness coach</Text>
            </View>
          </View>
          <View className="flex-1 px-6 items-center justify-center" style={{ gap: 20 }}>
            <Ionicons name="lock-closed-outline" size={44} color={colors.text.muted} />
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text.primary, textAlign: "center" }}>
              AI coach is off
            </Text>
            <Text style={{ fontSize: 14, color: colors.text.muted, textAlign: "center", lineHeight: 22 }}>
              You declined data sharing with Groq, Inc. The coach isn't available without it.
            </Text>
            <TouchableOpacity
              onPress={() => setConsentStatus("pending")}
              style={{
                backgroundColor: colors.brand[500],
                borderRadius: 14,
                paddingHorizontal: 28,
                paddingVertical: 14,
                marginTop: 8,
              }}
            >
              <Text style={{ color: colors.white, fontWeight: "700", fontSize: 15 }}>Review consent</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SwipeBackGesture>
    );
  }

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <View className="flex-1">
          {/* Header */}
          <View className="px-5 pt-2 pb-3 flex-row items-center gap-3 border-b border-surface-border">
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
            <CoachMonogram size={36} />
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">{APP_AI_NAME}</Text>
              <Text className="text-slate-400 text-xs">Fitness coach</Text>
            </View>
            <TouchableOpacity
              onPress={async () => {
                const conv = await createConversation();
                setConversationId(conv.id);
                setMessages([]);
              }}
            >
              <Text className="text-slate-400 text-xs">New chat</Text>
            </TouchableOpacity>
            {isStreaming && <ActivityIndicator size="small" color={colors.brand[400]} />}
          </View>

          {/* Messages */}
          <FlatList
            ref={listRef}
            className="flex-1"
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerClassName="px-5 pt-4 pb-4"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brand[400]}
              />
            }
            renderItem={({ item }) => <MessageBubble message={item} />}
            ListEmptyComponent={
              <View className="py-8">
                <EmptyState
                  icon="barbell-outline"
                  title="Your coach is ready"
                  description="I know your nutrition, workouts, and goals. Ask me anything or tell me to log something."
                />
                <View className="gap-2 w-full px-1">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <TouchableOpacity
                      key={p}
                      className={`bg-surface-card border border-surface-border rounded-xl px-4 py-3 ${!conversationReady || isStreaming ? "opacity-50" : ""}`}
                      onPress={() => sendMessage(p)}
                      disabled={!conversationReady || isStreaming}
                    >
                      <Text className="text-slate-300 text-sm">{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            }
          />

          {/* Input */}
          <AnimatedKeyboardAvoidingView extraOffset={Math.max(insets.bottom, 10)}>
            <View className="px-4 pt-3 border-t border-surface-border">
              <View className="flex-row items-end gap-3 bg-surface-card border border-surface-border rounded-2xl px-4 py-2">
                <AppTextInput
                  className="flex-1 text-white max-h-28"
                  variant="chat"
                  placeholder="Ask your coach…"
                  value={input}
                  onChangeText={setInput}
                  multiline
                  returnKeyType="default"
                />
                <TouchableOpacity
                  className={`rounded-xl p-2.5 mb-0.5 ${
                    input.trim() && !isStreaming ? "bg-brand-500" : "bg-surface-elevated"
                  }`}
                  onPress={() => sendMessage(input)}
                  disabled={!input.trim() || isStreaming || !conversationReady}
                >
                  <Text className="text-white text-sm font-bold">↑</Text>
                </TouchableOpacity>
              </View>
            </View>
          </AnimatedKeyboardAvoidingView>
        </View>
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
