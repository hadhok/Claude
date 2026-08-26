export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; color: string; created_at: string };
        Insert: { id: string; display_name?: string | null; color?: string };
        Update: { display_name?: string | null; color?: string };
        Relationships: [];
      };
      canvases: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          is_public: boolean;
          share_token: string | null;
          created_at: string;
        };
        Insert: { id?: string; owner_id: string; title?: string; is_public?: boolean };
        Update: { title?: string; is_public?: boolean };
        Relationships: [];
      };
      canvas_members: {
        Row: { canvas_id: string; user_id: string; role: "owner" | "editor" | "viewer"; joined_at: string };
        Insert: { canvas_id: string; user_id: string; role?: "owner" | "editor" | "viewer" };
        Update: { role?: "owner" | "editor" | "viewer" };
        Relationships: [];
      };
      nodes: {
        Row: {
          id: string;
          canvas_id: string;
          author_id: string;
          content: string;
          x: number;
          y: number;
          color: string;
          embedding: number[] | null;
          cluster_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          canvas_id: string;
          author_id: string;
          content: string;
          x?: number;
          y?: number;
          color?: string;
          embedding?: number[] | null;
          cluster_id?: number | null;
        };
        Update: {
          content?: string;
          x?: number;
          y?: number;
          color?: string;
          embedding?: number[] | null;
          cluster_id?: number | null;
        };
        Relationships: [];
      };
      edges: {
        Row: {
          id: string;
          canvas_id: string;
          source_id: string;
          target_id: string;
          kind: "auto" | "manual" | "contradiction";
          weight: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          canvas_id: string;
          source_id: string;
          target_id: string;
          kind?: "auto" | "manual" | "contradiction";
          weight?: number | null;
        };
        Update: { weight?: number | null; kind?: "auto" | "manual" | "contradiction" };
        Relationships: [];
      };
      presence: {
        Row: { canvas_id: string; user_id: string; x: number; y: number; updated_at: string };
        Insert: { canvas_id: string; user_id: string; x?: number; y?: number };
        Update: { x?: number; y?: number };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Canvas = Database["public"]["Tables"]["canvases"]["Row"];
export type CanvasMember = Database["public"]["Tables"]["canvas_members"]["Row"];
export type Node = Database["public"]["Tables"]["nodes"]["Row"];
export type Edge = Database["public"]["Tables"]["edges"]["Row"];
export type Presence = Database["public"]["Tables"]["presence"]["Row"];
