import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/lib/api";
import { isPremiumProfile } from "@/lib/premium";
import { getCustomerPremiumStatus } from "@/lib/purchases";
import { useAuthStore } from "@/stores/authStore";

export function usePremium() {
  const userId = useAuthStore((s) => s.user?.id);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: !!userId,
  });

  const { data: rcPremium, isLoading: rcLoading } = useQuery({
    queryKey: ["rc-premium", userId],
    queryFn: getCustomerPremiumStatus,
    enabled: !!userId,
    staleTime: 60_000,
  });

  return {
    profile,
    isLoading: profileLoading || rcLoading,
    isPremium: isPremiumProfile(profile) || !!rcPremium,
  };
}
