import { Box, CircularProgress } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGoogleAuthMutation } from '../api/apiSlice';
import { GOOGLE_CLIENT_ID } from '../config';
import { sessionEstablished } from '../store/authSlice';
import { useAppDispatch } from '../store/hooks';
import { useColorMode } from '../theme/ColorModeProvider';
import { radii } from '../theme/tokens';
import { getErrorMessage } from '../utils/errors';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** GSI clamps its own button between these; anything outside is silently ignored. */
const MIN_BUTTON_WIDTH = 200;
const MAX_BUTTON_WIDTH = 400;

/** Reserves the height of a `size: 'large'` button so the card does not jump when it lands. */
const BUTTON_HEIGHT = 44;

/**
 * One shared load, module-scoped rather than per-component.
 *
 * Both auth pages mount this, StrictMode double-invokes the effect that starts
 * it, and a remount on navigation would ask again — every one of those must end
 * up with a single `<script>`. A failure clears the promise instead of caching
 * the rejection forever, so a blocked request can succeed on a later attempt
 * once the blocker or the network is fixed.
 */
let gsiLoad: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve();
  if (gsiLoad) return gsiLoad;

  gsiLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiLoad = null;
      script.remove();
      reject(new Error('Could not reach Google. Check your connection or any content blocker.'));
    };
    document.head.appendChild(script);
  });

  return gsiLoad;
}

interface GoogleSignInButtonProps {
  /** Google's own copy: "Sign in with Google" or "Sign up with Google". */
  text: 'signin_with' | 'signup_with';
  /** Where to land once the session exists. Defaults to the feed. */
  redirectTo?: string;
  onError: (message: string) => void;
}

/**
 * "Continue with Google", rendered by Google rather than by us.
 *
 * The script is injected from here, lazily, instead of from `index.html`:
 * only these two routes need it, and every other page load would otherwise pay
 * for a third-party script it never calls. The button itself is drawn by
 * `renderButton` rather than styled by hand — Google's branding terms require
 * their button, and it brings its own popup handling, localisation and a11y.
 *
 * Renders nothing at all when no client ID is configured, so a developer
 * without a Google project sees a working password form rather than a widget
 * that can only fail.
 */
export function GoogleSignInButton({ text, redirectTo = '/', onError }: GoogleSignInButtonProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { mode } = useColorMode();
  const [googleAuth, { isLoading }] = useGoogleAuthMutation();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [width, setWidth] = useState(0);

  // Guards the exchange itself rather than relying on `isLoading`: the credential
  // arrives from outside React, so a second one could land before the state that
  // disables the overlay has rendered, and two exchanges would mint two sessions.
  const exchanging = useRef(false);
  const initialized = useRef(false);

  const handleCredential = async (response: GoogleCredentialResponse): Promise<void> => {
    if (exchanging.current) return;
    exchanging.current = true;

    try {
      const result = await googleAuth({ idToken: response.credential }).unwrap();
      dispatch(sessionEstablished(result.data));
      navigate(redirectTo, { replace: true });
    } catch (error) {
      onError(getErrorMessage(error, 'Could not sign you in with Google'));
    } finally {
      exchanging.current = false;
    }
  };

  // GSI keeps whichever function it was handed at `initialize` time and calls it
  // from outside React's event system, long after that render is gone. Passing
  // the handler directly would freeze that render's props — a `redirectTo` that
  // arrived later would be lost. Reassigning the refs on every render means the
  // callback always runs against current props.
  const credentialHandler = useRef(handleCredential);
  credentialHandler.current = handleCredential;
  const errorHandler = useRef(onError);
  errorHandler.current = onError;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let active = true;
    loadGsi()
      .then(() => {
        if (active) setSdkReady(true);
      })
      .catch((error: unknown) => {
        if (active) errorHandler.current(getErrorMessage(error, 'Could not load Google sign-in'));
      });

    return () => {
      active = false;
    };
  }, []);

  // GSI needs a pixel width; it cannot take the `100%` the card actually wants.
  // Measuring keeps the button flush with the inputs below it at every breakpoint.
  // The container is a plain block, so its width comes from the card and never
  // from the button inside it — no feedback loop with the observer.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const next = Math.round(container.getBoundingClientRect().width);
      setWidth((current) => (current === next ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const googleId = window.google?.accounts.id;
    if (!sdkReady || !googleId || !container || width === 0) return;

    // `initialize` writes GSI's single global config, and it warns in the console
    // when it is called twice. Once per mount is enough: the callback below only
    // forwards to a ref, so it never goes stale and never needs replacing when
    // the theme or the width changes — or when StrictMode replays this effect.
    if (!initialized.current) {
      initialized.current = true;
      googleId.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          void credentialHandler.current(response);
        },
      });
    }

    // `renderButton` appends, so a colour-mode flip or a resize would otherwise
    // stack a second button underneath the first.
    container.replaceChildren();
    googleId.renderButton(container, {
      type: 'standard',
      // A white button on a dark card reads as a rendering bug. GSI resolves the
      // theme once, when it draws — following the mode toggle means drawing again.
      theme: mode === 'dark' ? 'filled_black' : 'outline',
      size: 'large',
      text,
      shape: 'pill',
      width: Math.min(MAX_BUTTON_WIDTH, Math.max(MIN_BUTTON_WIDTH, width)),
      logo_alignment: 'left',
    });

    return () => googleId.cancel();
  }, [sdkReady, width, mode, text]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <Box sx={{ position: 'relative', minHeight: BUTTON_HEIGHT }}>
      {/* Left empty for GSI to fill. React must not own these children. */}
      <Box
        ref={containerRef}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          '& iframe': { colorScheme: 'normal' },
        }}
      />

      {isLoading && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radii.pill}px`,
            bgcolor: 'background.paper',
            opacity: 0.75,
          }}
        >
          <CircularProgress size={20} thickness={5} />
        </Box>
      )}
    </Box>
  );
}
