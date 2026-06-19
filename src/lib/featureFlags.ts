// src/lib/featureFlags.ts
// Toggle features on/off without deleting code. Flip to true to re-enable.
export const FEATURE_FLAGS = {
  // Sign-in button in NavBar + landing CTA. The /auth/signin route itself
  // still works if visited directly — this only hides the entry points.
  showSignIn: false,
};
