interface Window {
  Clerk?: {
    session?: {
      getToken: () => Promise<string | null>;
    };
  };
  __testRunId?: string;
}
