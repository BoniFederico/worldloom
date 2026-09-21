export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      calendars: {
        Row: {
          created_at: string;
          created_by: string | null;
          definition: Json;
          id: string;
          name: string;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          definition: Json;
          id?: string;
          name: string;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          definition?: Json;
          id?: string;
          name?: string;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendars_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      campaign_invites: {
        Row: {
          campaign_id: string;
          created_at: string;
          created_by: string;
          email: string | null;
          expires_at: string;
          id: string;
          max_uses: number;
          revoked_at: string | null;
          role: Database['public']['Enums']['campaign_role'];
          token: string;
          uses: number;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          created_by: string;
          email?: string | null;
          expires_at: string;
          id?: string;
          max_uses?: number;
          revoked_at?: string | null;
          role: Database['public']['Enums']['campaign_role'];
          token?: string;
          uses?: number;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          created_by?: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          max_uses?: number;
          revoked_at?: string | null;
          role?: Database['public']['Enums']['campaign_role'];
          token?: string;
          uses?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'campaign_invites_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      campaign_members: {
        Row: {
          campaign_id: string;
          created_at: string;
          role: Database['public']['Enums']['campaign_role'];
          user_id: string;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          role: Database['public']['Enums']['campaign_role'];
          user_id: string;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          role?: Database['public']['Enums']['campaign_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'campaign_members_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      campaign_stats: {
        Row: {
          campaign_id: string;
          rev: number;
          schema: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          campaign_id: string;
          rev?: number;
          schema: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          campaign_id?: string;
          rev?: number;
          schema?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'campaign_stats_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: true;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      campaigns: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
          world_id: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
          world_id?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
          world_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'campaigns_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          color: string | null;
          content_template: Json | null;
          created_at: string;
          fields_schema: Json;
          icon: string | null;
          id: string;
          name: string;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          color?: string | null;
          content_template?: Json | null;
          created_at?: string;
          fields_schema?: Json;
          icon?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          color?: string | null;
          content_template?: Json | null;
          created_at?: string;
          fields_schema?: Json;
          icon?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      character_history: {
        Row: {
          action: string;
          campaign_id: string;
          changed_by: string | null;
          changes: Json;
          character_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          action: string;
          campaign_id: string;
          changed_by?: string | null;
          changes?: Json;
          character_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          action?: string;
          campaign_id?: string;
          changed_by?: string | null;
          changes?: Json;
          character_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'character_history_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'character_history_character_id_fkey';
            columns: ['character_id'];
            isOneToOne: false;
            referencedRelation: 'characters';
            referencedColumns: ['id'];
          },
        ];
      };
      characters: {
        Row: {
          campaign_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: Database['public']['Enums']['character_kind'];
          name: string;
          notes: string;
          owner_id: string | null;
          rev: number;
          sheet: Json;
          updated_at: string;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: Database['public']['Enums']['character_kind'];
          name: string;
          notes?: string;
          owner_id?: string | null;
          rev?: number;
          sheet?: Json;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['character_kind'];
          name?: string;
          notes?: string;
          owner_id?: string | null;
          rev?: number;
          sheet?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'characters_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      map_pins: {
        Row: {
          created_at: string;
          id: string;
          map_id: string;
          snippet_id: string;
          updated_at: string;
          visibility: Database['public']['Enums']['visibility'];
          world_id: string;
          x: number;
          y: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          map_id: string;
          snippet_id: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['visibility'];
          world_id: string;
          x: number;
          y: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          map_id?: string;
          snippet_id?: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['visibility'];
          world_id?: string;
          x?: number;
          y?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'map_pins_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'map_pins_world_id_map_id_fkey';
            columns: ['world_id', 'map_id'];
            isOneToOne: false;
            referencedRelation: 'maps';
            referencedColumns: ['world_id', 'id'];
          },
          {
            foreignKeyName: 'map_pins_world_id_snippet_id_fkey';
            columns: ['world_id', 'snippet_id'];
            isOneToOne: false;
            referencedRelation: 'snippets';
            referencedColumns: ['world_id', 'id'];
          },
        ];
      };
      map_routes: {
        Row: {
          created_at: string;
          id: string;
          map_id: string;
          name: string;
          stops: string[];
          updated_at: string;
          world_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          map_id: string;
          name: string;
          stops: string[];
          updated_at?: string;
          world_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          map_id?: string;
          name?: string;
          stops?: string[];
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'map_routes_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'map_routes_world_id_map_id_fkey';
            columns: ['world_id', 'map_id'];
            isOneToOne: false;
            referencedRelation: 'maps';
            referencedColumns: ['world_id', 'id'];
          },
        ];
      };
      maps: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          image: string;
          name: string;
          snippet_id: string | null;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          image: string;
          name: string;
          snippet_id?: string | null;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          image?: string;
          name?: string;
          snippet_id?: string | null;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'maps_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maps_world_id_snippet_id_fkey';
            columns: ['world_id', 'snippet_id'];
            isOneToOne: false;
            referencedRelation: 'snippets';
            referencedColumns: ['world_id', 'id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string;
          id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      relation_types: {
        Row: {
          created_at: string;
          id: string;
          inverse_label: string | null;
          label: string;
          source_category_id: string | null;
          target_category_id: string | null;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          inverse_label?: string | null;
          label: string;
          source_category_id?: string | null;
          target_category_id?: string | null;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          inverse_label?: string | null;
          label?: string;
          source_category_id?: string | null;
          target_category_id?: string | null;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'relation_types_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'relation_types_world_id_source_category_id_fkey';
            columns: ['world_id', 'source_category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['world_id', 'id'];
          },
          {
            foreignKeyName: 'relation_types_world_id_target_category_id_fkey';
            columns: ['world_id', 'target_category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['world_id', 'id'];
          },
        ];
      };
      relations: {
        Row: {
          created_at: string;
          created_by: string;
          fields: Json;
          from_mention: boolean;
          id: string;
          inverse_label: string | null;
          label: string;
          notes: string;
          source_id: string;
          target_id: string;
          updated_at: string;
          valid_from: Json | null;
          valid_to: Json | null;
          visibility: Database['public']['Enums']['visibility'];
          world_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          fields?: Json;
          from_mention?: boolean;
          id?: string;
          inverse_label?: string | null;
          label: string;
          notes?: string;
          source_id: string;
          target_id: string;
          updated_at?: string;
          valid_from?: Json | null;
          valid_to?: Json | null;
          visibility?: Database['public']['Enums']['visibility'];
          world_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          fields?: Json;
          from_mention?: boolean;
          id?: string;
          inverse_label?: string | null;
          label?: string;
          notes?: string;
          source_id?: string;
          target_id?: string;
          updated_at?: string;
          valid_from?: Json | null;
          valid_to?: Json | null;
          visibility?: Database['public']['Enums']['visibility'];
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'relations_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'relations_world_id_source_id_fkey';
            columns: ['world_id', 'source_id'];
            isOneToOne: false;
            referencedRelation: 'snippets';
            referencedColumns: ['world_id', 'id'];
          },
          {
            foreignKeyName: 'relations_world_id_target_id_fkey';
            columns: ['world_id', 'target_id'];
            isOneToOne: false;
            referencedRelation: 'snippets';
            referencedColumns: ['world_id', 'id'];
          },
        ];
      };
      saved_views: {
        Row: {
          config: Json;
          created_at: string;
          created_by: string;
          filters: Json;
          id: string;
          kind: string;
          name: string;
          shared: boolean;
          updated_at: string;
          world_id: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          created_by: string;
          filters?: Json;
          id?: string;
          kind: string;
          name: string;
          shared?: boolean;
          updated_at?: string;
          world_id: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          created_by?: string;
          filters?: Json;
          id?: string;
          kind?: string;
          name?: string;
          shared?: boolean;
          updated_at?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'saved_views_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      snippet_categories: {
        Row: {
          category_id: string;
          snippet_id: string;
          world_id: string;
        };
        Insert: {
          category_id: string;
          snippet_id: string;
          world_id: string;
        };
        Update: {
          category_id?: string;
          snippet_id?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'snippet_categories_world_id_category_id_fkey';
            columns: ['world_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['world_id', 'id'];
          },
          {
            foreignKeyName: 'snippet_categories_world_id_snippet_id_fkey';
            columns: ['world_id', 'snippet_id'];
            isOneToOne: false;
            referencedRelation: 'snippets';
            referencedColumns: ['world_id', 'id'];
          },
        ];
      };
      snippet_restricted_fields: {
        Row: {
          key: string;
          snippet_id: string;
          value: Json;
          visibility: Database['public']['Enums']['visibility'];
          world_id: string;
        };
        Insert: {
          key: string;
          snippet_id: string;
          value: Json;
          visibility: Database['public']['Enums']['visibility'];
          world_id: string;
        };
        Update: {
          key?: string;
          snippet_id?: string;
          value?: Json;
          visibility?: Database['public']['Enums']['visibility'];
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'snippet_restricted_fields_world_id_snippet_id_fkey';
            columns: ['world_id', 'snippet_id'];
            isOneToOne: false;
            referencedRelation: 'snippets';
            referencedColumns: ['world_id', 'id'];
          },
        ];
      };
      snippet_versions: {
        Row: {
          aliases: string[];
          body: Json;
          created_at: string;
          created_by: string | null;
          fields: Json;
          id: string;
          restored_from: number | null;
          snippet_id: string;
          status: Database['public']['Enums']['snippet_status'];
          tags: string[];
          title: string;
          version: number;
          world_id: string;
        };
        Insert: {
          aliases?: string[];
          body?: Json;
          created_at?: string;
          created_by?: string | null;
          fields?: Json;
          id?: string;
          restored_from?: number | null;
          snippet_id: string;
          status?: Database['public']['Enums']['snippet_status'];
          tags?: string[];
          title: string;
          version: number;
          world_id: string;
        };
        Update: {
          aliases?: string[];
          body?: Json;
          created_at?: string;
          created_by?: string | null;
          fields?: Json;
          id?: string;
          restored_from?: number | null;
          snippet_id?: string;
          status?: Database['public']['Enums']['snippet_status'];
          tags?: string[];
          title?: string;
          version?: number;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'snippet_versions_world_id_snippet_id_fkey';
            columns: ['world_id', 'snippet_id'];
            isOneToOne: false;
            referencedRelation: 'snippets';
            referencedColumns: ['world_id', 'id'];
          },
        ];
      };
      snippets: {
        Row: {
          aliases: string[];
          archived_at: string | null;
          body: Json;
          body_text: string;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          fields: Json;
          id: string;
          search: unknown;
          status: Database['public']['Enums']['snippet_status'];
          tags: string[];
          title: string;
          updated_at: string;
          visibility: Database['public']['Enums']['visibility'];
          world_id: string;
        };
        Insert: {
          aliases?: string[];
          archived_at?: string | null;
          body?: Json;
          body_text?: string;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          fields?: Json;
          id?: string;
          search?: unknown;
          status?: Database['public']['Enums']['snippet_status'];
          tags?: string[];
          title: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['visibility'];
          world_id: string;
        };
        Update: {
          aliases?: string[];
          archived_at?: string | null;
          body?: Json;
          body_text?: string;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          fields?: Json;
          id?: string;
          search?: unknown;
          status?: Database['public']['Enums']['snippet_status'];
          tags?: string[];
          title?: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['visibility'];
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'snippets_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      visibility_log: {
        Row: {
          changed_by: string | null;
          created_at: string;
          field_key: string;
          from_level: string;
          id: string;
          is_reveal: boolean;
          item_id: string;
          kind: string;
          note: string;
          session_id: string | null;
          shared_with: string[];
          to_level: string;
          world_id: string;
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          field_key?: string;
          from_level: string;
          id?: string;
          is_reveal: boolean;
          item_id: string;
          kind: string;
          note?: string;
          session_id?: string | null;
          shared_with?: string[];
          to_level: string;
          world_id: string;
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          field_key?: string;
          from_level?: string;
          id?: string;
          is_reveal?: boolean;
          item_id?: string;
          kind?: string;
          note?: string;
          session_id?: string | null;
          shared_with?: string[];
          to_level?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visibility_log_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      visibility_shares: {
        Row: {
          created_at: string;
          created_by: string | null;
          field_key: string;
          id: string;
          item_id: string;
          kind: string;
          user_id: string;
          world_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          field_key?: string;
          id?: string;
          item_id: string;
          kind: string;
          user_id: string;
          world_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          field_key?: string;
          id?: string;
          item_id?: string;
          kind?: string;
          user_id?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visibility_shares_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visibility_shares_world_id_user_id_fkey';
            columns: ['world_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'world_members';
            referencedColumns: ['world_id', 'user_id'];
          },
        ];
      };
      world_members: {
        Row: {
          created_at: string;
          role: Database['public']['Enums']['world_role'];
          user_id: string;
          world_id: string;
        };
        Insert: {
          created_at?: string;
          role: Database['public']['Enums']['world_role'];
          user_id: string;
          world_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database['public']['Enums']['world_role'];
          user_id?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'world_members_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      worlds: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_campaign_invite: { Args: { p_token: string }; Returns: string };
      add_world_member: {
        Args: {
          p_email: string;
          p_role: Database['public']['Enums']['world_role'];
          p_world: string;
        };
        Returns: string;
      };
      autosave_snippet_body: {
        Args: {
          p_body: Json;
          p_id: string;
          p_mentions: string[];
          p_updated: string;
        };
        Returns: string;
      };
      can_read_image: {
        Args: { p_file: string; p_world: string };
        Returns: boolean;
      };
      graph_data: {
        Args: {
          p_category: string;
          p_center: string;
          p_depth: number;
          p_label: string;
          p_max_nodes: number;
          p_mentions: boolean;
          p_world: string;
        };
        Returns: Json;
      };
      leave_campaign: { Args: { p_campaign: string }; Returns: undefined };
      preview_campaign_invite: {
        Args: { p_token: string };
        Returns: {
          already_member: boolean;
          campaign_name: string;
          role: Database['public']['Enums']['campaign_role'];
        }[];
      };
      remove_campaign_member: {
        Args: { p_campaign: string; p_user: string };
        Returns: undefined;
      };
      restore_snippet_version: {
        Args: { p_snippet: string; p_updated: string; p_version: number };
        Returns: undefined;
      };
      save_snippet: {
        Args: {
          p_aliases: string[];
          p_body: Json;
          p_categories: string[];
          p_fields: Json;
          p_id: string;
          p_mentions: string[];
          p_status: Database['public']['Enums']['snippet_status'];
          p_tags: string[];
          p_title: string;
          p_updated: string;
        };
        Returns: undefined;
      };
      search_snippets: {
        Args: {
          p_category?: string;
          p_field_key?: string;
          p_field_value?: string;
          p_include_archived?: boolean;
          p_limit?: number;
          p_query?: string;
          p_relation?: string;
          p_status?: Database['public']['Enums']['snippet_status'];
          p_tags?: string[];
          p_world: string;
        };
        Returns: {
          excerpt: string;
          id: string;
          rank: number;
          status: Database['public']['Enums']['snippet_status'];
          tags: string[];
          title: string;
          updated_at: string;
        }[];
      };
      set_campaign_member_role: {
        Args: {
          p_campaign: string;
          p_role: Database['public']['Enums']['campaign_role'];
          p_user: string;
        };
        Returns: undefined;
      };
      set_visibility: {
        Args: {
          p_field: string;
          p_item: string;
          p_kind: string;
          p_level: Database['public']['Enums']['visibility'];
          p_note?: string;
          p_session?: string;
          p_users?: string[];
        };
        Returns: undefined;
      };
      transfer_world_ownership: {
        Args: { p_new_owner: string; p_world: string };
        Returns: undefined;
      };
    };
    Enums: {
      campaign_role: 'dm' | 'co_dm' | 'player' | 'observer';
      character_kind: 'pc' | 'npc';
      snippet_status: 'draft' | 'final';
      visibility: 'secret' | 'shared' | 'members' | 'public';
      world_role: 'owner' | 'editor' | 'commenter' | 'reader';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      campaign_role: ['dm', 'co_dm', 'player', 'observer'],
      character_kind: ['pc', 'npc'],
      snippet_status: ['draft', 'final'],
      visibility: ['secret', 'shared', 'members', 'public'],
      world_role: ['owner', 'editor', 'commenter', 'reader'],
    },
  },
} as const;
