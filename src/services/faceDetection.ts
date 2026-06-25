import { useCallback } from 'react';
import { useFaceDetection } from '@infinitered/react-native-mlkit-face-detection';

/**
 * Hook returning a function that resolves true if the image at `uri` contains
 * at least one human face.
 *
 * Fail-open: on any technical detection failure (detector unavailable,
 * result.success === false, or a thrown error) it returns true and warns, so a
 * model/engine glitch never blocks a real user. A successful detection that
 * finds zero faces returns false (blocking).
 *
 * Must be called from a component rendered inside <FaceDetectionProvider>.
 */
export function useFaceCheck(): (uri: string) => Promise<boolean> {
  const detector = useFaceDetection();
  return useCallback(
    async (uri: string): Promise<boolean> => {
      try {
        const result = await detector?.detectFaces(uri);
        if (!result || result.success === false) {
          console.warn('[faceCheck] detector unavailable/failed — allowing photo (fail-open)');
          return true;
        }
        return (result.faces?.length ?? 0) > 0;
      } catch (err) {
        console.warn('[faceCheck] detection error — allowing photo (fail-open):', err);
        return true;
      }
    },
    [detector],
  );
}
