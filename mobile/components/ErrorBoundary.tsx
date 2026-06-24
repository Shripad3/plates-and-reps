import React, { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { captureError } from "@/lib/errorReporting";
import { APP_NAME } from "@/constants";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    captureError(error, { boundary: "root" });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 bg-surface items-center justify-center px-8">
          <Text className="text-white text-xl font-bold mb-2">Something went wrong</Text>
          <Text className="text-slate-400 text-center mb-6">
            {APP_NAME} hit an unexpected error. Try again or restart the app.
          </Text>
          <TouchableOpacity
            className="bg-brand-500 rounded-xl px-6 py-3"
            onPress={() => this.setState({ hasError: false })}
          >
            <Text className="text-white font-semibold">Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}
