import { Image } from "expo-image";
export default function BrandLogo({ width = 130 }: { width?: number }) {
  return (
    <Image
      source={require("../../assets/aysis-logo.png")}
      accessibilityLabel="Aysis"
      contentFit="contain"
      style={{ width, height: (width * 801) / 1962, flexShrink: 0 }}
    />
  );
}
