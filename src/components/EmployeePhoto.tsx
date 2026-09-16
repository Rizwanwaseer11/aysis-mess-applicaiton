import { useEffect, useRef, useState } from "react";
import { View, type StyleProp, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { loadEmployeePhoto, forgetEmployeePhoto } from "../lib/api";

export default function EmployeePhoto({
  path,
  previewId,
  style,
  onLoad,
  onError,
}: {
  path: string;
  previewId: string;
  style: StyleProp<ImageStyle>;
  onLoad: () => void;
  onError: () => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const mounted = useRef(false);
  const callbacks = useRef({ onLoad, onError });
  callbacks.current = { onLoad, onError };
  useEffect(() => {
    let current = true;
    mounted.current = true;
    setUri(null);
    void loadEmployeePhoto(path)
      .then((value) => {
        if (current) setUri(value);
      })
      .catch(() => {
        if (current) callbacks.current.onError();
      });
    return () => {
      current = false;
      mounted.current = false;
    };
  }, [path, previewId]);
  if (!uri) return <View style={style} />;
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="contain"
      cachePolicy="none"
      recyclingKey={previewId}
      accessibilityLabel="Employee identity photo"
      onLoad={() => {
        if (mounted.current) callbacks.current.onLoad();
      }}
      onError={() => {
        if (mounted.current) {
          void forgetEmployeePhoto(path).catch(() => {});
          callbacks.current.onError();
        }
      }}
    />
  );
}
