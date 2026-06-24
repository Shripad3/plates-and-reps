import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
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
import { colors } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import type { ChatMessage } from "@/types";

const DISCLAIMER_KEY = "ai_chat_disclaimer_seen";

const SUGGESTED_PROMPTS = [
  "What have I eaten today?",
  "How's my protein goal going?",
  "Log my weight to 75 kg",
];

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const content = message.content ?? "";

  async function handleCopy() {
    if (!content.trim()) return;
    await Clipboard.setStringAsync(content);
    Alert.alert("Copied", "Message copied to clipboard.");
  }

  return (
    <View className={`mb-3 ${isUser ? "items-end" : "items-start"}`}>
      {!isUser && (
        <View className="flex-row items-center gap-1.5 mb-1">
          <View className="w-5 h-5 rounded-full bg-brand-500/20 items-center justify-center">
            <Ionicons name="sparkles" size={10} color={colors.brand[400]} />
          </View>
          <Text className="text-slate-400 text-xs font-medium">{APP_AI_NAME}</Text>
        </View>
      )}
      <TouchableOpacity
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-brand-500 rounded-br-sm"
            : "bg-surface-card border border-surface-border rounded-bl-sm"
        }`}
        onLongPress={handleCopy}
        activeOpacity={0.85}
      >
        <Text className={`text-base leading-relaxed ${isUser ? "text-white" : "text-slate-100"}`}>
          {content}
        </Text>
      </TouchableOpacity>
      <Text className="text-slate-600 text-xs mt-1 px-1">
        {new Date(message.created_at).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationReady, setConversationReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  // Load the most recent conversation or create a new one
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
    AsyncStorage.getItem(DISCLAIMER_KEY).then((seen) => {
      if (!seen) {
        Alert.alert(
          "AI fitness coach",
          `${APP_AI_NAME} provides general fitness guidance, not medical advice. Always consult a healthcare professional for health decisions.`,
          [{ text: "Got it", onPress: () => AsyncStorage.setItem(DISCLAIMER_KEY, "1") }]
        );
      }
    });
  }, []);

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
      if (!baseUrl) {
        throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
      }
      const aiChatEndpoint = `${baseUrl}/functions/v1/ai-chat`;

      const response = await fetch(
        aiChatEndpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ conversation_id: conversationId, message: text }),
        }
      );

      const raw = await response.text().catch(() => "");
      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        let errMsg = raw || "Unknown error";
        let errCode: string | undefined;
        try {
          const json = JSON.parse(raw);
          errMsg = json.error ?? json.message ?? raw;
          errCode = json.code;
        } catch {
          // use raw text
        }
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

      if (contentType.includes("application/json")) {
        try {
          const json = JSON.parse(raw);
          if (json.error) throw new Error(json.error);
          finalText = json.content ?? json.message ?? "";
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
            finalText += JSON.parse(data).choices?.[0]?.delta?.content ?? "";
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
          m.id === assistantPlaceholderId ? { ...m, content: finalText } : m
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

  return (
    <SwipeBackGesture>
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center gap-3 border-b border-surface-border">
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </TouchableOpacity>
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
                icon="sparkles-outline"
                title={`Hi, I'm your ${APP_AI_NAME}`}
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
                placeholder="Ask me anything…"
                value={input}
                onChangeText={setInput}
                multiline
                returnKeyType="default"
              />
              <TouchableOpacity
                className={`rounded-xl p-2.5 mb-0.5 ${
                  input.trim() && !isStreaming
                    ? "bg-brand-500"
                    : "bg-surface-elevated"
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
