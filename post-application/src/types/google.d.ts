/**
 * Ambient types for Google Identity Services.
 *
 * Deliberately covers only the three calls `GoogleSignInButton` makes. The SDK
 * is loaded from Google's CDN at runtime, so there is no package to take types
 * from, and hand-typing the whole surface would mean maintaining a copy of
 * someone else's API that drifts silently. `window.google` is optional because
 * until the script resolves — or if a content blocker eats it — it is genuinely
 * not there, and the compiler should force that check.
 */

/** The credential handed back after a successful sign-in. */
interface GoogleCredentialResponse {
  /**
   * A JWT ID token. Opaque on this side on purpose: the API verifies its
   * signature and audience against Google's keys before trusting any claim,
   * so nothing is decoded here.
   */
  credential: string;
  select_by?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

/** Google's own button. Options mirror the names GSI expects, snake_case included. */
interface GoogleButtonConfiguration {
  type: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  /** Pixels, not a percentage — GSI ignores anything it cannot parse as a number. */
  width?: number;
  logo_alignment?: 'left' | 'center';
}

interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GoogleButtonConfiguration): void;
  /** Closes any prompt still open, e.g. when the page unmounts mid-flow. */
  cancel(): void;
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId;
    };
  };
}
