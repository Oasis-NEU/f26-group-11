export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      comments: {
        Row: {
          author_id: string
          comment_id: number
          content: string
          created_at: string
          parent_comment_id: number | null
          post_id: number
          updated_at: string
        }
        Insert: {
          author_id: string
          comment_id?: number
          content: string
          created_at?: string
          parent_comment_id?: number | null
          post_id: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          comment_id?: number
          content?: string
          created_at?: string
          parent_comment_id?: number | null
          post_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_post_id_fkey"
            columns: ["parent_comment_id", "post_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["comment_id", "post_id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
        ]
      }
      communities: {
        Row: {
          community_id: number
          course_code: string
          course_name: string
          created_at: string
          description: string | null
          slug: string
        }
        Insert: {
          community_id?: number
          course_code: string
          course_name: string
          created_at?: string
          description?: string | null
          slug: string
        }
        Update: {
          community_id?: number
          course_code?: string
          course_name?: string
          created_at?: string
          description?: string | null
          slug?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          community_id: number
          joined_at: string
          membership_id: number
          role: string
          user_id: string
        }
        Insert: {
          community_id: number
          joined_at?: string
          membership_id?: number
          role?: string
          user_id: string
        }
        Update: {
          community_id?: number
          joined_at?: string
          membership_id?: number
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      community_posts: {
        Row: {
          community_id: number
          community_post_id: number
          post_id: number
          posted_at: string
          removed_at: string | null
        }
        Insert: {
          community_id: number
          community_post_id?: number
          post_id: number
          posted_at?: string
          removed_at?: string | null
        }
        Update: {
          community_id?: number
          community_post_id?: number
          post_id?: number
          posted_at?: string
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_post_id_community_id_fkey"
            columns: ["post_id", "community_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["post_id", "community_id"]
          },
        ]
      }
      community_profs: {
        Row: {
          community_id: number
          community_prof_id: number
          prof_id: string
        }
        Insert: {
          community_id: number
          community_prof_id?: number
          prof_id: string
        }
        Update: {
          community_id?: number
          community_prof_id?: number
          prof_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_profs_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "community_profs_prof_id_fkey"
            columns: ["prof_id"]
            isOneToOne: false
            referencedRelation: "professors"
            referencedColumns: ["prof_id"]
          },
        ]
      }
      course_offerings: {
        Row: {
          community_id: number
          offering_id: number
          prof_id: string
          section: string
          term: string
        }
        Insert: {
          community_id: number
          offering_id?: number
          prof_id: string
          section: string
          term: string
        }
        Update: {
          community_id?: number
          offering_id?: number
          prof_id?: string
          section?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_offerings_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "course_offerings_prof_id_fkey"
            columns: ["prof_id"]
            isOneToOne: false
            referencedRelation: "professors"
            referencedColumns: ["prof_id"]
          },
        ]
      }
      enrollments: {
        Row: {
          enrollment_id: number
          offering_id: number
          user_id: string
        }
        Insert: {
          enrollment_id?: number
          offering_id: number
          user_id: string
        }
        Update: {
          enrollment_id?: number
          offering_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["offering_id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      post_votes: {
        Row: {
          created_at: string
          post_id: number
          updated_at: string
          user_id: string
          vote_id: number
        }
        Insert: {
          created_at?: string
          post_id: number
          updated_at?: string
          user_id: string
          vote_id?: number
        }
        Update: {
          created_at?: string
          post_id?: number
          updated_at?: string
          user_id?: string
          vote_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          community_id: number
          content: string
          created_at: string
          post_id: number
          title: string
        }
        Insert: {
          author_id: string
          community_id: number
          content: string
          created_at?: string
          post_id?: number
          title: string
        }
        Update: {
          author_id?: string
          community_id?: number
          content?: string
          created_at?: string
          post_id?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["community_id"]
          },
        ]
      }
      professors: {
        Row: {
          email: string | null
          first_name: string | null
          last_name: string | null
          prof_id: string
        }
        Insert: {
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          prof_id: string
        }
        Update: {
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          prof_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          comments_schema_note: string | null
          display_name: string | null
          email: string
          first_name: string | null
          last_name: string | null
          major: string | null
          minor: string | null
          user_id: string
          year: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          comments_schema_note?: string | null
          display_name?: string | null
          email: string
          first_name?: string | null
          last_name?: string | null
          major?: string | null
          minor?: string | null
          user_id?: string
          year?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          comments_schema_note?: string | null
          display_name?: string | null
          email?: string
          first_name?: string | null
          last_name?: string | null
          major?: string | null
          minor?: string | null
          user_id?: string
          year?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
