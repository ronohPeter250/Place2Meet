import React, { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { FirebaseApp } from 'firebase/app';

export interface RecaptchaVerifier {
  type: string;
  verify: () => Promise<string>;
  _reset: () => void;
  render: () => Promise<number>;
}

interface Props {
  firebaseConfig: FirebaseApp['options'];
  attemptInvisibleVerification?: boolean;
}

export const FirebaseRecaptchaVerifierModal = forwardRef<RecaptchaVerifier, Props>(
  ({ firebaseConfig, attemptInvisibleVerification = true }, ref) => {
    const webviewRef = useRef<WebView | null>(null);
    const resolveRef = useRef<((token: string) => void) | null>(null);
    const rejectRef = useRef<((err: Error) => void) | null>(null);

    const verify = useCallback((): Promise<string> => {
      return new Promise((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;
        // Trigger verification in the already-loaded webview
        webviewRef.current?.injectJavaScript('startVerify(); true;');
        // Timeout after 15 seconds
        setTimeout(() => {
          if (rejectRef.current) {
            rejectRef.current(new Error('recaptcha-timeout'));
            rejectRef.current = null;
            resolveRef.current = null;
          }
        }, 15000);
      });
    }, []);

    useImperativeHandle(ref, () => ({
      type: 'recaptcha',
      verify,
      _reset: () => {},
      render: () => Promise.resolve(0),
    }));

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script src="https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.0.0/firebase-auth-compat.js"></script>
</head>
<body style="background:transparent;margin:0;padding:0;">
  <div id="recaptcha-container"></div>
  <script>
    var app = firebase.initializeApp(${JSON.stringify(firebaseConfig)});
    var verifier = null;

    function initVerifier() {
      try {
        verifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
          size: 'invisible',
          callback: function(token) {
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'resolve',token:token}));
          },
          'expired-callback': function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'reject',error:'expired'}));
          }
        });
        verifier.render();
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'reject',error:e.message}));
      }
    }

    function startVerify() {
      if (verifier) {
        verifier.verify().catch(function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'reject',error:e.message}));
        });
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'reject',error:'no-verifier'}));
      }
    }

    initVerifier();
  </script>
</body>
</html>`;

    const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'resolve' && resolveRef.current) {
          resolveRef.current(data.token);
          resolveRef.current = null;
          rejectRef.current = null;
        } else if (data.type === 'reject' && rejectRef.current) {
          rejectRef.current(new Error(data.error));
          resolveRef.current = null;
          rejectRef.current = null;
        }
      } catch {
        // ignore parse errors
      }
    }, []);

    return (
      <View style={styles.hidden}>
        <WebView
          ref={webviewRef}
          source={{ html }}
          onMessage={onMessage}
          style={styles.webview}
          javaScriptEnabled
          originWhitelist={['*']}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
