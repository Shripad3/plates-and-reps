export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_feed: {
        Row: {
          activity_type: string
          created_at: string
          id: string
          metadata: Json | null
          reference_id: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      body_metrics: {
        Row: {
          body_fat_pct: number | null
          created_at: string
          date: string
          id: string
          measurements: Json | null
          notes: string | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          created_at?: string
          date: string
          id?: string
          measurements?: Json | null
          notes?: string | null
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          created_at?: string
          date?: string
          id?: string
          measurements?: Json | null
          notes?: string | null
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cardio_sessions: {
        Row: {
          activity_type: string
          avg_heart_rate: number | null
          calories_burned: number | null
          distance_meters: number | null
          duration_seconds: number
          id: string
          is_synced: boolean
          notes: string | null
          route_data: Json | null
          started_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          avg_heart_rate?: number | null
          calories_burned?: number | null
          distance_meters?: number | null
          duration_seconds: number
          id?: string
          is_synced?: boolean
          notes?: string | null
          route_data?: Json | null
          started_at: string
          user_id: string
        }
        Update: {
          activity_type?: string
          avg_heart_rate?: number | null
          calories_burned?: number | null
          distance_meters?: number | null
          duration_seconds?: number
          id?: string
          is_synced?: boolean
          notes?: string | null
          route_data?: Json | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cardio_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_participants: {
        Row: {
          challenge_id: string
          completed_at: string | null
          current_progress: number
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          current_progress?: number
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          current_progress?: number
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          challenge_type: string
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          id: string
          is_public: boolean | null
          max_participants: number | null
          name: string
          start_date: string
          target_unit: string | null
          target_value: number
        }
        Insert: {
          challenge_type: string
          created_at?: string
          created_by: string
          description?: string | null
          end_date: string
          id?: string
          is_public?: boolean | null
          max_participants?: number | null
          name: string
          start_date: string
          target_unit?: string | null
          target_value: number
        }
        Update: {
          challenge_type?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string
          id?: string
          is_public?: boolean | null
          max_participants?: number | null
          name?: string
          start_date?: string
          target_unit?: string | null
          target_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          demo_url: string | null
          equipment: string[] | null
          id: string
          instructions: string | null
          is_custom: boolean | null
          muscle_groups: string[]
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          demo_url?: string | null
          equipment?: string[] | null
          id?: string
          instructions?: string | null
          is_custom?: boolean | null
          muscle_groups?: string[]
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          demo_url?: string | null
          equipment?: string[] | null
          id?: string
          instructions?: string | null
          is_custom?: boolean | null
          muscle_groups?: string[]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_comments: {
        Row: {
          content: string
          created_at: string
          feed_item_id: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          feed_item_id: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          feed_item_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_comments_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "activity_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_reactions: {
        Row: {
          created_at: string
          feed_item_id: string
          id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feed_item_id: string
          id?: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feed_item_id?: string
          id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_reactions_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "activity_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          barcode: string | null
          brand: string | null
          calories_per_serving: number
          carbs_g: number
          created_at: string
          created_by: string | null
          fat_g: number
          fiber_g: number | null
          id: string
          is_verified: boolean | null
          name: string
          protein_g: number
          serving_label: string | null
          serving_size_g: number
          sodium_mg: number | null
          source: string | null
          sugar_g: number | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calories_per_serving: number
          carbs_g?: number
          created_at?: string
          created_by?: string | null
          fat_g?: number
          fiber_g?: number | null
          id?: string
          is_verified?: boolean | null
          name: string
          protein_g?: number
          serving_label?: string | null
          serving_size_g?: number
          sodium_mg?: number | null
          source?: string | null
          sugar_g?: number | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calories_per_serving?: number
          carbs_g?: number
          created_at?: string
          created_by?: string | null
          fat_g?: number
          fiber_g?: number | null
          id?: string
          is_verified?: boolean | null
          name?: string
          protein_g?: number
          serving_label?: string | null
          serving_size_g?: number
          sodium_mg?: number | null
          source?: string | null
          sugar_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "foods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_logs: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string
          date: string
          fat_g: number
          food_id: string | null
          food_name: string | null
          id: string
          log_method: string | null
          meal_type: string
          notes: string | null
          protein_g: number
          servings: number
          user_id: string
        }
        Insert: {
          calories: number
          carbs_g?: number
          created_at?: string
          date: string
          fat_g?: number
          food_id?: string | null
          food_name?: string | null
          id?: string
          log_method?: string | null
          meal_type: string
          notes?: string | null
          protein_g?: number
          servings?: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string
          date?: string
          fat_g?: number
          food_id?: string | null
          food_name?: string | null
          id?: string
          log_method?: string | null
          meal_type?: string
          notes?: string | null
          protein_g?: number
          servings?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_photos: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string | null
          photo_url: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          note?: string | null
          photo_url: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          photo_url?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          connection_type: string
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          connection_type?: string
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          connection_type?: string
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_connections_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_goals: {
        Row: {
          created_at: string
          goal_type: string
          id: string
          is_active: boolean
          start_date: string
          target_calories: number | null
          target_carbs_g: number | null
          target_fat_g: number | null
          target_protein_g: number | null
          target_water_ml: number | null
          target_weight_kg: number | null
          user_id: string
          weekly_workout_target: number | null
        }
        Insert: {
          created_at?: string
          goal_type: string
          id?: string
          is_active?: boolean
          start_date?: string
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          target_water_ml?: number | null
          target_weight_kg?: number | null
          user_id: string
          weekly_workout_target?: number | null
        }
        Update: {
          created_at?: string
          goal_type?: string
          id?: string
          is_active?: boolean
          start_date?: string
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          target_water_ml?: number | null
          target_weight_kg?: number | null
          user_id?: string
          weekly_workout_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          activity_level: string | null
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string
          height_cm: number | null
          id: string
          is_premium: boolean
          premium_until: string | null
          sex: string | null
          updated_at: string
          username: string
        }
        Insert: {
          activity_level?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name: string
          height_cm?: number | null
          id: string
          is_premium?: boolean
          premium_until?: string | null
          sex?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          activity_level?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string
          height_cm?: number | null
          id?: string
          is_premium?: boolean
          premium_until?: string | null
          sex?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          current_streak: number
          id: string
          last_logged_date: string | null
          longest_streak: number
          streak_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          id?: string
          last_logged_date?: string | null
          longest_streak?: number
          streak_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          id?: string
          last_logged_date?: string | null
          longest_streak?: number
          streak_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      water_logs: {
        Row: {
          amount_ml: number
          created_at: string
          date: string
          id: string
          user_id: string
        }
        Insert: {
          amount_ml: number
          created_at?: string
          date: string
          id?: string
          user_id: string
        }
        Update: {
          amount_ml?: number
          created_at?: string
          date?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "water_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          is_synced: boolean
          name: string
          notes: string | null
          started_at: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_synced?: boolean
          name: string
          notes?: string | null
          started_at: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_synced?: boolean
          name?: string
          notes?: string | null
          started_at?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          completed_at: string | null
          distance_meters: number | null
          duration_seconds: number | null
          exercise_id: string
          id: string
          is_warmup: boolean | null
          reps: number | null
          rpe: number | null
          session_id: string
          set_number: number
          weight_kg: number | null
        }
        Insert: {
          completed_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          exercise_id: string
          id?: string
          is_warmup?: boolean | null
          reps?: number | null
          rpe?: number | null
          session_id: string
          set_number: number
          weight_kg?: number | null
        }
        Update: {
          completed_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          exercise_id?: string
          id?: string
          is_warmup?: boolean | null
          reps?: number | null
          rpe?: number | null
          session_id?: string
          set_number?: number
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          created_at: string
          description: string | null
          exercises: Json
          id: string
          is_public: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exercises?: Json
          id?: string
          is_public?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exercises?: Json
          id?: string
          is_public?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
