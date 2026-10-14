import { createAuthClient } from "better-auth/react";
import { emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";

// No baseURL: requests go to the current origin, so any port works in development.
export const authClient = createAuthClient({
  plugins: [
    emailOTPClient(),
    inferAdditionalFields({
      user: {
        role: { type: "string", input: false },
        isActive: { type: "boolean", input: false },
      },
    }),
  ],
});
