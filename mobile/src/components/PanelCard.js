import { StyleSheet, View } from "react-native";

export default function PanelCard({ children }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(31,107,58,0.12)",
    gap: 14,
  },
});
