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
      relations: {
        Row: {
          created_at: string;
          created_by: string;
          fields: Json;
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
      snippets: {
        Row: {
          aliases: string[];
          archived_at: string | null;
          body: Json;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          fields: Json;
          id: string;
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
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          fields?: Json;
          id?: string;
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
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          fields?: Json;
          id?: string;
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
      add_world_member: {
        Args: {
          p_email: string;
          p_role: Database['public']['Enums']['world_role'];
          p_world: string;
        };
        Returns: string;
      };
      save_snippet: {
        Args: {
          p_aliases: string[];
          p_body: Json;
          p_categories: string[];
          p_fields: Json;
          p_id: string;
          p_status: Database['public']['Enums']['snippet_status'];
          p_tags: string[];
          p_title: string;
          p_updated: string;
        };
        Returns: undefined;
      };
      transfer_world_ownership: {
        Args: { p_new_owner: string; p_world: string };
        Returns: undefined;
      };
    };
    Enums: {
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
      snippet_status: ['draft', 'final'],
      visibility: ['secret', 'shared', 'members', 'public'],
      world_role: ['owner', 'editor', 'commenter', 'reader'],
    },
  },
} as const;
