import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: "learner" | "admin";
      preferredLocale: "vi" | "en";
    };
  }

  interface User {
    role: "learner" | "admin";
    preferredLocale: "vi" | "en";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "learner" | "admin";
    preferredLocale: "vi" | "en";
  }
}
