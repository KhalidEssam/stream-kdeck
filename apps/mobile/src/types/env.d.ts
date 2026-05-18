declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly EXPO_PUBLIC_SUPABASE_URL?: string;
      readonly EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
      readonly EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
      readonly EXPO_PUBLIC_PURCHASE_URL?: string;
      readonly EXPO_PUBLIC_UPGRADE_URL?: string;
      readonly EXPO_PUBLIC_AGENT_WS_URL?: string;
    }
  }

  var process: {
    env: NodeJS.ProcessEnv;
  };
}

export {};
